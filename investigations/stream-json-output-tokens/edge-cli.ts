/**
 * Edge cases for output tokens in `claude -p` stream-json and in the session files.
 *
 *   kill-tool-use    process killed at the first main `assistant` tool_use event (before its message_delta: the way a
 *                    host stops a process on a question card), then `--resume` to continue
 *   kill-mid-text    process killed while the long answer is streaming (after 150 text deltas), then `--resume`
 *   flags-text       long answer with --thinking-display summarized --forward-subagent-text
 *   flags-subagents  2 parallel worker-haiku subagents with the same two flags
 *   background       2 worker-haiku subagents with run_in_background true
 *   nested           main --Agent--> nester --Agent--> worker-haiku
 *   max-tokens       long answer with CLAUDE_CODE_MAX_OUTPUT_TOKENS=300
 *
 * Every process runs with --include-partial-messages: ground truth per API message is message_start (input/cache) +
 * message_delta (output), keyed by parent_tool_use_id. A message whose message_delta never arrived has no truth.
 * After each scenario every .jsonl of the session is read (main file and everything under <session>/), deduplicated
 * by message.id, and compared with the truth and with the last cost-state.
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/edge-cli.ts [--reps N] [--concurrency N] [scenario ...]
 *         (default: all scenarios, 2 reps, concurrency 3)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const MODEL = "claude-haiku-5-5";
const EFFORT = "medium";
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const FLAGS = ["--thinking-display", "summarized", "--forward-subagent-text"];
const FIELDS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"] as const;
type Usage = Record<(typeof FIELDS)[number], number>;
const zero = (): Usage => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
const add = (a: Usage, b: Partial<Usage>) => { for (const f of FIELDS) a[f] += b[f] ?? 0; return a; };
const pick = (u: any): Usage => Object.fromEntries(FIELDS.map((f) => [f, u?.[f] ?? 0])) as Usage;
const eq = (a: Usage, b: Usage) => FIELDS.every((f) => a[f] === b[f]);
const fromMU = (x: any): Usage => ({ input_tokens: x?.inputTokens ?? 0, cache_creation_input_tokens: x?.cacheCreationInputTokens ?? 0, cache_read_input_tokens: x?.cacheReadInputTokens ?? 0, output_tokens: x?.outputTokens ?? 0 });

type Kill = (a: any, st: { textDeltas: number }) => boolean;
type Step = { prompt: string; args?: string[]; env?: Record<string, string>; kill?: Kill; killNote?: string };
const SCENARIOS: Record<string, Step[]> = {
  "kill-tool-use": [
    { prompt: "one-tool", kill: (a) => a.type === "assistant" && !a.parent_tool_use_id && (a.message?.content ?? []).some((b: any) => b.type === "tool_use"), killNote: "at the first main assistant tool_use event" },
    { prompt: "edge-continue" },
  ],
  "kill-mid-text": [
    { prompt: "long-text", kill: (_a, st) => st.textDeltas >= 150, killNote: "after 150 main text deltas" },
    { prompt: "edge-continue" },
  ],
  "flags-text": [{ prompt: "long-text", args: FLAGS }],
  "flags-subagents": [{ prompt: "subagents-same-1", args: FLAGS }],
  "background": [{ prompt: "edge-background" }],
  "nested": [{ prompt: "edge-nested" }],
  "max-tokens": [{ prompt: "long-text", env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: "300" } }],
};

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV, ...extra };
}

type Msg = { id: string; parent: string | null; process: number; truth: Usage; delta: boolean; stop_reason: string | null };
type Proc = {
  step: number; args: string[]; env: Record<string, string>; killed: boolean; kill_note: string | null; exit: number | null; session_id: string | null;
  messages: Msg[]; results: any[];
  assistant_events: { main: number; sub: number; sub_text_blocks: number; sub_ids: number };
  sub_stream_events: number; event_counts: Record<string, number>; stderr: string | null;
};

async function runProcess(name: string, n: number, step: Step, resumeId: string | null): Promise<Proc> {
  const logPath = join(RESULTS_DIR, `${name}-p${n}.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(settingsPath, JSON.stringify({ ...ISOLATION_SETTINGS }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--model", MODEL, "--effort", EFFORT,
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Bash", "--permission-mode", "dontAsk",
    ...(step.args ?? []), ...(resumeId ? ["--resume", resumeId] : []),
  ];
  const t0 = Date.now();
  const log = (ev: any) => appendFileSync(logPath, JSON.stringify({ t: Date.now() - t0, ...ev }) + "\n");
  log({ runner: "spawn", args, env: step.env ?? {} });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(step.env), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(loadPrompt(step.prompt));
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  const timeout = setTimeout(() => { log({ runner: "HARD_TIMEOUT" }); child.kill(); }, 10 * 60_000);

  const p: Proc = { step: n, args: step.args ?? [], env: step.env ?? {}, killed: false, kill_note: step.killNote ?? null, exit: null, session_id: null, messages: [], results: [], assistant_events: { main: 0, sub: 0, sub_text_blocks: 0, sub_ids: 0 }, sub_stream_events: 0, event_counts: {}, stderr: null };
  const cur = new Map<string, Msg>();
  const subIds = new Set<string>();
  const st = { textDeltas: 0 };
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (p.killed) return;
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    const k = a.type === "stream_event" ? `stream_event:${a.event?.type}` : `${a.type}${a.subtype ? ":" + a.subtype : ""}`;
    p.event_counts[k] = (p.event_counts[k] ?? 0) + 1;
    if (a.type === "stream_event" && a.event?.type === "content_block_delta") {
      const d = a.event.delta ?? {};
      if (!a.parent_tool_use_id && d.type === "text_delta") st.textDeltas++;
      log({ type: "stream_event", parent_tool_use_id: a.parent_tool_use_id ?? null, event: { type: "content_block_delta", index: a.event.index, delta_type: d.type, len: String(d.text ?? d.thinking ?? d.partial_json ?? "").length } });
    } else log(a);
    const key = a.parent_tool_use_id ?? "";
    if (a.type === "system" && a.subtype === "init") { p.session_id ??= a.session_id; recordClaudeVersion("cli", a.claude_code_version); }
    else if (a.type === "stream_event") {
      if (a.parent_tool_use_id) p.sub_stream_events++;
      const e = a.event ?? {};
      if (e.type === "message_start") {
        const m: Msg = { id: e.message.id, parent: a.parent_tool_use_id ?? null, process: n, truth: pick(e.message.usage), delta: false, stop_reason: null };
        m.truth.output_tokens = 0; cur.set(key, m); p.messages.push(m);
      } else if (e.type === "message_delta") {
        const m = cur.get(key);
        if (m && e.usage?.output_tokens != null) { m.truth.output_tokens = e.usage.output_tokens; m.delta = true; m.stop_reason = e.delta?.stop_reason ?? null; }
      }
    } else if (a.type === "assistant") {
      if (a.parent_tool_use_id) {
        p.assistant_events.sub++; if (a.message?.id) subIds.add(a.message.id);
        p.assistant_events.sub_text_blocks += (a.message?.content ?? []).filter((b: any) => b.type === "text").length;
      } else p.assistant_events.main++;
    } else if (a.type === "result") {
      p.results.push({ subtype: a.subtype, stop_reason: a.stop_reason ?? null, usage: pick(a.usage), modelUsage: a.modelUsage ?? null, total_cost_usd: a.total_cost_usd ?? null, num_turns: a.num_turns ?? null });
    }
    if (step.kill && !p.killed && step.kill(a, st)) { p.killed = true; log({ runner: "KILL", note: step.killNote }); child.kill(); }
  });
  p.exit = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  p.assistant_events.sub_ids = subIds.size;
  p.stderr = stderr.trim().slice(0, 1500) || null;
  if (p.stderr) log({ runner: "stderr", text: p.stderr });
  return p;
}

function jsonlFilesUnder(d: string): string[] {
  if (!existsSync(d) || !statSync(d).isDirectory()) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? jsonlFilesUnder(join(d, e.name)) : e.name.endsWith(".jsonl") ? [join(d, e.name)] : []);
}
const readJsonl = (f: string): any[] => readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

async function runScenario(scenario: string, rep: number) {
  const name = `${scenario}-r${rep}`;
  const procs: Proc[] = [];
  let sid: string | null = null;
  for (const [i, step] of SCENARIOS[scenario].entries()) { const p = await runProcess(name, i + 1, step, sid); procs.push(p); sid = p.session_id ?? sid; }
  const sessionIds = [...new Set(procs.map((p) => p.session_id).filter(Boolean) as string[])];

  // ---- session files ----
  const files = sessionIds.flatMap((id) => [join(SESSIONS_DIR, `${id}.jsonl`), ...jsonlFilesUnder(join(SESSIONS_DIR, id))]).filter(existsSync);
  const fileMsgs = new Map<string, { file: string; usage: Usage; model: string | null; outputs: number[]; stop_reasons: (string | null)[]; details: boolean }>();
  const costStates: any[] = [];
  const perFile: any[] = [];
  for (const f of files) {
    const es = readJsonl(f);
    let msgs = 0;
    for (const e of es) {
      if (e.type === "cost-state") costStates.push(e);
      if (e.type !== "assistant" || !e.message?.id) continue;
      const m = fileMsgs.get(e.message.id) ?? { file: relative(SESSIONS_DIR, f).replace(/\\/g, "/"), usage: zero(), model: null, outputs: [], stop_reasons: [], details: false };
      if (!fileMsgs.has(e.message.id)) msgs++;
      m.usage = pick(e.message.usage); m.model = e.message.model ?? m.model;
      m.outputs.push(e.message.usage?.output_tokens ?? null); m.stop_reasons.push(e.message.stop_reason ?? null);
      m.details ||= !!e.message.usage?.output_tokens_details;
      fileMsgs.set(e.message.id, m);
    }
    perFile.push({ file: relative(SESSIONS_DIR, f).replace(/\\/g, "/"), lines: es.length, messages: msgs, cost_states: es.filter((e) => e.type === "cost-state").length });
  }

  // ---- checks ----
  const streamMsgs = procs.flatMap((p) => p.messages);
  const withTruth = streamMsgs.filter((m) => m.delta);
  const noTruth = streamMsgs.filter((m) => !m.delta);
  const fileVsTruth = withTruth.map((m) => ({ id: m.id, process: m.process, parent: m.parent, truth: m.truth, file: fileMsgs.get(m.id)?.usage ?? null, equal: fileMsgs.has(m.id) ? eq(fileMsgs.get(m.id)!.usage, m.truth) : false }));
  const unfinished = noTruth.map((m) => {
    const f = fileMsgs.get(m.id);
    return { id: m.id, process: m.process, parent: m.parent, message_start: m.truth, in_files: !!f, file_outputs: f?.outputs ?? null, file_stop_reasons: f?.stop_reasons ?? null, file_has_output_tokens_details: f?.details ?? null };
  });
  const filesByModel: Record<string, Usage> = {};
  // `<synthetic>` entries are Claude Code's own placeholders (interrupted request, API error text), zero usage,
  // never in cost-state: left out of the per-model comparison.
  for (const m of fileMsgs.values()) if (m.model !== "<synthetic>") add((filesByModel[m.model ?? "?"] ??= zero()), m.usage);
  const lastCost = costStates[costStates.length - 1] ?? null;
  const costByModel = lastCost ? Object.fromEntries(Object.entries(lastCost.modelUsage ?? {}).map(([k, x]) => [k, fromMU(x)])) : null;
  const costMatchesFiles = costByModel ? Object.keys({ ...costByModel, ...filesByModel }).every((k) => costByModel[k] && filesByModel[k] && eq(costByModel[k], filesByModel[k])) : null;
  const resultSum = procs.flatMap((p) => p.results).reduce((s, r) => add(s, r.usage), zero());
  const truthMainSum = withTruth.filter((m) => !m.parent).reduce((s, m) => add(s, m.truth), zero());
  const fileMessagesNotInStream = [...fileMsgs.keys()].filter((id) => !streamMsgs.some((m) => m.id === id));
  // file entries whose stop_reason is null on every entry: a provisional-looking record
  const fileMsgsNoStop = [...fileMsgs.entries()].filter(([, m]) => m.stop_reasons.every((s) => s == null)).map(([id, m]) => ({ id, file: m.file, outputs: m.outputs }));

  const verdict = {
    run: name, scenario, rep, model: MODEL, effort: EFFORT,
    session_ids: procs.map((p) => p.session_id),
    processes: procs.map((p) => ({ step: p.step, args: p.args, env: p.env, killed: p.killed, kill_note: p.kill_note, exit: p.exit, results: p.results, stream_messages: p.messages.length, stream_messages_with_delta: p.messages.filter((m) => m.delta).length, delta_stop_reasons: p.messages.map((m) => m.stop_reason), assistant_events: p.assistant_events, subagent_stream_events: p.sub_stream_events, event_counts: p.event_counts, stderr: p.stderr })),
    files: perFile,
    checks: {
      stream_messages_with_truth: withTruth.length,
      file_equals_truth: fileVsTruth.filter((x) => x.equal).length,
      file_vs_truth_mismatches: fileVsTruth.filter((x) => !x.equal),
      unfinished_messages: unfinished,
      file_messages_not_in_stream: fileMessagesNotInStream.length,
      file_messages_with_null_stop_reason: fileMsgsNoStop,
      cost_states: costStates.length,
      last_cost_state_equals_files_per_model: costMatchesFiles,
      files_by_model: filesByModel, cost_state_by_model: costByModel,
      results_total: procs.reduce((s, p) => s + p.results.length, 0),
      sum_result_usage: resultSum, truth_main_sum: truthMainSum, sum_result_usage_equals_truth_main: eq(resultSum, truthMainSum),
    },
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  const c = verdict.checks;
  console.log(`[${name}] procs=${procs.map((p) => `${p.killed ? "KILLED" : "exit " + p.exit}/${p.results.length}r`).join(",")} files=${perFile.length} file=truth ${c.file_equals_truth}/${c.stream_messages_with_truth} unfinished=${unfinished.length} fileOnly=${c.file_messages_not_in_stream} costState=${c.cost_states} cs=files ${c.last_cost_state_equals_files_per_model} Σresult=truthMain ${c.sum_result_usage_equals_truth_main}`);
  return verdict;
}

async function main() {
  beginRun();
  const argv = process.argv.slice(2);
  const opt = (flag: string, def: string) => { const i = argv.indexOf(flag); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const reps = Number(opt("--reps", "2"));
  const concurrency = Number(opt("--concurrency", "3"));
  const names = argv.length ? argv : Object.keys(SCENARIOS);
  const jobs: (() => Promise<any>)[] = [];
  for (let r = 1; r <= reps; r++) for (const s of names) jobs.push(() => runScenario(s, r));
  const out: any[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => { while (i < jobs.length) out.push(await jobs[i++]()); }));
  out.sort((a, b) => a.run.localeCompare(b.run));

  const u = (x: any) => (x ? `${x.input_tokens} / ${x.cache_creation_input_tokens} / ${x.cache_read_input_tokens} / **${x.output_tokens}**` : "–");
  const yn = (x: boolean | null) => (x == null ? "–" : x ? "✅" : "❌");
  const md = [
    `## Edge cases: ${MODEL}, effort ${EFFORT}`,
    "",
    "Truth = stream_event message_start + message_delta per API message (main and, when forwarded, subagents). Files = every .jsonl of the session, dedup by message.id.",
    "",
    "| run | processes (killed / exit, results) | session files | file = truth (messages with message_delta) | unfinished messages (no message_delta): in files? outputs | file messages not in stream | file msgs with null stop_reason | cost-state entries | last cost-state = files per model | Σ result.usage = truth main |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...out.map((v) => `| ${v.run} | ${v.processes.map((p: any) => `${p.killed ? "KILLED" : "exit " + p.exit}, ${p.results.length} result${p.results.length === 1 ? "" : "s"}${p.results.length ? " (" + p.results.map((r: any) => r.subtype + "/" + (r.stop_reason ?? "–")).join(", ") + ")" : ""}`).join("<br>")} | ${v.files.map((f: any) => `${f.file.length > 30 ? "…" + f.file.slice(-28) : f.file}: ${f.messages}`).join("<br>")} | ${v.checks.file_equals_truth}/${v.checks.stream_messages_with_truth} | ${v.checks.unfinished_messages.map((m: any) => `p${m.process}${m.parent ? " sub" : ""}: ${m.in_files ? "yes, " + m.file_outputs.join("/") : "no"} (start ${m.message_start.output_tokens})`).join("<br>") || "none"} | ${v.checks.file_messages_not_in_stream} | ${v.checks.file_messages_with_null_stop_reason.length} | ${v.checks.cost_states} | ${yn(v.checks.last_cost_state_equals_files_per_model)} | ${yn(v.checks.sum_result_usage_equals_truth_main)} |`),
    "",
    "### Per run: stream details",
    "",
    "| run | process | args / env | stream msgs (with delta) | delta stop_reasons | subagent stream_events | subagent assistant events (text blocks, ids) | results usage |",
    "|---|---|---|---|---|---|---|---|",
    ...out.flatMap((v) => v.processes.map((p: any) => `| ${v.run} | ${p.step} | ${[...p.args, ...Object.entries(p.env).map(([k, x]) => `${k}=${x}`)].join(" ") || "–"} | ${p.stream_messages} (${p.stream_messages_with_delta}) | ${p.delta_stop_reasons.join(", ")} | ${p.subagent_stream_events} | ${p.assistant_events.sub} (${p.assistant_events.sub_text_blocks}, ${p.assistant_events.sub_ids}) | ${p.results.map((r: any) => u(r.usage)).join("<br>") || "–"} |`)),
  ].join("\n");
  writeSummary("edge-cli-summary.md", md);
  console.log(md.split("\n").slice(0, 6 + out.length).join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
