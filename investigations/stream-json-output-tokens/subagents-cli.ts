/**
 * Subagents: where do their tokens show up, at runtime and in the session files?
 *
 *   process 1: claude -p           main (Haiku) --Agent x2, parallel, foreground--> worker (Sonnet) each: Bash + ~200 words
 *   process 2: claude -p --resume  main (Haiku) --Agent x1--> worker (Sonnet)
 *
 * The worker runs on another model than the main session, so every per-model figure (modelUsage, cost-state)
 * separates main and subagents.
 *
 * Ground truth per API message, from the stream (every process runs with --include-partial-messages):
 * input/cache from stream_event message_start, output from message_delta, keyed by parent_tool_use_id
 * (null = main session). Whether subagent stream_events are forwarded at all is itself recorded.
 *
 * Checks:
 *   runtime: result.usage / modelUsage / total_cost_usd per process: main only, or main + subagents? process or cumulative?
 *   files:   <session>.jsonl and <session>/subagents/agent-*.jsonl, dedup by message.id, and the last cost-state entry.
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/subagents-cli.ts [--chats N] [--concurrency N] [--same-model]   (default 2, 2)
 *         --same-model: workers on Haiku too (.claude/agents/worker-haiku.md, prompts/subagents-same-*.md)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const MODEL = "claude-haiku-5-5";
const EFFORT = "medium";
// --same-model: the worker runs on the main session's model (worker-haiku), so per-model totals no longer separate them.
const SAME_MODEL = process.argv.includes("--same-model");
const TURNS = SAME_MODEL ? ["subagents-same-1", "subagents-same-2"] : ["subagents-1", "subagents-2"];
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const FIELDS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"] as const;
type Field = (typeof FIELDS)[number];
type Usage = Record<Field, number>;
const zero = (): Usage => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
const add = (a: Usage, b: Partial<Usage>) => { for (const f of FIELDS) a[f] += b[f] ?? 0; return a; };
const pick = (u: any): Usage => Object.fromEntries(FIELDS.map((f) => [f, u?.[f] ?? 0])) as Usage;
const eq = (a: Usage, b: Usage) => FIELDS.every((f) => a[f] === b[f]);
/** modelUsage entry (camelCase) -> Usage. */
const fromMU = (x: any): Usage => ({ input_tokens: x?.inputTokens ?? 0, cache_creation_input_tokens: x?.cacheCreationInputTokens ?? 0, cache_read_input_tokens: x?.cacheReadInputTokens ?? 0, output_tokens: x?.outputTokens ?? 0 });
const u = (x: Usage | null | undefined) => (x ? `${x.input_tokens} / ${x.cache_creation_input_tokens} / ${x.cache_read_input_tokens} / **${x.output_tokens}**` : "–");

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

type Msg = { id: string; parent: string | null; model: string | null; truth: Usage; delta_seen: boolean };
type Proc = {
  turn: number; session_id: string | null; exit: number | null; cli: string | null;
  messages: Msg[];
  assistant_ids: { id: string; parent: string | null; model: string | null }[];
  results: { usage: Usage; modelUsage: Record<string, any> | null; total_cost_usd: number | null; num_turns: number | null }[];
  task_events: any[];
};

async function runProcess(chat: string, turn: number, resumeId: string | null): Promise<Proc> {
  const name = `${chat}-p${turn}`;
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${chat}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(settingsPath, JSON.stringify({ ...ISOLATION_SETTINGS }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--model", MODEL, "--effort", EFFORT,
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Bash", "--permission-mode", "dontAsk",
    ...(resumeId ? ["--resume", resumeId] : []),
  ];
  const t0 = Date.now();
  const log = (ev: any) => appendFileSync(logPath, JSON.stringify({ t: Date.now() - t0, ...ev }) + "\n");
  log({ runner: "spawn", args });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(loadPrompt(TURNS[turn - 1]));
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  const timeout = setTimeout(() => { log({ runner: "HARD_TIMEOUT" }); child.kill(); }, 10 * 60_000);

  const p: Proc = { turn, session_id: null, exit: null, cli: null, messages: [], assistant_ids: [], results: [], task_events: [] };
  const cur = new Map<string, Msg>(); // current API message per stream (parent_tool_use_id, "" = main)
  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "stream_event" && a.event?.type === "content_block_delta") {
      const d = a.event.delta ?? {};
      log({ type: "stream_event", parent_tool_use_id: a.parent_tool_use_id ?? null, event: { type: "content_block_delta", index: a.event.index, delta_type: d.type, len: String(d.text ?? d.thinking ?? d.partial_json ?? "").length } });
    } else log(a);
    const key = a.parent_tool_use_id ?? "";
    if (a.type === "system" && a.subtype === "init") { p.session_id ??= a.session_id; p.cli = a.claude_code_version; recordClaudeVersion("cli", a.claude_code_version); }
    else if (a.type === "system" && String(a.subtype).startsWith("task_")) p.task_events.push({ subtype: a.subtype, task_id: a.task_id, tool_use_id: a.tool_use_id, usage: a.usage ?? null, status: a.status ?? null });
    else if (a.type === "stream_event" && a.event?.type === "message_start") {
      const m: Msg = { id: a.event.message.id, parent: a.parent_tool_use_id ?? null, model: a.event.message.model ?? null, truth: pick(a.event.message.usage), delta_seen: false };
      m.truth.output_tokens = 0;
      cur.set(key, m); p.messages.push(m);
    } else if (a.type === "stream_event" && a.event?.type === "message_delta") {
      const m = cur.get(key);
      if (m && a.event.usage?.output_tokens != null) { m.truth.output_tokens = a.event.usage.output_tokens; m.delta_seen = true; }
    } else if (a.type === "assistant" && a.message?.id) {
      if (!p.assistant_ids.some((x) => x.id === a.message.id)) p.assistant_ids.push({ id: a.message.id, parent: a.parent_tool_use_id ?? null, model: a.message.model ?? null });
    } else if (a.type === "result") {
      p.results.push({ usage: pick(a.usage), modelUsage: a.modelUsage ?? null, total_cost_usd: a.total_cost_usd ?? null, num_turns: a.num_turns ?? null });
    }
  });
  p.exit = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  if (stderr.trim()) log({ runner: "stderr", text: stderr.trim().slice(0, 2000) });
  const main = p.messages.filter((m) => !m.parent), sub = p.messages.filter((m) => m.parent);
  console.log(`[${name}] exit=${p.exit} session=${p.session_id} stream msgs main=${main.length} sub=${sub.length} assistant ids main=${p.assistant_ids.filter((x) => !x.parent).length} sub=${p.assistant_ids.filter((x) => x.parent).length} results=${p.results.length}`);
  return p;
}

function readJsonl(f: string): any[] {
  return readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

/** One transcript: assistant entries dedup by message.id (last entry wins), entry types, cost-state entries. */
function readTranscript(f: string) {
  const entries = readJsonl(f);
  const types: Record<string, number> = {};
  const byMsg = new Map<string, { usage: Usage; model: string | null; entries: number; thinking: number | null }>();
  let naiveOut = 0;
  const costStates: any[] = [];
  for (const e of entries) {
    const k = `${e.type}${e.subtype ? ":" + e.subtype : ""}`;
    types[k] = (types[k] ?? 0) + 1;
    if (e.type === "cost-state") costStates.push(e);
    if (e.type !== "assistant" || !e.message?.id) continue;
    naiveOut += e.message.usage?.output_tokens ?? 0;
    const m = byMsg.get(e.message.id) ?? { usage: zero(), model: null, entries: 0, thinking: null };
    m.entries++; m.usage = pick(e.message.usage); m.model = e.message.model ?? m.model;
    m.thinking = e.message.usage?.output_tokens_details?.thinking_tokens ?? m.thinking;
    byMsg.set(e.message.id, m);
  }
  return { file: f, lines: entries.length, types, byMsg, naiveOut, costStates };
}

async function runChat(chat: string) {
  const procs: Proc[] = [];
  let sid: string | null = null;
  for (let t = 1; t <= TURNS.length; t++) { const p = await runProcess(chat, t, sid); procs.push(p); sid = p.session_id; }
  const sessionIds = [...new Set(procs.map((p) => p.session_id).filter(Boolean) as string[])];

  // ---- ground truth from the stream ----
  const allMsgs = procs.flatMap((p) => p.messages.map((m) => ({ ...m, turn: p.turn })));
  const truthBy = (pred: (m: Msg) => boolean, msgs = allMsgs) => msgs.filter(pred).reduce((s, m) => add(s, m.truth), zero());
  const truthByModel = (msgs: Msg[]) => { const o: Record<string, Usage> = {}; for (const m of msgs) add((o[m.model ?? "?"] ??= zero()), m.truth); return o; };
  const subStreamForwarded = allMsgs.some((m) => m.parent);
  const subAssistantIds = procs.flatMap((p) => p.assistant_ids.filter((x) => x.parent));

  // ---- runtime: each process's result ----
  let runMain = zero(), runAll = zero();
  const perProcess = procs.map((p) => {
    const pMain = truthBy((m) => !m.parent, p.messages.map((m) => ({ ...m })));
    const pAll = truthBy(() => true, p.messages.map((m) => ({ ...m })));
    runMain = add({ ...runMain }, pMain); runAll = add({ ...runAll }, pAll);
    const r = p.results[p.results.length - 1];
    const ru = r?.usage ?? null;
    const scope = (x: Usage | null) => !x ? null : eq(x, pMain) ? "process, main only" : eq(x, pAll) ? "process, main + subagents" : eq(x, runMain) ? "cumulative, main only" : eq(x, runAll) ? "cumulative, main + subagents" : "neither";
    const muAll = r?.modelUsage ? Object.values(r.modelUsage).reduce((s: Usage, x: any) => add(s, fromMU(x)), zero()) : null;
    return {
      turn: p.turn, session_id: p.session_id, exit: p.exit, results_in_stream: p.results.length,
      stream_messages: { main: p.messages.filter((m) => !m.parent).length, subagent: p.messages.filter((m) => m.parent).length, subagent_without_delta: p.messages.filter((m) => m.parent && !m.delta_seen).length },
      assistant_message_ids: { main: p.assistant_ids.filter((x) => !x.parent).length, subagent: p.assistant_ids.filter((x) => x.parent).length },
      truth_process_main: pMain, truth_process_all: pAll, truth_running_main: { ...runMain }, truth_running_all: { ...runAll },
      truth_process_by_model: truthByModel(p.messages),
      result_usage: ru, result_usage_scope: scope(ru),
      modelUsage: r?.modelUsage ?? null, modelUsage_sum: muAll, modelUsage_scope: scope(muAll),
      total_cost_usd: r?.total_cost_usd ?? null,
      task_events: p.task_events,
    };
  });

  // ---- session files ----
  const mainFiles = sessionIds.map((id) => join(SESSIONS_DIR, `${id}.jsonl`)).filter(existsSync);
  const subFiles = sessionIds.flatMap((id) => { const d = join(SESSIONS_DIR, id, "subagents"); return existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".jsonl")).map((f) => join(d, f)) : []; });
  const mains = mainFiles.map(readTranscript), subs = subFiles.map(readTranscript);
  const sumFiles = (ts: ReturnType<typeof readTranscript>[]) => {
    const seen = new Map<string, { usage: Usage; model: string | null }>();
    for (const t of ts) for (const [id, m] of t.byMsg) seen.set(id, m);
    const total = zero(); const byModel: Record<string, Usage> = {};
    for (const m of seen.values()) { add(total, m.usage); add((byModel[m.model ?? "?"] ??= zero()), m.usage); }
    return { messages: seen.size, total, byModel, ids: [...seen.keys()] };
  };
  const filesMain = sumFiles(mains), filesSub = sumFiles(subs), filesAll = sumFiles([...mains, ...subs]);
  const overlap = filesMain.ids.filter((id) => filesSub.ids.includes(id));
  const lastCost = mains.flatMap((t) => t.costStates).pop() ?? null;
  const costStateAll = lastCost ? Object.values(lastCost.modelUsage ?? {}).reduce((s: Usage, x: any) => add(s, fromMU(x)), zero()) : null;
  const costStateByModel = lastCost ? Object.fromEntries(Object.entries(lastCost.modelUsage ?? {}).map(([k, x]: any) => [k, { ...fromMU(x), thinking: x.thinkingTokens ?? null, costUSD: x.costUSD ?? null }])) : null;

  const truthMain = truthBy((m) => !m.parent), truthSub = truthBy((m) => !!m.parent), truthAll = truthBy(() => true);
  const verdict = {
    chat, model: MODEL, worker_model: SAME_MODEL ? "claude-haiku-5-5 (worker-haiku)" : "sonnet (worker)", effort: EFFORT, cli_version: procs[0]?.cli ?? null,
    session_ids: procs.map((p) => p.session_id),
    subagent_stream_events_forwarded: subStreamForwarded,
    subagent_assistant_events_in_stream: subAssistantIds.length,
    per_process: perProcess,
    truth: { main: truthMain, subagents: truthSub, all: truthAll, by_model: truthByModel(allMsgs) },
    files: {
      main_files: mains.map((t) => ({ file: t.file.split(/[\\/]/).slice(-1)[0], lines: t.lines, types: t.types, messages: t.byMsg.size, cost_states: t.costStates.length })),
      subagent_files: subs.map((t) => ({ file: t.file.split(/[\\/]/).slice(-2).join("/"), lines: t.lines, types: t.types, messages: t.byMsg.size, naive_output_sum: t.naiveOut, cost_states: t.costStates.length })),
      main_dedup: filesMain.total, main_equals_truth_main: eq(filesMain.total, truthMain),
      subagents_dedup: filesSub.total, subagents_equals_truth_subagents: subStreamForwarded ? eq(filesSub.total, truthSub) : null,
      all_dedup: filesAll.total, all_by_model: filesAll.byModel, all_equals_truth_all: subStreamForwarded ? eq(filesAll.total, truthAll) : null,
      message_ids_in_both_main_and_subagent_files: overlap.length,
      last_cost_state: lastCost ? { totalCostUSD: lastCost.totalCostUSD, by_model: costStateByModel, sum: costStateAll } : null,
      cost_state_scope: costStateAll ? (eq(costStateAll, truthAll) ? "main + subagents" : eq(costStateAll, truthMain) ? "main only" : eq(costStateAll, filesAll.total) ? "main + subagents (= files)" : "neither") : null,
      cost_state_equals_files_all: costStateAll ? eq(costStateAll, filesAll.total) : null,
    },
  };
  writeFileSync(join(RESULTS_DIR, `${chat}.verdict.json`), JSON.stringify(verdict, null, 2));
  return verdict;
}

async function main() {
  beginRun();
  const argv = process.argv.slice(2);
  const opt = (flag: string, def: string) => { const i = argv.indexOf(flag); return i < 0 ? def : argv[i + 1]; };
  const chats = Number(opt("--chats", "2"));
  const concurrency = Number(opt("--concurrency", "2"));
  const names = Array.from({ length: chats }, (_, i) => `chat${i + 1}`);
  const out: any[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, async () => { while (i < names.length) out.push(await runChat(names[i++])); }));
  out.sort((a, b) => a.chat.localeCompare(b.chat));

  const md = [
    `## Subagents: main ${MODEL} (effort ${EFFORT}), worker on ${SAME_MODEL ? "the same model" : "Sonnet"}; process 1 = 2 parallel workers, process 2 (--resume) = 1 worker`,
    "",
    "Usage cells: input / cache_creation / cache_read / **output**. Truth = stream_event message_start + message_delta, keyed by parent_tool_use_id.",
    "",
    "### Runtime: each process's result",
    "",
    "| chat | turn | stream msgs main / sub (sub without delta) | truth main (process) | truth main+sub (process) | result.usage | result.usage scope | modelUsage Σ | modelUsage scope | total_cost_usd | results in stream |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...out.flatMap((v) => v.per_process.map((p: any) => `| ${v.chat} | ${p.turn} | ${p.stream_messages.main} / ${p.stream_messages.subagent} (${p.stream_messages.subagent_without_delta}) | ${u(p.truth_process_main)} | ${u(p.truth_process_all)} | ${u(p.result_usage)} | ${p.result_usage_scope} | ${u(p.modelUsage_sum)} | ${p.modelUsage_scope} | ${p.total_cost_usd} | ${p.results_in_stream} |`)),
    "",
    "### Session files after the chat",
    "",
    "| chat | subagent stream_events forwarded | truth main | files main (dedup) | = | truth subagents | files subagents (dedup) | = | subagent files | last cost-state Σ | cost-state scope | cost-state = files all |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...out.map((v) => `| ${v.chat} | ${v.subagent_stream_events_forwarded} | ${u(v.truth.main)} | ${u(v.files.main_dedup)} | ${v.files.main_equals_truth_main ? "✅" : "❌"} | ${u(v.truth.subagents)} | ${u(v.files.subagents_dedup)} | ${v.files.subagents_equals_truth_subagents == null ? "–" : v.files.subagents_equals_truth_subagents ? "✅" : "❌"} | ${v.files.subagent_files.length} (${v.files.subagent_files.map((f: any) => f.messages).join("+")} msgs) | ${u(v.files.last_cost_state?.sum)} | ${v.files.cost_state_scope} | ${v.files.cost_state_equals_files_all ? "✅" : "❌"} |`),
    "",
    "### Per model (truth vs files vs last cost-state)",
    "",
    "| chat | model | truth | files (dedup) | cost-state | cost-state thinking | cost-state costUSD |",
    "|---|---|---|---|---|---|---|",
    ...out.flatMap((v) => [...new Set([...Object.keys(v.truth.by_model), ...Object.keys(v.files.all_by_model), ...Object.keys(v.files.last_cost_state?.by_model ?? {})])].map((m) =>
      `| ${v.chat} | ${m} | ${u(v.truth.by_model[m])} | ${u(v.files.all_by_model[m])} | ${u(v.files.last_cost_state?.by_model?.[m])} | ${v.files.last_cost_state?.by_model?.[m]?.thinking ?? "–"} | ${v.files.last_cost_state?.by_model?.[m]?.costUSD ?? "–"} |`)),
  ].join("\n");
  writeSummary("subagents-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
