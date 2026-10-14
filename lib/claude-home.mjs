// Shared harness for the drivers in investigations/<folder>/*.ts: binds a run to its investigation folder and isolates it.
// Every driver imports it before anything else.
//
//   npx tsx investigations/<folder>/<driver>.ts [driver args...]
//   node lib/claude-home.mjs investigations/<folder> --check          one cheap claude -p run that prints what it loaded
//   node lib/claude-home.mjs investigations/<folder> [claude args...] interactive claude, isolated, credentials synced
//
// The investigation folder is the folder of the driver script (for the CLI forms above: argv[2], which is then removed).
// On import it chdirs there, so `.claude/` and CLAUDE.md of that folder are the fixture each run loads.
// - beginRun(): first call in main(). Syncs credentials (below) and creates RESULTS_DIR, results/<YYYY-MM-DD>-<HHMM>-
//   <driver>/ inside the folder, with a run.json (args, versions, git commit, hashes of lib/ and of the investigation's
//   files) so a run can be tied back to the exact code and fixture.
// - recordClaudeVersion(via, version): call it with the claude_code_version of each session's system:init, via "sdk"
//   (the SDK runs the Claude Code it bundles) or "cli" (the installed claude). Only the versions that ran are recorded.
// - writeSummary(file, markdown): writes a summary into RESULTS_DIR under a header with the run, versions and git commit.
// - loadPrompt(name, vars): renders prompts/<name>.md from the folder. {{var}} is replaced, {{#var}}...{{/var}} is kept
//   only when var is truthy and {{^var}}...{{/var}} only when it is falsy.
// - ISOLATION_ENV: CLAUDE_CONFIG_DIR=<folder>/.claude-home, CLAUDE_CODE_PROJECT_DIR_NAME=sessions, so session logs
//   land in <folder>/.claude-home/projects/sessions/<id>.jsonl (+ <id>/subagents/agent-<agentId>.jsonl).
// - ISOLATION_SETTINGS (SDK `settings`, or merged into the CLI --settings file): skips the CLAUDE.md / AGENTS.md / rules
//   files of every ancestor directory (the repo root CLAUDE.md included) and keeps transcripts from the 30-day sweep.
// - Credentials: the run shares the login in ~/.claude/.credentials.json. Whichever copy holds the later expiresAt
//   wins and is written over the other, at start and at exit, so a token refreshed during a run goes back home.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
export const LIB_DIR = dirname(SELF);
const REPO_ROOT = dirname(LIB_DIR);
const INVESTIGATIONS = join(REPO_ROOT, "investigations");
const IS_CLI = !!process.argv[1] && resolve(process.argv[1]) === SELF;

const dir = IS_CLI ? process.argv[2] : dirname(resolve(process.argv[1] ?? "."));
if (!dir || !existsSync(dir) || !statSync(dir).isDirectory() || dirname(resolve(dir)) !== INVESTIGATIONS) {
  console.error(IS_CLI
    ? `usage: node lib/claude-home.mjs investigations/<folder> [--check | claude args...]   (got: ${dir ?? "nothing"})`
    : `drivers must live directly in investigations/<folder>/ (this one is in ${dir})`);
  process.exit(2);
}
export const INVESTIGATION_DIR = resolve(dir);
if (IS_CLI) process.argv.splice(2, 1);
process.chdir(INVESTIGATION_DIR);

export const CONFIG_DIR = join(INVESTIGATION_DIR, ".claude-home");
const PROJECT_DIR_NAME = "sessions";
export const SESSIONS_DIR = join(CONFIG_DIR, "projects", PROJECT_DIR_NAME);
export const ISOLATION_ENV = { CLAUDE_CONFIG_DIR: CONFIG_DIR, CLAUDE_CODE_PROJECT_DIR_NAME: PROJECT_DIR_NAME };

const fwd = (p) => p.replace(/\\/g, "/");

function ancestorInstructionExcludes() {
  const out = [];
  for (let d = dirname(INVESTIGATION_DIR); ; d = dirname(d)) {
    const p = fwd(d).replace(/\/$/, "");
    out.push(`${p}/CLAUDE.md`, `${p}/CLAUDE.local.md`, `${p}/AGENTS.md`, `${p}/.claude/CLAUDE.md`, `${p}/.claude/rules/**`);
    if (dirname(d) === d) return out;
  }
}
export const ISOLATION_SETTINGS = { claudeMdExcludes: ancestorInstructionExcludes(), cleanupPeriodDays: 36500 };

const CLAUDE = existsSync(join(homedir(), ".local", "bin", "claude.exe")) ? join(homedir(), ".local", "bin", "claude.exe") : "claude";

// ---- prompts ----

export function loadPrompt(name, vars = {}) {
  const path = join(INVESTIGATION_DIR, "prompts", `${name}.md`);
  if (!existsSync(path)) throw new Error(`missing prompt template ${relative(REPO_ROOT, path)}`);
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n").replace(/\n+$/, "")
    .replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind, key, body) => (!!vars[key] === (kind === "#") ? body : ""))
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      if (!(key in vars)) throw new Error(`${relative(REPO_ROOT, path)}: no value for {{${key}}}`);
      return String(vars[key]);
    });
  return text;
}

// ---- results ----

function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16); }
function filesUnder(d, skip = []) {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).filter((e) => !skip.includes(e.name))
    .flatMap((e) => (e.isDirectory() ? filesUnder(join(d, e.name)) : [join(d, e.name)]));
}
function git(...args) {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const DRIVER = basename(process.argv[1] ?? "run", extname(process.argv[1] ?? ""));
const STAMP = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
export const RESULTS_DIR = join(INVESTIGATION_DIR, "results", `${STAMP}-${DRIVER}`);
const RUN_JSON = join(RESULTS_DIR, "run.json");
let run = null;

function saveRun() { writeFileSync(RUN_JSON, JSON.stringify(run, null, 2)); }

/** First call in every driver's main(): syncs credentials (again at exit) and creates RESULTS_DIR with its run.json. */
export function beginRun() {
  syncCredentialsAroundRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const files = [...filesUnder(LIB_DIR), ...filesUnder(INVESTIGATION_DIR, ["results", ".claude-home", "node_modules", "REPORT.html"])];
  run = {
    driver: `${basename(process.argv[1])}`, args: process.argv.slice(2), investigation: fwd(relative(REPO_ROOT, INVESTIGATION_DIR)),
    started: now.toISOString(),
    versions: { node: process.version, claude_code: {} },
    git: { commit: git("rev-parse", "HEAD"), dirty: (git("status", "--porcelain") ?? "") !== "" },
    sha256: Object.fromEntries(files.map((f) => [fwd(relative(REPO_ROOT, f)), sha256(f)])),
  };
  saveRun();
}

/** Records the Claude Code version a session actually ran: via "sdk" (bundled with the Agent SDK) or "cli" (installed). */
export function recordClaudeVersion(via, version) {
  if (!run || !version || run.versions.claude_code[via] === version) return;
  run.versions.claude_code[via] = version;
  if (via === "sdk") {
    const pkg = join(REPO_ROOT, "node_modules", "@anthropic-ai", "claude-agent-sdk", "package.json");
    run.versions.agent_sdk = existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : null;
  }
  saveRun();
}

/** Markdown header for a summary: the run folder, driver, versions that ran and git commit, from a run.json object. */
export function summaryHeader(r, runDir) {
  const cc = r.versions?.claude_code ?? {};
  const ran = [cc.sdk && `${cc.sdk} via Agent SDK ${r.versions.agent_sdk ?? "?"}`, cc.cli && `${cc.cli} via installed \`claude -p\``].filter(Boolean);
  const commit = r.git?.commit ? `${r.git.commit.slice(0, 7)}${r.git.dirty ? " (uncommitted changes)" : ""}` : "not recorded";
  const t = r.started ? new Date(r.started) : null;
  const started = t ? `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}${r.reconstructed ? " (approx.)" : ""}` : "?";
  const args = r.args == null ? "(args not recorded)" : r.args.length ? `\`${r.args.join(" ")}\`` : "(no args)";
  return [
    `> **Run** \`results/${basename(runDir)}\` · \`${r.driver}\` ${args} · started ${started}`,
    `> **Claude Code** ${ran.length ? ran.join("; ") : "not recorded"} · **git** ${commit}`,
  ].join("\n");
}

/** Writes RESULTS_DIR/<file> as the run header followed by the driver's markdown. */
export function writeSummary(file, markdown) {
  writeFileSync(join(RESULTS_DIR, file), `${summaryHeader(run ?? {}, RESULTS_DIR)}\n\n${markdown}\n`);
}

/** Newest earlier run folder of another driver in this investigation (e.g. to compare against its verdicts). */
export function latestRunDir(driver) {
  const d = join(INVESTIGATION_DIR, "results");
  const hits = readdirSync(d).filter((x) => x.endsWith(`-${driver}`) && join(d, x) !== RESULTS_DIR).sort();
  return hits.length ? join(d, hits[hits.length - 1]) : null;
}

// ---- credentials ----

const HOME_CREDS = join(homedir(), ".claude", ".credentials.json");
const LOCAL_CREDS = join(CONFIG_DIR, ".credentials.json");

function expiresAt(path) {
  try { return JSON.parse(readFileSync(path, "utf8")).claudeAiOauth?.expiresAt ?? -1; } catch { return -1; }
}

/** Write src over dst through a temp file + rename, so a reader never sees a half-written file. */
function replace(src, dst) {
  const tmp = `${dst}.sync-${process.pid}.tmp`;
  copyFileSync(src, tmp);
  renameSync(tmp, dst);
}

function syncCredentials() {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const home = expiresAt(HOME_CREDS), local = expiresAt(LOCAL_CREDS);
  if (home < 0 && local < 0) throw new Error(`No Claude Code login found in ${HOME_CREDS}: run claude and /login first`);
  if (home > local) replace(HOME_CREDS, LOCAL_CREDS);
  else if (local > home) replace(LOCAL_CREDS, HOME_CREDS);
}

/** Sync now and again when the process exits, including on Ctrl+C. */
function syncCredentialsAroundRun() {
  syncCredentials();
  process.on("exit", () => { try { syncCredentials(); } catch (e) { console.error("credential sync failed:", e); } });
  process.on("SIGINT", () => process.exit(130));
}

// ---- CLI ----

/** process.env without the CLAUDE* vars of an outer Claude Code session, plus the isolation vars. */
function claudeEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

function checkIsolation() {
  syncCredentialsAroundRun();
  const log = join(tmpdir(), `isolation-check-${process.pid}.hooks.jsonl`);
  writeFileSync(log, "");
  const hook = [{ hooks: [{ type: "command", command: `node "${fwd(join(LIB_DIR, "hook-log.mjs"))}" "${fwd(log)}"` }] }];
  const settings = { ...ISOLATION_SETTINGS, hooks: { InstructionsLoaded: hook, SessionStart: hook } };
  const r = spawnSync(CLAUDE, [
    "-p", "Reply with the single word OK.", "--model", "haiku", "--max-turns", "1", "--no-session-persistence",
    "--output-format", "stream-json", "--verbose", "--setting-sources", "project", "--settings", JSON.stringify(settings),
  ], { env: claudeEnv(), encoding: "utf8", input: "" });
  const events = (r.stdout ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? {};
  const result = events.find((e) => e.type === "result") ?? {};
  const hooks = readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const instructions = hooks.filter((h) => h.hook_event_name === "InstructionsLoaded").map((h) => h.file_path);
  const norm = (p) => (process.platform === "win32" ? resolve(p).toLowerCase() : resolve(p));
  const leaks = instructions.filter((p) => !norm(p).startsWith(norm(INVESTIGATION_DIR) + sep));
  console.log(JSON.stringify({
    exit: r.status, result: result.result ?? result.subtype ?? null, cli: init.claude_code_version, cwd: init.cwd,
    transcript_path: hooks.find((h) => h.transcript_path)?.transcript_path ?? null,
    instructions_loaded: instructions, instructions_from_outside_folder: leaks,
    agents: init.agents, skills: init.skills, plugins: init.plugins?.map((p) => p.name), mcp_servers: init.mcp_servers?.map((m) => m.name),
    stderr: (r.stderr ?? "").trim().slice(0, 2000) || undefined,
  }, null, 2));
  process.exitCode = r.status === 0 && leaks.length === 0 ? 0 : 1;
}

if (IS_CLI) {
  if (process.argv[2] === "--check") checkIsolation();
  else {
    syncCredentialsAroundRun();
    const r = spawnSync(CLAUDE, ["--settings", JSON.stringify(ISOLATION_SETTINGS), ...process.argv.slice(2)], { stdio: "inherit", env: claudeEnv() });
    process.exitCode = r.status ?? 1;
  }
}
