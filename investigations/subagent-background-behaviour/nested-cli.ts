/**
 * The one-shot nested matrix of experiment.ts (1shot-* scenarios), WITHOUT the Agent SDK: headless `claude -p`.
 *
 *   direct:  main --Agent(fg|bg)--> slow-worker
 *   nested:  main --Agent(outer fg|bg)--> launcher --Agent(inner fg|bg)--> slow-worker
 *
 * sync/async comes from the prompt alone (no hook changes any input); task_started.is_backgrounded records the mode
 * the CLI actually used. Command hooks (hook-log.mjs) only append their input to a log.
 * The prompt goes on stdin, which then closes: one-shot, the CLI alone decides when to exit.
 *
 * Usage:  npx tsx investigations/subagent-background-behaviour/nested-cli.ts [scenario ...]   (default: all six)
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, latestRunDir, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Mode = "fg" | "bg";
type Scenario = { name: string; outer: Mode; inner: Mode; direct?: boolean; sdk: string };

// sdk = the matching experiment.ts scenario, for the side-by-side comparison
const ALL: Scenario[] = [
  { name: "cli-direct-fg", outer: "fg", inner: "fg", direct: true, sdk: "1shot-direct-fg" },
  { name: "cli-direct-bg", outer: "bg", inner: "bg", direct: true, sdk: "1shot-direct-bg" },
  { name: "cli-fg-fg", outer: "fg", inner: "fg", sdk: "1shot-fg-fg" },
  { name: "cli-fg-bg", outer: "fg", inner: "bg", sdk: "1shot-fg-bg" },
  { name: "cli-bg-fg", outer: "bg", inner: "fg", sdk: "1shot-bg-fg" },
  { name: "cli-bg-bg", outer: "bg", inner: "bg", sdk: "1shot-bg-bg" },
];

const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const PROJECT_LOGS = SESSIONS_DIR;
const TOKEN_RE = /WORKER_TOKEN=\d+/;

// same template as experiment.ts
function mainPrompt(s: Scenario): string {
  return loadPrompt("nested-main", { direct: !!s.direct, busy_main: !!(s as any).busyMain, outer_bg: s.outer === "bg", inner_bg: s.inner === "bg" });
}

/** The CLI inherits this process's env: drop the parent Claude Code session's own variables. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3" };
}

function hooksSettings(hookLog: string) {
  const cmd = `node "${join(LIB_DIR, "hook-log.mjs").replace(/\\/g, "/")}" "${hookLog.replace(/\\/g, "/")}"`;
  const h = [{ hooks: [{ type: "command", command: cmd }] }];
  return {
    ...ISOLATION_SETTINGS,
    hooks: {
      SubagentStart: h,
      SubagentStop: h,
      PreToolUse: [{ matcher: "Agent", hooks: [{ type: "command", command: cmd }] }],
      PostToolUse: [{ matcher: "Agent|Bash", hooks: [{ type: "command", command: cmd }] }],
    },
  };
}

async function runScenario(s: Scenario) {
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  const hookLog = join(RESULTS_DIR, `${s.name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${s.name}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(hookLog, "");
  writeFileSync(settingsPath, JSON.stringify(hooksSettings(hookLog), null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Bash", "--permission-mode", "dontAsk",
  ];

  const t0 = Date.now();
  const now = () => Date.now() - t0;
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = now();
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 100 ? v.slice(0, 100) + "…" : v) : JSON.stringify(v)}`)
      .join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(22)} ${brief}`);
  };

  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(mainPrompt(s));
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 6 * 60_000);

  let sessionId: string | undefined;
  let cliVersion: string | undefined;
  const taskBg = new Map<string, { type: string; bg: boolean; depth?: number }>();
  const results: { t: number; origin: string; text: string }[] = [];

  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version;
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model });
    } else if (a.type === "system" && a.subtype === "task_started" && a.subagent_type) {
      taskBg.set(a.task_id, { type: a.subagent_type, bg: a.is_backgrounded, depth: a.spawn_depth });
      log("stream", "task_started", { agent: a.subagent_type, is_backgrounded: a.is_backgrounded, spawn_depth: a.spawn_depth });
    } else if (a.type === "system" && a.subtype === "task_notification" && taskBg.has(a.task_id)) {
      log("stream", "task_notification", { agent: taskBg.get(a.task_id)!.type, status: a.status, summary: a.summary });
    } else if (a.type === "assistant" && !a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) {
        if (b.type === "tool_use") log("stream", "main tool_use", { name: b.name, input: b.input });
        if (b.type === "text") log("stream", "main text", { text: b.text });
      }
    } else if (a.type === "result") {
      results.push({ t: now(), origin: a.origin?.kind ?? "prompt", text: a.result ?? "" });
      log("stream", "RESULT", { origin: a.origin?.kind ?? "prompt", result: a.result, cost: a.total_cost_usd });
    }
  });
  const exitCode: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  const exited = now();
  log("runner", "claude -p exited", { code: exitCode });

  // ---- hook log -> timeline ----
  const hooks = readFileSync(hookLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const stops: Record<string, { t: number; last: string }[]> = {};
  const requestedBg: Record<string, boolean | undefined> = {};
  let workerToken: string | undefined;
  for (const h of hooks) {
    const t = h.t_epoch - t0;
    if (h.hook_event_name === "SubagentStop") (stops[h.agent_type] ??= []).push({ t, last: h.last_assistant_message ?? "" });
    if (h.hook_event_name === "PreToolUse") requestedBg[h.agent_id ? h.agent_type : "main"] = h.tool_input?.run_in_background;
    if (h.hook_event_name === "PostToolUse" && h.tool_name === "Bash") workerToken ??= JSON.stringify(h.tool_response ?? "").match(TOKEN_RE)?.[0];
    appendFileSync(logPath, JSON.stringify({ t, src: "hook", event: h.hook_event_name, agent: h.agent_type ?? "main", tool: h.tool_name }) + "\n");
  }

  // ---- session logs: main + launcher transcripts ----
  const mainLog = sessionId ? join(PROJECT_LOGS, `${sessionId}.jsonl`) : "";
  let launcherTranscript: { notifications: number; has_token: boolean } | null = null;
  const subDir = sessionId ? join(PROJECT_LOGS, sessionId, "subagents") : "";
  for (const [id, info] of taskBg)
    if (info.type === "launcher" && existsSync(join(subDir, `agent-${id}.jsonl`))) {
      const raw = readFileSync(join(subDir, `agent-${id}.jsonl`), "utf8");
      launcherTranscript = { notifications: raw.split("<task-notification>").length - 1, has_token: !!workerToken && raw.includes(workerToken) };
    }
  let tokenInMainLogVia: string | null = null;
  if (workerToken && existsSync(mainLog))
    for (const l of readFileSync(mainLog, "utf8").split("\n").filter(Boolean)) {
      const e = JSON.parse(l);
      if (e.type === "user" && !e.isSidechain && JSON.stringify(e.message ?? "").includes(workerToken)) {
        tokenInMainLogVia = e.origin?.kind === "task-notification" ? "task-notification turn" : "Agent tool result";
        break;
      }
    }

  const modeOf = (type: string) => [...taskBg.values()].find((v) => v.type === type)?.bg ?? null;
  const tokenResult = workerToken ? results.find((r) => r.text.includes(workerToken!)) : undefined;
  const lStop = stops["launcher"]?.[0];
  const wStop = stops["slow-worker"]?.[stops["slow-worker"].length - 1];
  const verdict = {
    scenario: s.name,
    driver: "claude -p (no SDK)",
    cli_version: cliVersion ?? null,
    chain: s.direct ? `main →${s.outer} worker` : `main →${s.outer} launcher →${s.inner} worker`,
    requested_run_in_background: requestedBg,
    launcher_is_backgrounded: s.direct ? null : modeOf("launcher"),
    worker_is_backgrounded: modeOf("slow-worker"),
    modes_as_intended:
      (s.direct || modeOf("launcher") === (s.outer === "bg")) && modeOf("slow-worker") === ((s.direct ? s.outer : s.inner) === "bg"),
    worker_token: workerToken ?? null,
    launcher_end_s: lStop ? lStop.t / 1000 : null,
    launcher_stop_count: stops["launcher"]?.length ?? 0,
    launcher_final_message: lStop?.last ?? null,
    launcher_got_token: s.direct ? null : !!workerToken && (stops["launcher"] ?? []).some((x) => x.last.includes(workerToken!)),
    launcher_transcript: launcherTranscript,
    worker_end_s: wStop ? wStop.t / 1000 : null,
    results: results.map((r) => ({ at_s: r.t / 1000, origin: r.origin, text: r.text })),
    token_reached_main: !!tokenResult,
    token_reached_main_how: tokenResult ? (tokenResult.origin === "prompt" ? "sync" : "callback") : null,
    token_in_main_log_via: tokenInMainLogVia,
    token_reached_main_at_s: tokenResult ? tokenResult.t / 1000 : null,
    process_exited_s: exited / 1000,
    exit_code: exitCode,
    main_log: mainLog,
  };
  writeFileSync(join(RESULTS_DIR, `${s.name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${s.name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const names = process.argv.slice(2);
  for (const s of names.length ? ALL.filter((x) => names.includes(x.name)) : ALL) await runScenario(s);

  const sdkDir = latestRunDir("experiment");
  const read = (dir: string | null, n: string) => { if (!dir) return null; try { return JSON.parse(readFileSync(join(dir, `${n}.verdict.json`), "utf8")); } catch { return null; } };
  const sdkHow = (v: any) => !v?.main?.token_reached_main ? "never" : v.main.token_reached_main_in_turn === "prompt" ? "sync" : "callback";
  const rows = ALL.map((s) => {
    const c = read(RESULTS_DIR, s.name), k = read(sdkDir, s.sdk);
    if (!c) return null;
    const sdkTokenAt = k?.main?.results?.find((r: any) => TOKEN_RE.test(r.text))?.at_s ?? "-";
    const cliLauncher = s.direct ? "–" : `${c.launcher_end_s}s, ${c.launcher_got_token ? "got token" : "no token"}`;
    const sdkLauncher = s.direct ? "–" : k ? `${k.launcher_first_stop_s}s, ${k.launcher_final_message_has_token ? "got token" : "no token"}` : "-";
    return `| ${c.chain} | ${c.modes_as_intended ? "yes" : "**NO**"} | ${cliLauncher} | ${sdkLauncher} | ${c.worker_end_s} / ${k?.worker_stop_s ?? "-"} | ` +
      `${c.token_reached_main_how ?? "**never**"} / ${sdkHow(k)} | ${c.token_reached_main_at_s ?? "-"} / ${sdkTokenAt} | ${c.process_exited_s} / ${k?.main?.query_iterator_ended_s ?? "-"} |`;
  }).filter(Boolean);
  const md = [
    "## Nested matrix, one-shot: headless `claude -p` vs Agent SDK",
    "",
    `Pairs are \`claude -p\` / SDK. Times in seconds from start. SDK values come from the experiment.ts \`1shot-*\` runs in results/${sdkDir ? sdkDir.split(/[\\/]/).pop() : "(none found)"}.`,
    "",
    "| chain | modes as intended (cli) | launcher ended, cli | launcher ended, SDK | worker ended | token reached main | token in main at | session ended |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
  writeSummary("nested-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
