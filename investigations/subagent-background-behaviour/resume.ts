/**
 * Resume a completed SYNC subagent: is the resumed run sync or async from main's point of view?
 *
 *   main --Agent (fg)--> resumable        first run draws a secret NONCE (hidden), replies FIRST_RUN_DONE
 *   main --SendMessage(to=agentId)-->     same instance resumed; waits 20 s, replies RESUMED_FINAL NONCE=<n>
 *
 * Sync  = main's SendMessage call blocks until the resumed run ends and returns its report as the tool result.
 * Async = SendMessage returns at once and the report reaches main later as a <task-notification> turn.
 *
 * Env modes:
 *   forced  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1, CLAUDE_CODE_FORK_SUBAGENT=0 (foreground forced by env)
 *   default no such variables; the prompt asks for run_in_background: false on the Agent call
 * Drivers: sdk (Agent SDK query()) and cli (claude -p). Hooks only observe.
 *
 * Usage:  npx tsx investigations/subagent-background-behaviour/resume.ts [forced|default|both=both] [sdk|cli|both=both] [runs=1]
 */
import { query, type HookCallback, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Mode = "forced" | "default";
type Driver = "sdk" | "cli";
const MODES: Mode[] = (process.argv[2] ?? "both") === "both" ? ["forced", "default"] : [process.argv[2] as Mode];
const DRIVERS: Driver[] = (process.argv[3] ?? "both") === "both" ? ["sdk", "cli"] : [process.argv[3] as Driver];
const RUNS = Number(process.argv[4] ?? 1);
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const PROJECT_DIR = SESSIONS_DIR;

const MAIN_PROMPT = loadPrompt("resume-main");

function envFor(mode: Mode): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k) && v !== undefined) env[k] = v;
  Object.assign(env, ISOLATION_ENV);
  return mode === "forced" ? { ...env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" } : env;
}

type Logger = (src: string, event: string, data?: Record<string, unknown>) => void;
function makeLogger(name: string, t0: number): Logger {
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  writeFileSync(logPath, "");
  return (src, event, data = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data)
      .map(([k, v]) => { const s = typeof v === "string" ? v : (JSON.stringify(v) ?? "undefined"); return `${k}=${JSON.stringify(s.length > 120 ? s.slice(0, 120) + "…" : s)}`; })
      .join(" ");
    console.log(`[${name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(22)} ${brief}`);
  };
}

interface StreamState {
  sessionId?: string; cliVersion?: string;
  taskStarted: { t: number; task_id: string; agent: string; is_backgrounded: boolean }[];
  results: { t: number; origin: string; text: string }[];
}

function makeStreamHandler(log: Logger, t0: number, st: StreamState) {
  return (a: any) => {
    if (a.type === "system" && a.subtype === "init") {
      st.sessionId = a.session_id; st.cliVersion = a.claude_code_version;
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, session: a.session_id });
    } else if (a.type === "system" && a.subtype === "task_started") {
      st.taskStarted.push({ t: Date.now() - t0, task_id: a.task_id, agent: a.subagent_type, is_backgrounded: a.is_backgrounded });
      log("stream", "task_started", { agent: a.subagent_type, task_id: a.task_id, is_backgrounded: a.is_backgrounded });
    } else if (a.type === "system" && a.subtype === "task_notification") {
      log("stream", "task_notification", { task_id: a.task_id, status: a.status, summary: a.summary });
    } else if (a.type === "assistant" && !a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) {
        if (b.type === "tool_use") log("stream", "main tool_use", { name: b.name, input: b.input });
        else if (b.type === "text") log("stream", "main text", { text: b.text });
      }
    } else if (a.type === "user" && !a.parent_tool_use_id) {
      const content = Array.isArray(a.message?.content) ? a.message.content : [];
      for (const b of content.filter((b: any) => b.type === "tool_result"))
        log("stream", "main tool_result", { text: typeof b.content === "string" ? b.content : JSON.stringify(b.content) });
      if (a.origin?.kind) log("stream", "main user", { origin: a.origin.kind });
    } else if (a.type === "result") {
      st.results.push({ t: Date.now() - t0, origin: a.origin?.kind ?? "prompt", text: a.result ?? "" });
      log("stream", "RESULT", { origin: a.origin?.kind ?? "prompt", num_turns: a.num_turns, result: a.result, cost: a.total_cost_usd });
    }
  };
}

async function runSdk(mode: Mode, log: Logger, t0: number, st: StreamState) {
  const obs: HookCallback = async (input: any) => {
    const ev = input.hook_event_name;
    if (ev === "SubagentStart" || ev === "SubagentStop") log("hook", ev, { agent: input.agent_type, agent_id: input.agent_id });
    else log("hook", `${ev}(${input.tool_name})`, { caller: input.agent_id ? `${input.agent_type}:${input.agent_id}` : "main" });
    return {};
  };
  const q = query({
    prompt: MAIN_PROMPT, // one-shot
    options: {
      cwd: process.cwd(), model: "sonnet", settingSources: ["project"], settings: ISOLATION_SETTINGS,
      allowedTools: ["Agent", "Bash", "SendMessage"], permissionMode: "dontAsk", env: envFor(mode),
      hooks: { PreToolUse: [{ hooks: [obs] }], PostToolUse: [{ hooks: [obs] }], SubagentStart: [{ hooks: [obs] }], SubagentStop: [{ hooks: [obs] }] },
    },
  });
  const handle = makeStreamHandler(log, t0, st);
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); q.close(); }, 6 * 60_000);
  for await (const m of q as AsyncIterable<SDKMessage>) handle(m);
  clearTimeout(timeout);
}

async function runCli(mode: Mode, name: string, log: Logger, t0: number, st: StreamState) {
  const hookLog = join(RESULTS_DIR, `${name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
  writeFileSync(hookLog, "");
  const cmd = `node "${join(LIB_DIR, "hook-log.mjs").replace(/\\/g, "/")}" "${hookLog.replace(/\\/g, "/")}"`;
  const h = [{ hooks: [{ type: "command", command: cmd }] }];
  writeFileSync(settingsPath, JSON.stringify({ ...ISOLATION_SETTINGS, hooks: { PreToolUse: h, PostToolUse: h, SubagentStart: h, SubagentStop: h } }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Bash", "SendMessage", "--permission-mode", "dontAsk",
  ];
  log("runner", "spawn", { args: args.join(" ") });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: envFor(mode), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(MAIN_PROMPT);
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 6 * 60_000);
  const handle = makeStreamHandler(log, t0, st);
  createInterface({ input: child.stdout }).on("line", (line) => {
    try { handle(JSON.parse(line)); } catch { log("stdout", "non-json", { text: line }); }
  });
  const code: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  log("runner", "claude -p exited", { code });
  for (const x of readFileSync(hookLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))) {
    const ev = x.hook_event_name;
    const data = ev.startsWith("Subagent") ? { agent: x.agent_type, agent_id: x.agent_id } : { tool: x.tool_name, caller: x.agent_id ? `${x.agent_type}:${x.agent_id}` : "main" };
    appendFileSync(join(RESULTS_DIR, `${name}.jsonl`), JSON.stringify({ t: x.t_epoch - t0, src: "hook", event: ev, ...data }) + "\n");
  }
}

// ---------------------------------------------------------------- transcript analysis (driver-independent)

const textOf = (c: any): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: any) => (b.type === "text" ? b.text : b.type === "tool_result" ? textOf(b.content) : "")).join("\n") : "";
const readJsonl = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function analyse(sessionId: string, t0: number) {
  const mainPath = join(PROJECT_DIR, `${sessionId}.jsonl`);
  const rel = (ts: string) => +((Date.parse(ts) - t0) / 1000).toFixed(2);
  const calls: { id: string; name: string; input: any; use_s: number; result_s?: number; result?: string }[] = [];
  const notifications: { at_s: number; text: string }[] = [];
  for (const e of readJsonl(mainPath).filter((e) => !e.isSidechain)) {
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) if (b.type === "tool_use") calls.push({ id: b.id, name: b.name, input: b.input, use_s: rel(e.timestamp) });
    } else if (e.type === "user") {
      const c = e.message?.content;
      if (Array.isArray(c)) for (const b of c) if (b.type === "tool_result") {
        const call = calls.find((x) => x.id === b.tool_use_id);
        if (call) { call.result_s = rel(e.timestamp); call.result = textOf(b.content); }
      }
      const t = textOf(c);
      if (t.includes("<task-notification>")) notifications.push({ at_s: rel(e.timestamp), text: t });
    }
  }
  const subDir = join(PROJECT_DIR, sessionId, "subagents");
  const subagents = existsSync(subDir)
    ? readdirSync(subDir).filter((f) => /^agent-.*\.jsonl$/.test(f)).map((f) => {
        const es = readJsonl(join(subDir, f));
        const isToolResult = (e: any) => Array.isArray(e.message?.content) && e.message.content.some((b: any) => b.type === "tool_result");
        return {
          agent_id: f.replace(/^agent-|\.jsonl$/g, ""),
          prompts: es.filter((e) => e.type === "user" && !isToolResult(e)).map((e) => ({ at_s: rel(e.timestamp), text: textOf(e.message.content).slice(0, 200) })),
          tool_outputs: es.filter((e) => e.type === "user" && isToolResult(e)).map((e) => ({ at_s: rel(e.timestamp), text: textOf(e.message.content).trim() })),
          texts: es.filter((e) => e.type === "assistant").flatMap((e) => (e.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => ({ at_s: rel(e.timestamp), text: b.text }))),
        };
      })
    : [];
  return { mainPath, calls, notifications, subagents };
}

async function runOnce(mode: Mode, driver: Driver, run: number) {
  const name = `resume-${mode}-${driver}-run${run}`;
  const t0 = Date.now();
  const log = makeLogger(name, t0);
  const st: StreamState = { taskStarted: [], results: [] };
  if (driver === "sdk") await runSdk(mode, log, t0, st); else await runCli(mode, name, log, t0, st);
  recordClaudeVersion(driver, st.cliVersion);
  const sessionEnd = (Date.now() - t0) / 1000;
  if (!st.sessionId) throw new Error(`${name}: no session id`);
  const tr = analyse(st.sessionId, t0);

  const agentCalls = tr.calls.filter((c) => c.name === "Agent");
  const first = agentCalls[0];
  const agentId = first?.result?.match(/agentId:\s*([\w-]+)/)?.[1];
  const send = tr.calls.find((c) => c.name === "SendMessage");
  const own = tr.subagents.find((s) => s.agent_id === agentId);
  const nonce = own?.tool_outputs.map((b) => b.text.match(/NONCE=(\d+)/)?.[1]).find(Boolean);
  const resumedFinal = own?.texts.filter((x) => x.text.includes("RESUMED_FINAL")).pop();
  const starts = st.taskStarted.filter((x) => x.task_id === agentId);
  const sendGotReport = !!send?.result?.includes("RESUMED_FINAL");
  const notifWithReport = tr.notifications.filter((n) => n.text.includes("RESUMED_FINAL"));
  const resumeMode = sendGotReport && notifWithReport.length === 0 ? "SYNC" : !sendGotReport && notifWithReport.length ? "ASYNC" : "UNCLEAR";
  const finalResult = st.results[st.results.length - 1];

  const verdict = {
    run: name, mode, driver: driver === "sdk" ? "Agent SDK query()" : "claude -p (no SDK)", cli_version: st.cliVersion ?? null,
    env: mode === "forced" ? { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" } : "none",
    main_tool_sequence: tr.calls.map((c) => c.name),
    first_spawn: first && { input: first.input, use_s: first.use_s, result_s: first.result_s, is_backgrounded: starts[0]?.is_backgrounded ?? null, result_has_FIRST_RUN_DONE: !!first.result?.includes("FIRST_RUN_DONE") },
    check1_first_spawn_sync: !!first?.result?.includes("FIRST_RUN_DONE") && starts[0]?.is_backgrounded === false,
    agent_id: agentId ?? null,
    send: send && { to: send.input?.to, use_s: send.use_s, result_s: send.result_s, blocked_s: send.result_s !== undefined ? +(send.result_s - send.use_s).toFixed(2) : null, result: send.result },
    check2_send_to_same_id: !!send && send.input?.to === agentId,
    agent_calls_total: agentCalls.length,
    subagent_transcripts: tr.subagents.length,
    nonce_first_run: nonce ?? null,
    resumed_final: resumedFinal ?? null,
    check3_same_instance: agentCalls.length === 1 && tr.subagents.length === 1 && !!nonce && !!resumedFinal?.text.includes(`NONCE=${nonce}`),
    resumed_task_started: starts.slice(1).map((x) => ({ at_s: x.t / 1000, is_backgrounded: x.is_backgrounded })),
    task_notification_turns_in_main: tr.notifications.map((n) => ({ at_s: n.at_s, text: n.text.slice(0, 400) })),
    RESUME_FROM_MAIN_POV: resumeMode,
    results: st.results.map((r) => ({ at_s: r.t / 1000, origin: r.origin, text: r.text })),
    check4_main_final_has_nonce: !!finalResult && !!nonce && finalResult.text.includes(`NONCE=${nonce}`),
    session_ended_s: sessionEnd,
    transcript: tr.mainPath,
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  for (const m of MODES) for (const d of DRIVERS) for (let r = 1; r <= RUNS; r++) await runOnce(m, d, r);
  const all = readdirSync(RESULTS_DIR).filter((f) => /^resume-.*\.verdict\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
  const yn = (b: boolean) => (b ? "PASS" : "**FAIL**");
  const md = [
    "## Resume a completed sync subagent with SendMessage: sync or async for main?",
    "",
    "| run | env | tool sequence | 1. first spawn sync | 2. SendMessage to same id | 3. same instance (nonce) | **resume for main** | SendMessage blocked (s) | resumed is_backgrounded flag | notification turns | results (origin@s) | 4. final has nonce |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...all.map((v) =>
      `| ${v.run} | ${v.mode} | ${v.main_tool_sequence.join(" → ")} | ${yn(v.check1_first_spawn_sync)} | ${yn(v.check2_send_to_same_id)} | ${yn(v.check3_same_instance)} | ` +
      `**${v.RESUME_FROM_MAIN_POV}** | ${v.send?.blocked_s ?? "-"} | ${v.resumed_task_started.map((x: any) => x.is_backgrounded).join(",")} | ${v.task_notification_turns_in_main.length} | ` +
      `${v.results.map((r: any) => `${r.origin}@${r.at_s}`).join(", ")} | ${yn(v.check4_main_final_has_nonce)} |`),
  ].join("\n");
  writeSummary("resume-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
