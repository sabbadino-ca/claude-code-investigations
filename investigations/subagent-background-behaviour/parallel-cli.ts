/**
 * Same test as parallel.ts, but WITHOUT the Agent SDK: drives headless `claude -p` directly.
 *
 * Can the prompt alone make main issue N Agent tool calls in ONE message, and do N foreground (sync) workers
 * then run in parallel while main blocks until all have finished?
 *
 * - CLI: the globally installed claude.exe, run as
 *     claude -p --output-format stream-json --verbose --model sonnet --setting-sources project
 *            --settings <hooks file> --allowedTools Agent Bash --permission-mode dontAsk
 *   with the prompt on stdin (stdin then closes: one-shot, the CLI alone decides when to exit).
 * - Foreground forced only by env: CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, CLAUDE_CODE_FORK_SUBAGENT=0.
 * - Evidence: every stdout line (stream-json events) timestamped on arrival; command hooks (hook-log.mjs)
 *   that only append SubagentStart / SubagentStop / PostToolUse(Bash) inputs to a log; the session transcript.
 *
 * Usage:  npx tsx investigations/subagent-background-behaviour/parallel-cli.ts [runs=1] [workers=5]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const RUNS = Number(process.argv[2] ?? 1);
const N = Number(process.argv[3] ?? 5);
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const PROJECT_LOGS = SESSIONS_DIR;
const TOKEN_RE_G = /WORKER_TOKEN=\d+/g;

function mainPrompt(): string {
  return loadPrompt("parallel-main", { n: N });
}

/** The CLI inherits this process's env: drop the parent Claude Code session's own variables. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" };
}

function hooksSettings(hookLog: string) {
  const cmd = `node "${join(LIB_DIR, "hook-log.mjs").replace(/\\/g, "/")}" "${hookLog.replace(/\\/g, "/")}"`;
  const h = [{ hooks: [{ type: "command", command: cmd }] }];
  return {
    ...ISOLATION_SETTINGS,
    hooks: {
      SubagentStart: h,
      SubagentStop: h,
      PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: cmd }] }],
    },
  };
}

async function runOnce(run: number) {
  const name = `parallel-cli-${N}-run${run}`;
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  const hookLog = join(RESULTS_DIR, `${name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
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
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 110 ? v.slice(0, 110) + "…" : v) : JSON.stringify(v)}`)
      .join(" ");
    console.log(`[${name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(24)} ${brief}`);
  };
  log("runner", "spawn", { cli: CLAUDE, args: args.join(" ") });

  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(mainPrompt());
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 8 * 60_000);

  let sessionId: string | undefined;
  let cliVersion: string | undefined;
  const agentToolUsesByMessage = new Map<string, string[]>();
  const workerTask = new Map<string, { bg?: boolean; startedStream?: number }>();
  const results: { t: number; origin: string; text: string; num_turns: number }[] = [];
  const toolResultMessages: { t: number; count: number }[] = [];

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { log("stdout", "non-json", { text: line }); return; }
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version;
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, session: a.session_id });
    } else if (a.type === "system" && a.subtype === "task_started" && a.subagent_type === "slow-worker") {
      workerTask.set(a.task_id, { bg: a.is_backgrounded, startedStream: now() });
      log("stream", "task_started", { agent: a.subagent_type, task_id: a.task_id, is_backgrounded: a.is_backgrounded, spawn_depth: a.spawn_depth });
    } else if (a.type === "system" && a.subtype === "task_notification") {
      log("stream", "task_notification", { task_id: a.task_id, status: a.status, summary: a.summary });
    } else if (a.type === "assistant" && !a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) {
        if (b.type === "tool_use") {
          const ids = agentToolUsesByMessage.get(a.message.id) ?? [];
          if (b.name === "Agent") ids.push(b.id);
          agentToolUsesByMessage.set(a.message.id, ids);
          log("stream", "main tool_use", { message_id: a.message.id, name: b.name, input: b.input });
        } else if (b.type === "text") log("stream", "main text", { message_id: a.message.id, text: b.text });
      }
    } else if (a.type === "user" && !a.parent_tool_use_id) {
      const content = Array.isArray(a.message?.content) ? a.message.content : [];
      const n = content.filter((b: any) => b.type === "tool_result").length;
      if (n) toolResultMessages.push({ t: now(), count: n });
      log("stream", "main user", { tool_results: n, origin: a.origin?.kind });
    } else if (a.type === "result") {
      results.push({ t: now(), origin: a.origin?.kind ?? "prompt", text: a.result ?? "", num_turns: a.num_turns });
      log("stream", "RESULT", { origin: a.origin?.kind ?? "prompt", num_turns: a.num_turns, result: a.result, cost: a.total_cost_usd });
    }
  });
  const exitCode: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  const processExited = now();
  log("runner", "claude -p exited", { code: exitCode });

  // ---- hooks (wall-clock stamped) -> same timeline ----
  const hooks = readFileSync(hookLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const workers = new Map<string, { start?: number; end?: number; token?: string; last?: string }>();
  const w = (id: string) => workers.get(id) ?? (workers.set(id, {}), workers.get(id)!);
  for (const h of hooks) {
    const t = h.t_epoch - t0;
    if (h.hook_event_name === "SubagentStart") w(h.agent_id).start = t;
    if (h.hook_event_name === "SubagentStop") { w(h.agent_id).end = t; w(h.agent_id).last = h.last_assistant_message; }
    if (h.hook_event_name === "PostToolUse" && h.agent_id) {
      const tok = JSON.stringify(h.tool_response ?? "").match(TOKEN_RE_G)?.[0];
      if (tok) w(h.agent_id).token = tok;
    }
    appendFileSync(logPath, JSON.stringify({ t, src: "hook", event: h.hook_event_name, agent: h.agent_type, agent_id: h.agent_id }) + "\n");
  }

  // ---- verdict (same checks as parallel.ts) ----
  const ws = [...workers.entries()].filter(([, v]) => v.start !== undefined);
  const starts = ws.map(([, v]) => v.start!);
  const ends = ws.map(([, v]) => v.end ?? Infinity);
  const workerTokens = ws.map(([, v]) => v.token).filter(Boolean) as string[];
  const firstResult = results[0];
  const mainTokens = firstResult ? [...new Set(firstResult.text.match(TOKEN_RE_G) ?? [])] : [];
  const durations = ws.map(([, v]) => (v.end ?? 0) - v.start!);
  const sumDur = durations.reduce((x, y) => x + y, 0);
  const wall = Math.max(...ends) - Math.min(...starts);
  const groups = [...agentToolUsesByMessage.entries()].filter(([, ids]) => ids.length);
  const transcript = sessionId ? join(PROJECT_LOGS, `${sessionId}.jsonl`) : null;

  const verdict = {
    run: name,
    driver: "claude -p (no SDK)",
    cli: CLAUDE,
    cli_version: cliVersion ?? null,
    env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" },
    hooks_modify_input: false,
    agent_calls_per_main_message: groups.map(([id, ids]) => ({ message_id: id, agent_calls: ids.length })),
    check1_all_calls_in_one_message: groups.length === 1 && groups[0][1].length === N,
    workers_started: ws.length,
    workers_is_backgrounded: [...workerTask.values()].map((v) => v.bg),
    check2_all_foreground: workerTask.size === N && [...workerTask.values()].every((v) => v.bg === false),
    worker_tokens: workerTokens,
    main_tokens_in_first_result: mainTokens,
    check3_main_has_all_tokens_in_first_result:
      workerTokens.length === N && workerTokens.every((t) => mainTokens.includes(t)) && firstResult?.origin === "prompt",
    tool_result_messages: toolResultMessages.map((x) => ({ at_s: x.t / 1000, tool_results: x.count })),
    first_result_s: firstResult ? firstResult.t / 1000 : null,
    last_worker_end_s: Math.max(...ends) / 1000,
    results: results.map((r) => ({ at_s: r.t / 1000, origin: r.origin, num_turns: r.num_turns })),
    worker_start_spread_s: (Math.max(...starts) - Math.min(...starts)) / 1000,
    all_overlap: Math.max(...starts) < Math.min(...ends),
    worker_durations_s: durations.map((d) => d / 1000),
    wall_clock_all_workers_s: wall / 1000,
    sum_of_worker_durations_s: sumDur / 1000,
    check4_parallel: Math.max(...starts) < Math.min(...ends) && wall < 0.5 * sumDur,
    process_exit_code: exitCode,
    process_exited_s: processExited / 1000,
    transcript: transcript && existsSync(transcript) ? transcript : transcript ? `${transcript} (not found)` : null,
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const verdicts = [];
  for (let r = 1; r <= RUNS; r++) verdicts.push(await runOnce(r));
  const yn = (b: boolean) => (b ? "PASS" : "**FAIL**");
  const md = [
    `## Parallel foreground fan-out via \`claude -p\` (${N} workers, prompt-steered, no SDK, no input-changing hooks)`,
    "",
    "| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | process exited (s) |",
    "|---|---|---|---|---|---|---|",
    ...verdicts.map((v) =>
      `| ${v.run} | ${yn(v.check1_all_calls_in_one_message)} (${v.agent_calls_per_main_message.map((g) => g.agent_calls).join("+")}) | ` +
      `${yn(v.check2_all_foreground)} | ${yn(v.check3_main_has_all_tokens_in_first_result)} (${v.main_tokens_in_first_result.length}/${v.worker_tokens.length}) | ` +
      `${yn(v.check4_parallel)} (${v.worker_start_spread_s} / ${v.wall_clock_all_workers_s} / ${v.sum_of_worker_durations_s}) | ${v.first_result_s} | ${v.process_exited_s} |`),
  ].join("\n");
  writeSummary(`parallel-cli-${N}-summary.md`, md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
