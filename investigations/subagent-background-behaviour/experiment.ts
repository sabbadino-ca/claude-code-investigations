/**
 * Experiment: in the Agent SDK, does a subagent that launches a nested subagent
 * wait for that nested subagent before it finishes?
 *
 * Docs claim (code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents):
 *   "In non-interactive mode and the Agent SDK, the launching subagent doesn't wait,
 *    so a nested background subagent that finishes after its launcher has ended
 *    reports to your main conversation instead."
 *
 * Topology:  main  --Agent(outer)-->  launcher  --Agent(inner)-->  slow-worker (sleep 40s, returns random token)
 *
 * Each scenario fixes outer/inner foreground-vs-background. The PreToolUse hook enforces the
 * run_in_background value on every Agent call (and records whether the model already chose it),
 * and task_started.is_backgrounded confirms the mode the harness actually used.
 *
 * Usage:  npx tsx investigations/subagent-background-behaviour/experiment.ts [scenario ...]
 *   scenarios: fg-bg  fg-fg  bg-bg  bg-fg   (outer-inner). Default: all four.
 */
import { query, type HookCallback, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ISOLATION_ENV, ISOLATION_SETTINGS, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Mode = "fg" | "bg";
/**
 * input: how the SDK client feeds the main conversation
 *   "open"   streaming input kept open until all background work has drained (default)
 *   "close"  streaming input closed as soon as the first result arrives
 *   "string" plain string prompt (one-shot, the SDK closes stdin itself)
 * busyMain: after the launcher returns, main runs its own 70 s command, so the worker finishes mid-turn
 */
/** direct: main calls slow-worker itself (no launcher); `outer` is then the worker's mode and `inner` is unused */
type Scenario = { name: string; outer: Mode; inner: Mode; input?: "open" | "close" | "string"; busyMain?: boolean; direct?: boolean };

const ALL: Scenario[] = [
  { name: "fg-bg", outer: "fg", inner: "bg" },
  { name: "fg-fg", outer: "fg", inner: "fg" },
  { name: "bg-bg", outer: "bg", inner: "bg" },
  { name: "bg-fg", outer: "bg", inner: "fg" },
  // main-conversation behaviour (all with a background worker that outlives its launcher)
  { name: "main-busy", outer: "fg", inner: "bg", busyMain: true },
  { name: "main-close", outer: "fg", inner: "bg", input: "close" },
  { name: "main-string", outer: "fg", inner: "bg", input: "string" },
  // main calls the worker directly, no launcher in between
  { name: "direct-fg", outer: "fg", inner: "fg", direct: true },
  { name: "direct-bg", outer: "bg", inner: "bg", direct: true },
  // one-shot string prompt: nothing in this script holds the session open, so the CLI alone decides when it ends
  { name: "1shot-direct-fg", outer: "fg", inner: "fg", direct: true, input: "string" },
  { name: "1shot-direct-bg", outer: "bg", inner: "bg", direct: true, input: "string" },
  { name: "1shot-fg-fg", outer: "fg", inner: "fg", input: "string" },
  { name: "1shot-fg-bg", outer: "fg", inner: "bg", input: "string" },
  { name: "1shot-bg-fg", outer: "bg", inner: "fg", input: "string" },
  { name: "1shot-bg-bg", outer: "bg", inner: "bg", input: "string" },
];

const HARD_TIMEOUT_MS = 6 * 60_000;
const QUIET_GRACE_MS = 10_000;

const TOKEN_RE = /WORKER_TOKEN=\d+/;

function mainPrompt(s: Scenario): string {
  return loadPrompt("nested-main", { direct: !!s.direct, busy_main: !!s.busyMain, outer_bg: s.outer === "bg", inner_bg: s.inner === "bg" });
}

/** Main-thread entries of the session transcript: exactly what the main model was fed, minus static context. */
function mainTranscriptExcerpt(path: string): string {
  const skip = new Set(["environment", "model", "deferred_tools_delta", "agent_listing_delta", "skill_listing", "total_tokens_reminder",
    "session_context", "date", "credential_org", "prompt_snapshot", "mcp_instructions_delta", "remote_session_change"]);
  const out: string[] = [];
  let raw = "";
  try { raw = readFileSync(path, "utf8"); } catch { return `(transcript not found: ${path})`; }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (["file-history-snapshot", "atis-latch", "last-prompt", "ai-title", "cost-state"].includes(e.type)) continue;
    if (e.type === "attachment" && skip.has(e.attachment?.type)) continue;
    const c = e.message?.content;
    const body = typeof c === "string" ? c
      : Array.isArray(c) ? c.map((b: any) => `${b.type}: ${b.text ?? JSON.stringify(b.content ?? b.input)}`).join("\n")
      : JSON.stringify({ content: e.content, attachment: e.attachment, operation: e.operation });
    const meta = ["origin", "operation"].filter((k) => k in e).map((k) => `${k}=${JSON.stringify(e[k])}`).join(" ");
    out.push(`--- ${String(e.timestamp ?? "").slice(11, 23)} ${e.type} ${meta}\n${body}`);
  }
  return out.join("\n");
}

async function runScenario(s: Scenario) {
  const t0 = Date.now();
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  writeFileSync(logPath, "");

  const agentTypeById = new Map<string, string>(); // agent_id/task_id -> agent type
  const stops: { t: number; type: string; id: string; last: string; bgTasks: number }[] = [];
  const taskStarts: Record<string, any> = {};
  const taskEnds: Record<string, { t: number; via: string; status?: string }> = {};
  const agentToolReturns: { t: number; caller: string; text: string }[] = [];
  const mainTexts: { t: number; origin: string; text: string }[] = [];
  const hookAdjustments: string[] = [];
  let workerToken: string | undefined;
  let lastMsgAt = Date.now();
  let resultCount = 0;
  let lastWasResult = false;
  let liveBgTasks = 0;
  let transcriptPath: string | undefined;
  const mainResults: { t: number; origin: string; num_turns: number; text: string }[] = [];
  const mainInjected: { t: number; origin: string; text: string }[] = [];
  let mainAgentReturnAt: number | undefined;
  let mainBashReturnAt: number | undefined;

  const log =(src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v.length > 110 ? v.slice(0, 110) + "…" : v) : JSON.stringify(v)}`)
      .join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(26)} ${brief}`);
  };
  const who = (input: any) => (input.agent_id ? `${input.agent_type ?? agentTypeById.get(input.agent_id) ?? "?"}` : "main");
  const textOf = (v: unknown): string =>
    typeof v === "string" ? v : Array.isArray(v) ? v.map((b: any) => b?.text ?? "").join("\n") : JSON.stringify(v ?? "");

  // ---- hooks: precise timestamps for subagent lifecycle and Agent tool calls ----
  const preAgent: HookCallback = async (input: any) => {
    const caller = who(input);
    if (caller === "main") transcriptPath = input.transcript_path;
    const want = caller === "main" ? s.outer === "bg" : s.inner === "bg";
    const asked = input.tool_input?.run_in_background;
    log("hook", "PreToolUse(Agent)", { caller, subagent_type: input.tool_input?.subagent_type, model_asked_bg: asked, enforced_bg: want });
    if (asked !== want) hookAdjustments.push(`${caller}: model asked run_in_background=${asked}, enforced ${want}`);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...input.tool_input, run_in_background: want },
      },
    };
  };
  const postTool: HookCallback = async (input: any) => {
    const caller = who(input);
    const text = textOf(input.tool_response?.content ?? input.tool_response);
    if (input.tool_name === "Agent") {
      agentToolReturns.push({ t: Date.now() - t0, caller, text });
      if (caller === "main") mainAgentReturnAt = Date.now() - t0;
      log("hook", "PostToolUse(Agent)", { caller, returned: text });
    } else {
      if (caller === "main") mainBashReturnAt = Date.now() - t0;
      const m = text.match(TOKEN_RE) ?? JSON.stringify(input.tool_response ?? "").match(TOKEN_RE);
      if (m) workerToken = m[0];
      log("hook", `PostToolUse(${input.tool_name})`, { caller, token: m?.[0] });
    }
    return {};
  };
  const subStart: HookCallback = async (input: any) => {
    agentTypeById.set(input.agent_id, input.agent_type);
    log("hook", "SubagentStart", { agent: input.agent_type, agent_id: input.agent_id });
    return {};
  };
  const subStop: HookCallback = async (input: any) => {
    const type = input.agent_type ?? agentTypeById.get(input.agent_id) ?? "?";
    const last = input.last_assistant_message ?? "";
    const bgTasks = (input.background_tasks ?? []).length;
    stops.push({ t: Date.now() - t0, type, id: input.agent_id, last, bgTasks });
    log("hook", "SubagentStop", { agent: type, last_message: last, in_flight_bg_tasks: bgTasks });
    return {};
  };

  // ---- input: streaming (kept open until drained, or closed after the first result) or a plain string ----
  const inputMode = s.input ?? "open";
  let finish!: () => void;
  const finished = new Promise<void>((r) => (finish = r));
  let gotFirstResult!: () => void;
  const firstResult = new Promise<void>((r) => (gotFirstResult = r));
  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield { type: "user", message: { role: "user", content: mainPrompt(s) }, parent_tool_use_id: null };
    await (inputMode === "close" ? Promise.race([firstResult, finished]) : finished);
    if (inputMode === "close") log("runner", "closing input after first result");
  }

  const q = query({
    prompt: inputMode === "string" ? mainPrompt(s) : input(),
    options: {
      cwd: process.cwd(),
      model: "sonnet",
      settingSources: ["project"], // loads .claude/agents/*.md from the investigation folder (the cwd)
      settings: ISOLATION_SETTINGS,
      allowedTools: ["Agent", "Bash"],
      permissionMode: "dontAsk",
      env: { ...process.env, ...ISOLATION_ENV, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "3" },
      hooks: {
        PreToolUse: [{ matcher: "Agent", hooks: [preAgent] }],
        PostToolUse: [{ hooks: [postTool] }],
        SubagentStart: [{ hooks: [subStart] }],
        SubagentStop: [{ hooks: [subStop] }],
      },
    },
  });

  const watchdog = setInterval(() => {
    const elapsed = Date.now() - t0;
    const allEnded = Object.keys(taskStarts).length >= (s.direct ? 1 : 2) &&Object.keys(taskStarts).every((id) => taskEnds[id]);
    if (elapsed > HARD_TIMEOUT_MS) {
      log("runner", "HARD_TIMEOUT");
      finish();
      q.close();
    } else if (lastWasResult && allEnded && liveBgTasks === 0 && Date.now() - lastMsgAt > QUIET_GRACE_MS) {
      log("runner", "drained; closing input");
      finish();
    }
  }, 1000);

  try {
    for await (const m of q as AsyncIterable<SDKMessage>) {
      lastMsgAt = Date.now();
      lastWasResult = m.type === "result";
      const anyM = m as any;
      if (m.type === "system") {
        switch (anyM.subtype) {
          case "init":
            recordClaudeVersion("sdk", anyM.claude_code_version);
            log("stream", "system:init", { cli: anyM.claude_code_version, model: anyM.model, agents: anyM.agents });
            break;
          case "task_started":
            taskStarts[anyM.task_id] = anyM;
            if (anyM.subagent_type) agentTypeById.set(anyM.task_id, anyM.subagent_type);
            log("stream", "task_started", {
              agent: anyM.subagent_type, task_id: anyM.task_id, is_backgrounded: anyM.is_backgrounded,
              spawn_depth: anyM.spawn_depth, parent_task: anyM.parent_task_id ? agentTypeById.get(anyM.parent_task_id) ?? anyM.parent_task_id : "main",
            });
            break;
          case "task_updated":
            if (["completed", "failed", "killed"].includes(anyM.patch?.status) && !taskEnds[anyM.task_id])
              taskEnds[anyM.task_id] = { t: Date.now() - t0, via: "task_updated", status: anyM.patch.status };
            log("stream", "task_updated", { agent: agentTypeById.get(anyM.task_id), patch: anyM.patch });
            break;
          case "task_notification":
            if (!taskEnds[anyM.task_id]) taskEnds[anyM.task_id] = { t: Date.now() - t0, via: "task_notification", status: anyM.status };
            log("stream", "task_notification", { agent: agentTypeById.get(anyM.task_id), status: anyM.status, summary: anyM.summary });
            break;
          case "background_tasks_changed":
            liveBgTasks = (anyM.tasks ?? []).length;
            log("stream", "background_tasks_changed", { live: (anyM.tasks ?? []).map((t: any) => t.subagent_type ?? t.task_type) });
            break;
          case "task_progress":
            break;
          default:
            log("stream", `system:${anyM.subtype}`);
        }
      } else if (m.type === "assistant" && !anyM.parent_tool_use_id) {
        const text = (anyM.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        for (const b of anyM.message?.content ?? [])
          if (b.type === "tool_use") log("stream", "main tool_use", { name: b.name, input: b.input });
        if (text) {
          mainTexts.push({ t: Date.now() - t0, origin: "assistant", text });
          log("stream", "main assistant text", { text });
        }
      } else if (m.type === "user" && !anyM.parent_tool_use_id) {
        const content = anyM.message?.content;
        const isToolResult = Array.isArray(content) && content.some((b: any) => b.type === "tool_result");
        const text = isToolResult ? textOf(content.map((b: any) => ({ text: textOf(b.content) }))) : textOf(content);
        if (!isToolResult) mainInjected.push({ t: Date.now() - t0, origin: anyM.origin?.kind ?? "none", text });
        log("stream", isToolResult ? "main user tool_result" : "main user message", { origin: anyM.origin?.kind, synthetic: anyM.isSynthetic, text });
      } else if (m.type === "result") {
        resultCount++;
        const origin = anyM.origin?.kind ?? "prompt";
        mainTexts.push({ t: Date.now() - t0, origin, text: anyM.result ?? "" });
        mainResults.push({ t: Date.now() - t0, origin, num_turns: anyM.num_turns, text: anyM.result ?? "" });
        log("stream", "RESULT", { n: resultCount, subtype: anyM.subtype, origin, num_turns: anyM.num_turns, result: anyM.result, cost: anyM.total_cost_usd });
        gotFirstResult();
      }
    }
    log("runner", "query iterator ended");
  } catch (e) {
    log("runner", "query iterator threw", { error: String(e) });
  } finally {
    clearInterval(watchdog);
    finish();
  }
  const iteratorEndedAt = Date.now() - t0;

  // ---- verdict ----
  const idsOf = (type: string) => Object.keys(taskStarts).filter((id) => agentTypeById.get(id) === type);
  const launcherId = idsOf("launcher")[0];
  const workerId = idsOf("slow-worker")[0];
  const launcherStops = stops.filter((x) => x.type === "launcher");
  const workerStops = stops.filter((x) => x.type === "slow-worker");
  const launcherFirstStop = launcherStops[0];
  const launcherLastStop = launcherStops[launcherStops.length - 1];
  const workerStop = workerStops[workerStops.length - 1];
  const launcherSawToken = launcherStops.some((x) => TOKEN_RE.test(x.last));
  const launcherAgentReturn = agentToolReturns.find((r) => r.caller === "launcher");
  // result entries carry the turn origin: "prompt" (answer to our prompt) or "task-notification" (injected turn)
  const mainSawToken = mainTexts.find((x) => x.origin !== "assistant" && TOKEN_RE.test(x.text));
  const notifResults = mainTexts.filter((x) => x.origin === "task-notification");

  const verdict = {
    scenario: s.name,
    direct: !!s.direct,
    outer_requested: s.outer,
    inner_requested: s.inner,
    launcher_is_backgrounded: launcherId ? taskStarts[launcherId].is_backgrounded : null,
    worker_is_backgrounded: workerId ? taskStarts[workerId].is_backgrounded : null,
    worker_spawn_depth: workerId ? taskStarts[workerId].spawn_depth : null,
    worker_token: workerToken ?? null,
    launcher_agent_tool_returned_s: launcherAgentReturn ? launcherAgentReturn.t / 1000 : null,
    launcher_agent_tool_return_text: launcherAgentReturn?.text.slice(0, 200) ?? null,
    launcher_first_stop_s: launcherFirstStop ? launcherFirstStop.t / 1000 : null,
    launcher_last_stop_s: launcherLastStop ? launcherLastStop.t / 1000 : null,
    launcher_stop_count: launcherStops.length,
    worker_stop_s: workerStop ? workerStop.t / 1000 : null,
    launcher_ended_before_worker: launcherFirstStop && workerStop ? launcherFirstStop.t < workerStop.t : null,
    launcher_final_message_has_token: launcherSawToken,
    launcher_final_message: launcherLastStop?.last ?? null,
    main_saw_token: !!mainSawToken,
    main_saw_token_via: mainSawToken?.origin ?? null,
    main_task_notification_turns: notifResults.length,
    hook_adjustments: hookAdjustments,
    results: resultCount,
    launcher_waited_for_worker:
      launcherFirstStop && workerStop ? !(launcherFirstStop.t < workerStop.t && !launcherSawToken) : null,
    // ---- main conversation ----
    main: {
      input_mode: inputMode,
      busy_main: !!s.busyMain,
      blocked_on_launcher_until_s: mainAgentReturnAt !== undefined ? mainAgentReturnAt / 1000 : null,
      own_work_returned_s: mainBashReturnAt !== undefined ? mainBashReturnAt / 1000 : null,
      results: mainResults.map((r) => ({ at_s: r.t / 1000, origin: r.origin, num_turns: r.num_turns, text: r.text })),
      injected_user_messages_on_stream: mainInjected.map((x) => ({ at_s: x.t / 1000, origin: x.origin, text: x.text.slice(0, 300) })),
      worker_end_status: workerId ? taskEnds[workerId]?.status ?? "no end event" : "never started",
      worker_end_s: workerId && taskEnds[workerId] ? taskEnds[workerId].t / 1000 : null,
      token_reached_main: !!mainSawToken,
      token_reached_main_in_turn: mainSawToken?.origin ?? null,
      token_reached_main_at_s: mainSawToken ? mainSawToken.t / 1000 : null,
      query_iterator_ended_s: iteratorEndedAt / 1000,
      transcript: transcriptPath ?? null,
    },
  };
  writeFileSync(join(RESULTS_DIR, `${s.name}.verdict.json`), JSON.stringify(verdict, null, 2));
  if (transcriptPath) writeFileSync(join(RESULTS_DIR, `${s.name}.main-transcript.txt`), mainTranscriptExcerpt(transcriptPath));
  console.log(`\n[${s.name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const names = process.argv.slice(2);
  const scenarios = names.length ? ALL.filter((s) => names.includes(s.name)) : ALL;
  for (const s of scenarios) await runScenario(s);

  // summary covers every scenario that has a verdict on disk, so running a subset keeps the others
  const verdicts = ALL.flatMap((s) => {
    try { return [JSON.parse(readFileSync(join(RESULTS_DIR, `${s.name}.verdict.json`), "utf8"))]; } catch { return []; }
  });
  const launcherRows = verdicts.filter((v) => !v.direct).map(
    (v) =>
      `| ${v.scenario} | ${v.launcher_is_backgrounded} | ${v.worker_is_backgrounded} | ${v.launcher_first_stop_s} | ${v.worker_stop_s} | ` +
      `${v.launcher_final_message_has_token} | **${v.launcher_waited_for_worker ? "WAITED" : "DID NOT WAIT"}** |`,
  );
  const mainRows = verdicts.filter((v) => v.main).map((v) => {
    const m = v.main;
    const results = m.results.map((r: any) => `${r.at_s}s ${r.origin}: \`${r.text.replace(/\|/g, "\\|").replace(/\n/g, " ⏎ ")}\``).join("<br>");
    const mode = v.direct ? `direct worker ${v.worker_is_backgrounded ? "bg" : "fg"}` : `${m.input_mode}${m.busy_main ? " + busy main" : ""}`;
    return `| ${v.scenario} | ${mode} |${m.blocked_on_launcher_until_s ?? "-"} | ` +
      `${m.worker_end_status} @ ${m.worker_end_s ?? "-"}s | ${results} | ${m.token_reached_main ? m.token_reached_main_in_turn : "no"} | ${m.query_iterator_ended_s} |`;
  });
  const tokenRows = verdicts.filter((v) => v.main).map((v) => {
    const m = v.main;
    const chain = v.direct ? `main →${v.outer_requested} worker` : `main →${v.outer_requested} launcher →${v.inner_requested} worker`;
    // verdicts written before token_reached_main_at_s existed: take the first result that carries the token
    m.token_reached_main_at_s ??= m.results.find((r: any) => TOKEN_RE.test(r.text))?.at_s ?? null;
    const how = !m.token_reached_main ? "**NEVER**" : m.token_reached_main_in_turn === "prompt" ? "sync (in the prompt's turn)" : "callback (task-notification turn)";
    const before = m.token_reached_main ? (m.token_reached_main_at_s <= m.query_iterator_ended_s ? "yes" : "no") : "no";
    return `| ${v.scenario} | ${chain} | ${m.input_mode} | ${m.worker_end_s ?? "-"} | ${how} | ${m.token_reached_main_at_s ?? "-"} | ${m.query_iterator_ended_s} | ${before} |`;
  });
  const md = [
    "## Did the WORKER_TOKEN reach main before the session ended?",
    "",
    "input `open` = this script kept the session open until background work drained; `string` = one-shot, the CLI alone decides when to end.",
    "",
    "| scenario | chain (fg = sync, bg = async) | input | worker ended (s) | token reached main | at (s) | session ended (s) | before end |",
    "|---|---|---|---|---|---|---|---|",
    ...tokenRows,
    "",
    "## Launcher behaviour",
    "",
    "| scenario (outer-inner) | launcher bg | worker bg | launcher ended (s) | worker ended (s) | launcher got token | launcher |",
    "|---|---|---|---|---|---|---|",
    ...launcherRows,
    "",
    "## Main conversation behaviour",
    "",
    "| scenario | input | main's Agent call returned (s) | worker | main results (time, turn origin, text) | worker token reached main in | query iterator ended (s) |",
    "|---|---|---|---|---|---|---|",
    ...mainRows,
  ].join("\n");
  writeSummary("summary.md", md);
  console.log(md);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
