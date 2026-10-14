/**
 * Parallel foreground fan-out: can the prompt alone make main issue N Agent tool calls in ONE message,
 * and do N foreground (sync) workers then run in parallel while main blocks until all have finished?
 *
 * No hook changes any tool input: hooks here only record timings. Foreground is forced the documented way:
 *   CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1  (every subagent runs in the foreground)
 *   CLAUDE_CODE_FORK_SUBAGENT=0             (fork mode off)
 *
 * Usage:  npx tsx investigations/subagent-background-behaviour/parallel.ts [runs=1] [workers=5]
 */
import { query, type HookCallback, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ISOLATION_ENV, ISOLATION_SETTINGS, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const RUNS = Number(process.argv[2] ?? 1);
const N = Number(process.argv[3] ?? 5);
const TOKEN_RE_G = /WORKER_TOKEN=\d+/g;

function mainPrompt(): string {
  return loadPrompt("parallel-main", { n: N });
}

/** The SDK's child inherits this process's env: drop the parent Claude Code session's own variables. */
function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" };
}

async function runOnce(run: number) {
  const name = `parallel-${N}-run${run}`;
  const t0 = Date.now();
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  writeFileSync(logPath, "");
  const now = () => Date.now() - t0;
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = now();
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 110 ? v.slice(0, 110) + "…" : v) : JSON.stringify(v)}`)
      .join(" ");
    console.log(`[${name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(24)} ${brief}`);
  };

  let transcriptPath: string | undefined;
  const agentToolUsesByMessage = new Map<string, string[]>(); // main assistant message.id -> Agent tool_use ids
  const workers = new Map<string, { start?: number; end?: number; bg?: boolean; token?: string }>();
  const mainAgentReturns: number[] = [];
  const results: { t: number; origin: string; text: string; num_turns: number }[] = [];
  const toolResultMessages: { t: number; count: number }[] = [];
  const w = (id: string) => workers.get(id) ?? (workers.set(id, {}), workers.get(id)!);

  // observers only: every hook returns {} and changes nothing
  const pre: HookCallback = async (input: any) => {
    if (!input.agent_id) transcriptPath = input.transcript_path;
    log("hook", "PreToolUse(Agent)", { caller: input.agent_id ? input.agent_type : "main", input: input.tool_input });
    return {};
  };
  const post: HookCallback = async (input: any) => {
    const text = JSON.stringify(input.tool_response ?? "");
    if (input.tool_name === "Agent" && !input.agent_id) {
      mainAgentReturns.push(now());
      log("hook", "PostToolUse(Agent)", { caller: "main", returned: (text.match(TOKEN_RE_G) ?? []).join(" ") });
    } else if (input.agent_id) {
      const tok = text.match(TOKEN_RE_G)?.[0];
      if (tok) w(input.agent_id).token = tok;
      log("hook", `PostToolUse(${input.tool_name})`, { caller: input.agent_type, agent_id: input.agent_id, token: tok });
    }
    return {};
  };
  const subStart: HookCallback = async (input: any) => {
    w(input.agent_id).start = now();
    log("hook", "SubagentStart", { agent: input.agent_type, agent_id: input.agent_id });
    return {};
  };
  const subStop: HookCallback = async (input: any) => {
    w(input.agent_id).end = now();
    log("hook", "SubagentStop", { agent: input.agent_type, agent_id: input.agent_id, last: input.last_assistant_message });
    return {};
  };

  const q = query({
    prompt: mainPrompt(), // one-shot: the CLI alone decides when the session ends
    options: {
      cwd: process.cwd(),
      model: "sonnet",
      settingSources: ["project"],
      settings: ISOLATION_SETTINGS,
      allowedTools: ["Agent", "Bash"],
      permissionMode: "dontAsk",
      env: cleanEnv(),
      hooks: {
        PreToolUse: [{ matcher: "Agent", hooks: [pre] }],
        PostToolUse: [{ hooks: [post] }],
        SubagentStart: [{ hooks: [subStart] }],
        SubagentStop: [{ hooks: [subStop] }],
      },
    },
  });
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); q.close(); }, 8 * 60_000);

  for await (const m of q as AsyncIterable<SDKMessage>) {
    const a = m as any;
    if (m.type === "system" && a.subtype === "init") {
      recordClaudeVersion("sdk", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model });
    } else if (m.type === "system" && a.subtype === "task_started" && a.subagent_type === "slow-worker") {
      w(a.task_id).bg = a.is_backgrounded;
      log("stream", "task_started", { agent: a.subagent_type, task_id: a.task_id, is_backgrounded: a.is_backgrounded, spawn_depth: a.spawn_depth });
    } else if (m.type === "system" && a.subtype === "task_notification") {
      log("stream", "task_notification", { task_id: a.task_id, status: a.status, summary: a.summary });
    } else if (m.type === "assistant" && !a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) {
        if (b.type === "tool_use") {
          const ids = agentToolUsesByMessage.get(a.message.id) ?? [];
          if (b.name === "Agent") ids.push(b.id);
          agentToolUsesByMessage.set(a.message.id, ids);
          log("stream", "main tool_use", { message_id: a.message.id, name: b.name, input: b.input });
        } else if (b.type === "text") log("stream", "main text", { message_id: a.message.id, text: b.text });
      }
    } else if (m.type === "user" && !a.parent_tool_use_id) {
      const content = Array.isArray(a.message?.content) ? a.message.content : [];
      const n = content.filter((b: any) => b.type === "tool_result").length;
      if (n) toolResultMessages.push({ t: now(), count: n });
      log("stream", "main user", { tool_results: n, origin: a.origin?.kind });
    } else if (m.type === "result") {
      results.push({ t: now(), origin: a.origin?.kind ?? "prompt", text: a.result ?? "", num_turns: a.num_turns });
      log("stream", "RESULT", { origin: a.origin?.kind ?? "prompt", num_turns: a.num_turns, result: a.result, cost: a.total_cost_usd });
    }
  }
  clearTimeout(timeout);
  const sessionEnd = now();

  // ---- verdict ----
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

  const verdict = {
    run: name,
    env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" },
    hooks_modify_input: false,
    // 1. steering: N Agent calls in one assistant message
    agent_calls_per_main_message: groups.map(([id, ids]) => ({ message_id: id, agent_calls: ids.length })),
    check1_all_calls_in_one_message: groups.length === 1 && groups[0][1].length === N,
    // 2. all foreground
    workers_started: ws.length,
    workers_is_backgrounded: ws.map(([, v]) => v.bg),
    check2_all_foreground: ws.length === N && ws.every(([, v]) => v.bg === false),
    // 3. main blocked until all finished
    worker_tokens: workerTokens,
    main_tokens_in_first_result: mainTokens,
    check3_main_has_all_tokens_in_first_result:
      workerTokens.length === N && workerTokens.every((t) => mainTokens.includes(t)) && firstResult?.origin === "prompt",
    main_agent_calls_returned_s: mainAgentReturns.map((t) => t / 1000),
    tool_result_messages: toolResultMessages.map((x) => ({ at_s: x.t / 1000, tool_results: x.count })),
    first_result_s: firstResult ? firstResult.t / 1000 : null,
    last_worker_end_s: Math.max(...ends) / 1000,
    results: results.map((r) => ({ at_s: r.t / 1000, origin: r.origin, num_turns: r.num_turns })),
    // 4. parallelism
    worker_start_spread_s: (Math.max(...starts) - Math.min(...starts)) / 1000,
    all_overlap: Math.max(...starts) < Math.min(...ends),
    worker_durations_s: durations.map((d) => d / 1000),
    wall_clock_all_workers_s: wall / 1000,
    sum_of_worker_durations_s: sumDur / 1000,
    check4_parallel: Math.max(...starts) < Math.min(...ends) && wall < 0.5 * sumDur,
    session_ended_s: sessionEnd / 1000,
    transcript: transcriptPath ?? null,
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
    `## Parallel foreground fan-out (${N} workers, prompt-steered, no input-changing hooks)`,
    "",
    "| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | session ended (s) |",
    "|---|---|---|---|---|---|---|",
    ...verdicts.map((v) =>
      `| ${v.run} | ${yn(v.check1_all_calls_in_one_message)} (${v.agent_calls_per_main_message.map((g) => g.agent_calls).join("+")}) | ` +
      `${yn(v.check2_all_foreground)} | ${yn(v.check3_main_has_all_tokens_in_first_result)} (${v.main_tokens_in_first_result.length}/${v.worker_tokens.length}) | ` +
      `${yn(v.check4_parallel)} (${v.worker_start_spread_s} / ${v.wall_clock_all_workers_s} / ${v.sum_of_worker_durations_s}) | ${v.first_result_s} | ${v.session_ended_s} |`),
  ].join("\n");
  writeSummary(`parallel-${N}-summary.md`, md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
