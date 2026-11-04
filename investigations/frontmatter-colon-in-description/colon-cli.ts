/**
 * How does Claude Code parse an agent / skill frontmatter whose `description:` holds an unquoted ": " in the middle
 * (invalid strict YAML: "mapping values are not allowed here")? Headless `claude -p` only.
 *
 * Fixture: colon-agent and colon-skill have `... HEAD=<n> never needed note: TAIL=<n> for real work.`; control-agent and
 * control-skill have the same sentence without the colon. HEAD before the colon, TAIL after it, so the listing text shows
 * whether the description is kept whole, cut at the colon, or dropped. The agents have `tools: Read` after the
 * description, so the "(Tools: ...)" suffix of the agent listing shows whether the rest of the frontmatter still parsed.
 *
 * Recorded, no model judgement: the session .jsonl attachments agent_listing_delta and skill_listing (the exact text the
 * model receives), the stream-json system:init agents / skills names, and every debug-log line about the fixture files.
 *
 * Usage:  npx tsx investigations/frontmatter-colon-in-description/colon-cli.ts
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const ITEMS = [
  { kind: "agent", name: "colon-agent", head: "48213907", tail: "73950264" },
  { kind: "agent", name: "control-agent", head: "20571836", tail: "95316408" },
  { kind: "skill", name: "colon-skill", head: "82694150", tail: "14063972" },
  { kind: "skill", name: "control-skill", head: "69305284", tail: "28457916" },
];
const RUN = "colon";
const CLAUDE = process.env.CLAUDE_BIN ?? join(homedir(), ".local", "bin", "claude.exe");

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

async function main() {
  beginRun();
  const logPath = join(RESULTS_DIR, `${RUN}.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${RUN}.settings.json`);
  const debugPath = join(RESULTS_DIR, `${RUN}.debug.log`);
  writeFileSync(logPath, "");
  writeFileSync(settingsPath, JSON.stringify(ISOLATION_SETTINGS, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "haiku",
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Bash", "--permission-mode", "dontAsk",
    "--debug-file", debugPath,
  ];
  const t0 = Date.now();
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    console.log(`${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(14)} ${JSON.stringify(data).slice(0, 300)}`);
  };

  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(loadPrompt("main"));
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 3 * 60_000);

  let sessionId: string | undefined, cliVersion: string | undefined, initAgents: string[] = [], initSkills: string[] = [], result = "", cost: number | undefined;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version; initAgents = a.agents ?? []; initSkills = a.skills ?? [];
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, agents: initAgents, skills: initSkills });
    } else if (a.type === "result") {
      result = a.result ?? ""; cost = a.total_cost_usd;
      log("stream", "RESULT", { result, cost });
    }
  });
  const exitCode: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  log("runner", "claude -p exited", { code: exitCode });

  // ---- facts from the session log ----
  const session = sessionId ? join(SESSIONS_DIR, `${sessionId}.jsonl`) : "";
  const agentLines: string[] = [], skillLines: string[] = [];
  if (session && existsSync(session)) {
    for (const l of readFileSync(session, "utf8").split("\n").filter(Boolean)) {
      const att = JSON.parse(l).attachment;
      if (att?.type === "agent_listing_delta") agentLines.push(...(att.addedLines ?? []));
      if (att?.type === "skill_listing") skillLines.push(...String(att.content ?? "").split("\n"));
    }
  }
  const debug = existsSync(debugPath) ? readFileSync(debugPath, "utf8").split("\n") : [];
  const debugHits = debug.filter((l) => /colon-|control-|frontmatter|yaml|mapping values/i.test(l));

  const items = ITEMS.map((it) => {
    const lines = (it.kind === "agent" ? agentLines : skillLines).filter((l) => l.startsWith(`- ${it.name}`));
    const text = lines.join("\n");
    return {
      ...it,
      in_init: (it.kind === "agent" ? initAgents : initSkills).includes(it.name),
      listing_lines: lines,
      head_seen: text.includes(it.head),
      tail_seen: text.includes(it.tail),
      tools_suffix: it.kind === "agent" ? (text.match(/\(Tools: [^)]*\)\s*$/)?.[0] ?? null) : undefined,
    };
  });
  const verdict = {
    driver: "claude -p", cli_version: cliVersion ?? null, items, debug_log_lines: debugHits,
    final_answer: result, cost_usd: cost ?? null, exit_code: exitCode, session_log: session || null,
  };
  writeFileSync(join(RESULTS_DIR, `${RUN}.verdict.json`), JSON.stringify(verdict, null, 2));

  const md = [
    "## Unquoted `: ` inside a frontmatter description: headless `claude -p`",
    "",
    "| item | in system:init | HEAD (before colon) | TAIL (after colon) | tools suffix | listing line(s) |",
    "|---|---|---|---|---|---|",
    ...items.map((i) => `| ${i.name} | ${i.in_init} | ${i.head_seen} | ${i.tail_seen} | ${i.tools_suffix ?? (i.kind === "agent" ? "none" : "n/a")} | ${i.listing_lines.map((x) => "`" + x.replace(/\|/g, "\\|") + "`").join("<br>") || "(none)"} |`),
    "",
    `### Debug-log lines matching the fixture or frontmatter/yaml (${debugHits.length})`,
    "",
    "```",
    ...debugHits,
    "```",
  ].join("\n");
  writeSummary(`${RUN}-cli-summary.md`, md);
  console.log("\n" + md);
}

main().catch((e) => { console.error(e); process.exit(1); });
