/**
 * AskUserQuestion relay through main, foreground only.
 *
 *   main --Agent (fg)--> clarifier            clarifier draws a secret NONCE (never shown to main) and replies
 *                                              QUESTION_FOR_USER: ... / OPTIONS: ...
 *   main --AskUserQuestion--> fake user       the test answers "French" (SDK: canUseTool; CLI: PreToolUse hook)
 *   main --SendMessage(to=agentId)--> clarifier   same instance resumed; it waits 15 s, then replies
 *                                              CLARIFIER_FINAL: <greeting> NONCE=<n>
 *
 * Only the original instance knows the nonce, so a matching nonce in the final reply proves the SAME instance
 * (same context) was resumed. Foreground is forced only by env: CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1,
 * CLAUDE_CODE_FORK_SUBAGENT=0. No hook changes Agent or SendMessage input.
 *
 * Usage:  npx tsx investigations/askuserquestion-relay/askuser.ts [sdk|cli|both=both] [runs=1]
 */
import { query, type HookCallback, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const DRIVER = (process.argv[2] ?? "both") as "sdk" | "cli" | "both";
const RUNS = Number(process.argv[3] ?? 1);
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const PROJECT_DIR = SESSIONS_DIR;
const FAKE_ANSWER = "French";
const NONCE_RE = /NONCE=(\d+|UNKNOWN)/;

const MAIN_PROMPT = loadPrompt("askuser-main");

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k) && v !== undefined) env[k] = v;
  return { ...env, ...ISOLATION_ENV, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" };
}

function pickAnswers(questions: any[]) {
  const answers: Record<string, string> = {};
  for (const q of questions) answers[q.question] = (q.options.find((o: any) => new RegExp(FAKE_ANSWER, "i").test(o.label)) ?? q.options[0]).label;
  return answers;
}

type Logger = (src: string, event: string, data?: Record<string, unknown>) => void;
function makeLogger(name: string, t0: number): Logger {
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  writeFileSync(logPath, "");
  return (src, event, data = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data)
      .map(([k, v]) => { const s = typeof v === "string" ? v : JSON.stringify(v); return `${k}=${JSON.stringify(s.length > 120 ? s.slice(0, 120) + "…" : s)}`; })
      .join(" ");
    console.log(`[${name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(22)} ${brief}`);
  };
}

/** Stream events are the same shape for SDK messages and `claude -p` stream-json lines. */
function makeStreamHandler(log: Logger, t0: number, st: StreamState) {
  return (a: any) => {
    if (a.type === "system" && a.subtype === "init") {
      st.sessionId = a.session_id; st.cliVersion = a.claude_code_version;
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, session: a.session_id,
        has_AskUserQuestion: a.tools?.includes("AskUserQuestion"), has_SendMessage: a.tools?.includes("SendMessage") });
      st.tools = a.tools;
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
      log("stream", "RESULT", { origin: a.origin?.kind ?? "prompt", num_turns: a.num_turns, result: a.result, stop_reason: a.stop_reason, cost: a.total_cost_usd });
    }
  };
}

interface StreamState {
  sessionId?: string; cliVersion?: string; tools?: string[];
  taskStarted: { t: number; task_id: string; agent: string; is_backgrounded: boolean }[];
  results: { t: number; origin: string; text: string }[];
}

// ---------------------------------------------------------------- drivers

async function runSdk(name: string, t0: number, log: Logger, st: StreamState) {
  const obs: HookCallback = async (input: any) => {
    const ev = input.hook_event_name;
    const who = input.agent_id ? `${input.agent_type}:${input.agent_id}` : "main";
    if (ev === "SubagentStart" || ev === "SubagentStop") log("hook", ev, { agent: input.agent_type, agent_id: input.agent_id, last: input.last_assistant_message });
    else log("hook", `${ev}(${input.tool_name})`, { caller: who });
    return {};
  };
  const q = query({
    prompt: MAIN_PROMPT, // one-shot
    options: {
      cwd: process.cwd(),
      model: "sonnet",
      settingSources: ["project"],
      settings: ISOLATION_SETTINGS,
      allowedTools: ["Agent", "Bash", "SendMessage"],
      env: cleanEnv(),
      // the fake user: documented SDK way to answer AskUserQuestion
      canUseTool: async (toolName, input) => {
        if (toolName === "AskUserQuestion") {
          const answers = pickAnswers((input as any).questions ?? []);
          log("fake-user", "answers", { answers });
          return { behavior: "allow", updatedInput: { questions: (input as any).questions, answers } };
        }
        log("canUseTool", "unexpected", { toolName });
        return { behavior: "allow", updatedInput: input };
      },
      hooks: {
        PreToolUse: [{ hooks: [obs] }],
        PostToolUse: [{ hooks: [obs] }],
        SubagentStart: [{ hooks: [obs] }],
        SubagentStop: [{ hooks: [obs] }],
      },
    },
  });
  const handle = makeStreamHandler(log, t0, st);
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); q.close(); }, 6 * 60_000);
  for await (const m of q as AsyncIterable<SDKMessage>) handle(m);
  clearTimeout(timeout);
}

async function runCli(name: string, t0: number, log: Logger, st: StreamState) {
  const hookLog = join(RESULTS_DIR, `${name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
  writeFileSync(hookLog, "");
  const node = (script: string, ...args: string[]) =>
    `node "${script.replace(/\\/g, "/")}" ${args.map((a) => `"${a.replace(/\\/g, "/")}"`).join(" ")}`;
  const logger = [{ hooks: [{ type: "command", command: node(join(LIB_DIR, "hook-log.mjs"), hookLog) }] }];
  writeFileSync(settingsPath, JSON.stringify({
    ...ISOLATION_SETTINGS,
    hooks: {
      PreToolUse: [
        { matcher: "AskUserQuestion", hooks: [{ type: "command", command: node(join(process.cwd(), "fake-user.mjs"), hookLog, FAKE_ANSWER) }] },
        { matcher: "Agent|SendMessage|Bash", hooks: logger[0].hooks },
      ],
      PostToolUse: logger, SubagentStart: logger, SubagentStop: logger,
    },
  }, null, 2));
  // A -p run offers AskUserQuestion only with a permission host: a stdio MCP tool passed as --permission-prompt-tool.
  // The PreToolUse hook (fake-user.mjs) is what actually answers; the MCP tool would answer too if it were consulted.
  const mcpPath = join(RESULTS_DIR, `${name}.mcp.json`);
  const fwd = (x: string) => x.replace(/\\/g, "/");
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { fakeuser: { type: "stdio", command: "node", args: [fwd(join(process.cwd(), "fake-user-mcp.mjs")), fwd(hookLog), FAKE_ANSWER] } } }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath,
    "--mcp-config", mcpPath, "--strict-mcp-config", "--permission-prompt-tool", "mcp__fakeuser__prompt",
    "--allowedTools", "Agent", "Bash", "SendMessage",
  ];
  log("runner", "spawn", { cli: CLAUDE, args: args.join(" ") });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
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
  for (const h of readFileSync(hookLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))) {
    const ev = h.hook_event_name;
    const data: Record<string, unknown> = ev === "PermissionPromptTool" ? { tool: h.tool_name } : ev.startsWith("Subagent")
      ? { agent: h.agent_type, agent_id: h.agent_id }
      : { tool: h.tool_name, caller: h.agent_id ? `${h.agent_type}:${h.agent_id}` : "main" };
    if (h.fake_user_answers) data.fake_user_answers = h.fake_user_answers;
    appendFileSync(join(RESULTS_DIR, `${name}.jsonl`), JSON.stringify({ t: h.t_epoch - t0, src: "hook", event: ev, ...data }) + "\n");
  }
}

// ---------------------------------------------------------------- transcript analysis

const textOf = (c: any): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: any) => (b.type === "text" ? b.text : b.type === "tool_result" ? textOf(b.content) : "")).join("\n") : "";
const readJsonl = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

function analyse(sessionId: string, t0: number) {
  const mainPath = join(PROJECT_DIR, `${sessionId}.jsonl`);
  const rel = (ts: string) => (Date.parse(ts) - t0) / 1000;
  const entries = readJsonl(mainPath).filter((e) => !e.isSidechain);
  const calls: { id: string; name: string; input: any; use_s: number; result_s?: number; result?: string }[] = [];
  const notifications: { at_s: number; text: string }[] = [];
  const answers: { at_s: number; text: string }[] = [];
  for (const e of entries) {
    if (e.type === "assistant") {
      for (const b of e.message?.content ?? []) {
        if (b.type === "tool_use") calls.push({ id: b.id, name: b.name, input: b.input, use_s: rel(e.timestamp) });
        if (b.type === "text" && b.text.trim()) answers.push({ at_s: rel(e.timestamp), text: b.text });
      }
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
        const prompts = es.filter((e) => e.type === "user" && !(Array.isArray(e.message?.content) && e.message.content.some((b: any) => b.type === "tool_result")))
          .map((e) => ({ at_s: rel(e.timestamp), text: textOf(e.message.content).slice(0, 200) }));
        const bashOutputs = es.filter((e) => e.type === "user" && Array.isArray(e.message?.content))
          .flatMap((e) => e.message.content.filter((b: any) => b.type === "tool_result").map((b: any) => ({ at_s: rel(e.timestamp), text: textOf(b.content).trim() })));
        const finals = es.filter((e) => e.type === "assistant").flatMap((e) => (e.message?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => ({ at_s: rel(e.timestamp), text: b.text })));
        return { file: f, agent_id: f.replace(/^agent-|\.jsonl$/g, ""), prompts, bash_outputs: bashOutputs, assistant_texts: finals };
      })
    : [];
  return { mainPath, calls, notifications, answers, subagents };
}

// ---------------------------------------------------------------- one run

async function runOnce(driver: "sdk" | "cli", run: number) {
  const name = `askuser-${driver}-run${run}`;
  const t0 = Date.now();
  const log = makeLogger(name, t0);
  const st: StreamState = { taskStarted: [], results: [] };
  await (driver === "sdk" ? runSdk : runCli)(name, t0, log, st);
  recordClaudeVersion(driver, st.cliVersion);
  const sessionEnd = (Date.now() - t0) / 1000;
  if (!st.sessionId) throw new Error(`${name}: no session id`);
  const tr = analyse(st.sessionId, t0);

  const agentCalls = tr.calls.filter((c) => c.name === "Agent");
  const askCalls = tr.calls.filter((c) => c.name === "AskUserQuestion");
  const sendCalls = tr.calls.filter((c) => c.name === "SendMessage");
  const firstAgent = agentCalls[0];
  const agentId = firstAgent?.result?.match(/agentId:\s*([\w-]+)/)?.[1];
  const send = sendCalls[0];
  const clarifierTranscripts = tr.subagents.filter((s) => s.prompts.some((p) => /greeting|USER_ANSWER/.test(p.text)));
  const own = tr.subagents.find((s) => s.agent_id === agentId);
  const firstNonce = own?.bash_outputs.map((b) => b.text.match(/NONCE=(\d+)/)?.[1]).find(Boolean);
  const finalFromSub = own?.assistant_texts.map((x) => x.text).filter((x) => x.includes("CLARIFIER_FINAL")).pop();
  const finalNonce = finalFromSub?.match(NONCE_RE)?.[1];
  const clarifierStarts = st.taskStarted.filter((x) => x.agent === "clarifier" || x.task_id === agentId);
  const lastResult = st.results[st.results.length - 1];
  const call = (c?: (typeof tr.calls)[number]) => c && { name: c.name, input: c.input, use_s: c.use_s, result_s: c.result_s, blocked_s: c.result_s !== undefined ? +(c.result_s - c.use_s).toFixed(2) : null, result: c.result };

  const verdict = {
    run: name,
    driver: driver === "sdk" ? "Agent SDK query()" : "claude -p (no SDK)",
    cli_version: st.cliVersion ?? null,
    env: { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: "1", CLAUDE_CODE_FORK_SUBAGENT: "0" },
    fake_user: driver === "sdk" ? `canUseTool answers "${FAKE_ANSWER}"` : `PreToolUse hook fake-user.mjs answers "${FAKE_ANSWER}"`,
    main_has_AskUserQuestion: st.tools?.includes("AskUserQuestion") ?? null,
    main_has_SendMessage: st.tools?.includes("SendMessage") ?? null,
    main_tool_sequence: tr.calls.map((c) => c.name),
    agent_call: call(firstAgent),
    agent_id: agentId ?? null,
    check1_subagent_asked_question: !!firstAgent?.result?.includes("QUESTION_FOR_USER"),
    ask_call: call(askCalls[0]),
    check2_main_asked_user_and_got_fake_answer: !!askCalls[0]?.result?.includes(FAKE_ANSWER),
    send_call: call(send),
    check3_sendmessage_to_same_id: !!send && !!agentId && send.input?.to === agentId,
    agent_calls_total: agentCalls.length,
    clarifier_transcripts: clarifierTranscripts.map((s) => s.file),
    first_run_nonce: firstNonce ?? null,
    resumed_run_final: finalFromSub ?? null,
    check4_same_instance: agentCalls.length === 1 && clarifierTranscripts.length === 1 && !!firstNonce && finalNonce === firstNonce,
    clarifier_task_started: clarifierStarts.map((x) => ({ at_s: x.t / 1000, task_id: x.task_id, is_backgrounded: x.is_backgrounded })),
    main_task_notification_turns: tr.notifications.map((n) => ({ at_s: n.at_s, text: n.text.slice(0, 300) })),
    // foreground = main's SendMessage call blocks until the resumed run ends and returns its final report inline,
    // with no later task-notification turn. The stream's is_backgrounded flag is recorded but not used: see README.
    resumed_run_ended_s: own?.assistant_texts.filter((x) => x.text.includes("CLARIFIER_FINAL")).pop()?.at_s ?? null,
    resumed_run_is_backgrounded_flag: clarifierStarts[1]?.is_backgrounded ?? null,
    check5_resume_was_foreground:
      !!send?.result?.includes("CLARIFIER_FINAL") && tr.notifications.length === 0 && send?.result_s !== undefined &&
      send.result_s >= (own?.assistant_texts.filter((x) => x.text.includes("CLARIFIER_FINAL")).pop()?.at_s ?? Infinity),
    results: st.results.map((r) => ({ at_s: r.t / 1000, origin: r.origin, text: r.text })),
    check6_main_final_has_nonce: !!lastResult && !!firstNonce && lastResult.text.includes(`NONCE=${firstNonce}`),
    subagent_transcripts: tr.subagents,
    session_ended_s: sessionEnd,
    transcript: tr.mainPath,
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${name}] VERDICT\n${JSON.stringify({ ...verdict, subagent_transcripts: undefined }, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const drivers = DRIVER === "both" ? (["sdk", "cli"] as const) : [DRIVER];
  for (const d of drivers) for (let r = 1; r <= RUNS; r++) await runOnce(d, r);
  const all = readdirSync(RESULTS_DIR).filter((f) => /^askuser-.*\.verdict\.json$/.test(f)).sort()
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
  const yn = (b: boolean) => (b ? "PASS" : "**FAIL**");
  const md = [
    "## AskUserQuestion relay: main → clarifier (fg) → AskUserQuestion → SendMessage to the same clarifier",
    "",
    "| run | tool sequence | 1. subagent asked | 2. main asked user, got answer | 3. SendMessage to same agentId | 4. same instance (nonce) | 5. resume in foreground (SendMessage blocked s) | resumed run is_backgrounded flag | 6. main final has nonce | session ended (s) |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...all.map((v) =>
      `| ${v.run} | ${v.main_tool_sequence.join(" → ")} | ${yn(v.check1_subagent_asked_question)} | ${yn(v.check2_main_asked_user_and_got_fake_answer)} | ` +
      `${yn(v.check3_sendmessage_to_same_id)} | ${yn(v.check4_same_instance)} | ${yn(v.check5_resume_was_foreground)} (${v.send_call?.blocked_s ?? "-"}) | ${v.resumed_run_is_backgrounded_flag} | ` +
      `${yn(v.check6_main_final_has_nonce)} | ${v.session_ended_s} |`),
  ].join("\n");
  writeSummary("askuser-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
