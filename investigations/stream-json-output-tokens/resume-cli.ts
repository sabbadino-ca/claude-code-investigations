/**
 * Multi-process chat: `claude -p` (turn 1), then `claude -p --resume <id>` twice (turns 2 and 3).
 * Two questions:
 *   A. At runtime: is each process's `result` (usage, modelUsage, total_cost_usd) that process only, or the
 *      conversation so far?
 *   B. After the chat: can every token (input, cache, output) be recovered from the session files alone?
 *
 * Ground truth, per API message: input / cache from stream_event message_start, output from stream_event
 * message_delta (every process runs with --include-partial-messages). The plain stream-json events are the same
 * with or without the flag (see output-tokens-cli.ts), so the session files written are the same too.
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/resume-cli.ts [--chats N] [--concurrency N]   (default 2, 2)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const MODEL = "claude-haiku-5-5";
const EFFORT = "medium";
const TURNS = ["resume-1", "resume-2", "resume-3"];
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const FIELDS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"] as const;
type Field = (typeof FIELDS)[number];
type Usage = Record<Field, number>;
const zero = (): Usage => ({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 });
const add = (a: Usage, b: Partial<Usage>) => { for (const f of FIELDS) a[f] += b[f] ?? 0; return a; };
const pick = (u: any): Usage => Object.fromEntries(FIELDS.map((f) => [f, u?.[f] ?? 0])) as Usage;
const eq = (a: Usage, b: Usage) => FIELDS.every((f) => a[f] === b[f]);

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

type Proc = {
  turn: number; session_id_in: string | null; session_id: string | null; exit: number | null; cli: string | null;
  messages: { id: string; truth: Usage }[];
  truth: Usage;
  result_usage: Usage | null; result_modelUsage: Record<string, any> | null; total_cost_usd: number | null; num_turns: number | null;
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
    "--allowedTools", "Bash", "--permission-mode", "dontAsk",
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

  const p: Proc = { turn, session_id_in: resumeId, session_id: null, exit: null, cli: null, messages: [], truth: zero(), result_usage: null, result_modelUsage: null, total_cost_usd: null, num_turns: null };
  let cur: { id: string; truth: Usage } | null = null;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "stream_event" && a.event?.type === "content_block_delta") {
      const d = a.event.delta ?? {};
      log({ type: "stream_event", event: { type: "content_block_delta", index: a.event.index, delta_type: d.type, len: String(d.text ?? d.thinking ?? d.partial_json ?? "").length } });
    } else log(a);
    if (a.type === "system" && a.subtype === "init") { p.session_id = a.session_id; p.cli = a.claude_code_version; recordClaudeVersion("cli", a.claude_code_version); }
    else if (a.type === "stream_event" && a.event?.type === "message_start") {
      cur = { id: a.event.message.id, truth: pick(a.event.message.usage) };
      cur.truth.output_tokens = 0;
      p.messages.push(cur);
    } else if (a.type === "stream_event" && a.event?.type === "message_delta" && cur) {
      if (a.event.usage?.output_tokens != null) cur.truth.output_tokens = a.event.usage.output_tokens;
    } else if (a.type === "result") {
      p.result_usage = pick(a.usage); p.result_modelUsage = a.modelUsage ?? null; p.total_cost_usd = a.total_cost_usd ?? null; p.num_turns = a.num_turns ?? null;
      if (a.session_id) p.session_id = a.session_id;
    }
  });
  p.exit = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  for (const m of p.messages) add(p.truth, m.truth);
  if (stderr.trim()) log({ runner: "stderr", text: stderr.trim().slice(0, 2000) });
  console.log(`[${name}] exit=${p.exit} session=${p.session_id} msgs=${p.messages.length} truth.out=${p.truth.output_tokens} result.out=${p.result_usage?.output_tokens} cost=${p.total_cost_usd}`);
  return p;
}

/** Everything the session files hold for these sessions: assistant entries grouped by message.id, plus entry types. */
function readSessionFiles(sessionIds: string[]) {
  const files = [...new Set(sessionIds)].map((id) => join(SESSIONS_DIR, `${id}.jsonl`));
  const perFile: Record<string, any> = {};
  const byMsg = new Map<string, { usage: Usage; entries: number; files: Set<string>; values: number[]; details: any }>();
  const allTypes: Record<string, number> = {};
  const costLike: string[] = [];
  for (const f of files) {
    if (!existsSync(f)) { perFile[f] = { exists: false }; continue; }
    const lines = readFileSync(f, "utf8").split("\n").filter(Boolean);
    const types: Record<string, number> = {};
    const ids = new Set<string>();
    for (const l of lines) {
      let e: any; try { e = JSON.parse(l); } catch { continue; }
      const k = `${e.type}${e.subtype ? ":" + e.subtype : ""}`;
      types[k] = (types[k] ?? 0) + 1; allTypes[k] = (allTypes[k] ?? 0) + 1;
      if (/cost|modelUsage|total_cost/i.test(l) && costLike.length < 5) costLike.push(`${f.split(/[\\/]/).pop()}: ${k}: ${l.slice(0, 200)}`);
      if (e.type !== "assistant" || !e.message?.id) continue;
      ids.add(e.message.id);
      const m = byMsg.get(e.message.id) ?? { usage: zero(), entries: 0, files: new Set<string>(), values: [], details: null };
      m.entries++; m.files.add(f.split(/[\\/]/).pop()!); m.values.push(e.message.usage?.output_tokens ?? null);
      m.usage = pick(e.message.usage); m.details = e.message.usage?.output_tokens_details ?? m.details;
      byMsg.set(e.message.id, m);
    }
    perFile[f.split(/[\\/]/).pop()!] = { lines: lines.length, types, message_ids: ids.size };
  }
  const subagentDirs = sessionIds.filter((id) => existsSync(join(SESSIONS_DIR, id, "subagents")));
  return { perFile, byMsg, allTypes, costLike, subagentDirs };
}

async function runChat(chat: string) {
  const procs: Proc[] = [];
  let sid: string | null = null;
  for (let t = 1; t <= TURNS.length; t++) {
    const p = await runProcess(chat, t, sid);
    procs.push(p);
    sid = p.session_id;
  }
  const sessionIds = [...new Set(procs.map((p) => p.session_id).filter(Boolean) as string[])];
  const files = readSessionFiles(sessionIds);

  // Ground truth for the whole chat, and the running sum after each process.
  const truthTotal = procs.reduce((u, p) => add(u, p.truth), zero());
  const running: Usage[] = [];
  procs.reduce((u, p) => { const n = add({ ...u }, p.truth); running.push(n); return n; }, zero());

  const perProcess = procs.map((p, i) => {
    const mu = p.result_modelUsage ? Object.values(p.result_modelUsage) as any[] : [];
    const muOut = mu.reduce((s, x) => s + (x.outputTokens ?? 0), 0);
    const muIn = mu.reduce((s, x) => s + (x.inputTokens ?? 0), 0);
    const muCost = mu.reduce((s, x) => s + (x.costUSD ?? 0), 0);
    return {
      turn: p.turn, session_id_in: p.session_id_in, session_id: p.session_id, exit: p.exit, num_turns: p.num_turns,
      api_messages: p.messages.map((m) => m.id),
      truth_this_process: p.truth, truth_running_total: running[i],
      result_usage: p.result_usage,
      result_usage_equals: p.result_usage ? (eq(p.result_usage, p.truth) ? "this process" : eq(p.result_usage, running[i]) ? "running total" : "neither") : null,
      modelUsage: p.result_modelUsage,
      modelUsage_outputTokens: muOut,
      modelUsage_output_equals: muOut === p.truth.output_tokens ? "this process" : muOut === running[i].output_tokens ? "running total" : "neither",
      modelUsage_inputTokens: muIn,
      modelUsage_input_equals: muIn === p.truth.input_tokens ? "this process" : muIn === running[i].input_tokens ? "running total" : "neither",
      modelUsage_costUSD: muCost,
      total_cost_usd: p.total_cost_usd,
    };
  });

  // Session files after the chat, deduplicated by message.id.
  const fromFiles = zero();
  const perMessage: any[] = [];
  const truthById = new Map(procs.flatMap((p) => p.messages.map((m) => [m.id, { turn: p.turn, truth: m.truth }] as const)));
  for (const [id, m] of files.byMsg) {
    add(fromFiles, m.usage);
    const t = truthById.get(id);
    perMessage.push({ id, turn: t?.turn ?? null, files: [...m.files], entries: m.entries, output_values_in_file: m.values, file_usage: m.usage, output_tokens_details: m.details, truth: t?.truth ?? null, equals_truth: t ? eq(m.usage, t.truth) : null });
  }
  const missing = [...truthById.keys()].filter((id) => !files.byMsg.has(id));
  const naiveSum = [...files.byMsg.values()].reduce((s, m) => s + m.values.reduce((a, b) => a + (b ?? 0), 0), 0);

  const verdict = {
    chat, model: MODEL, effort: EFFORT, cli_version: procs[0]?.cli ?? null,
    session_ids: procs.map((p) => p.session_id),
    same_session_id_across_resume: sessionIds.length === 1,
    per_process: perProcess,
    truth_total: truthTotal,
    session_files: {
      files: files.perFile, entry_types: files.allTypes, subagent_dirs: files.subagentDirs,
      lines_mentioning_cost_or_modelUsage: files.costLike,
      totals_dedup_by_message_id: fromFiles,
      equals_truth_total: eq(fromFiles, truthTotal),
      naive_output_sum_over_entries: naiveSum,
      messages_in_stream_missing_from_files: missing,
      messages_in_files_not_in_stream: [...files.byMsg.keys()].filter((id) => !truthById.has(id)),
      per_message: perMessage,
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

  const u = (x: any) => (x ? `${x.input_tokens} / ${x.cache_creation_input_tokens} / ${x.cache_read_input_tokens} / **${x.output_tokens}**` : "–");
  const md = [
    `## Multi-process chat: \`claude -p\`, then \`claude -p --resume\` ×2: ${MODEL}, effort ${EFFORT}`,
    "",
    "Usage cells: input / cache_creation / cache_read / **output**. Truth = stream_event message_start (input, cache) + message_delta (output), summed over the process's API messages.",
    "",
    "### A. Runtime: what each process's `result` covers",
    "",
    "| chat | turn | session_id | msgs | truth (this process) | truth (running total) | result.usage | result.usage = | modelUsage out | modelUsage in | modelUsage = (out / in) | total_cost_usd | modelUsage costUSD |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...out.flatMap((v) => v.per_process.map((p: any) => `| ${v.chat} | ${p.turn} | \`${String(p.session_id).slice(0, 8)}\` | ${p.api_messages.length} | ${u(p.truth_this_process)} | ${u(p.truth_running_total)} | ${u(p.result_usage)} | ${p.result_usage_equals} | ${p.modelUsage_outputTokens} | ${p.modelUsage_inputTokens} | ${p.modelUsage_output_equals} / ${p.modelUsage_input_equals} | ${p.total_cost_usd} | ${p.modelUsage_costUSD} |`)),
    "",
    "### B. After the chat: the session files alone",
    "",
    "| chat | same session_id across --resume | files | entry types | truth total | files, dedup by message.id | equal | naive output Σ over entries | missing from files | cost / modelUsage in files |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...out.map((v) => `| ${v.chat} | ${v.same_session_id_across_resume} | ${Object.entries(v.session_files.files).map(([f, x]: any) => `${f.slice(0, 8)}: ${x.lines ?? "missing"} lines, ${x.message_ids ?? 0} msgs`).join("<br>")} | ${Object.entries(v.session_files.entry_types).map(([k, n]) => `${k}:${n}`).join(", ")} | ${u(v.truth_total)} | ${u(v.session_files.totals_dedup_by_message_id)} | ${v.session_files.equals_truth_total ? "✅" : "❌"} | ${v.session_files.naive_output_sum_over_entries} | ${v.session_files.messages_in_stream_missing_from_files.length} | ${v.session_files.lines_mentioning_cost_or_modelUsage.length ? "yes" : "none"} |`),
    "",
    "### Per message (session files vs truth)",
    "",
    "| chat | turn | message.id | entries in file | output values in file | file usage | truth | equal | thinking_tokens |",
    "|---|---|---|---|---|---|---|---|---|",
    ...out.flatMap((v) => v.session_files.per_message.map((m: any) => `| ${v.chat} | ${m.turn ?? "?"} | \`${m.id.slice(-8)}\` | ${m.entries} | ${m.output_values_in_file.join(", ")} | ${u(m.file_usage)} | ${u(m.truth)} | ${m.equals_truth ? "✅" : "❌"} | ${m.output_tokens_details?.thinking_tokens ?? "–"} |`)),
  ].join("\n");
  writeSummary("resume-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
