/**
 * Does `claude -p --output-format stream-json --verbose` report the real output-token count of each API message?
 * Without --include-partial-messages the stream has only `assistant` events (message.usage); with it, the raw API
 * events (message_start, content_block_delta, message_delta) also arrive, wrapped in `stream_event`.
 *
 * For every API message (message.id) the driver compares the output_tokens seen in:
 *   - assistant events (one per content block: first / last / naive sum over events)
 *   - stream_event message_start and message_delta (partial mode only)
 *   - the session transcript .jsonl (assistant entries with the same message.id)
 * and checks every per-message source, summed, against the final `result` event (usage and modelUsage).
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/output-tokens-cli.ts [--reps N] [--concurrency N]
 *           [--modes plain,partial] [scenario ...]   (default: all scenarios, both modes, 3 reps, concurrency 3)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const MODEL = "claude-haiku-5-5";
const EFFORT = "medium";
const SCENARIOS = ["short-text", "long-text", "very-long-text", "one-tool", "multi-tool"] as const;
type Mode = "plain" | "partial";
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

type Msg = {
  id: string;
  model?: string;
  assistant_events: { blocks: string[]; output_tokens: number | null; stop_reason: string | null }[];
  message_start_output_tokens: number | null;
  message_delta_output_tokens: number[];
  message_delta_stop_reason: string | null;
  transcript_output_tokens: number[];
};

async function runOne(scenario: string, mode: Mode, rep: number) {
  const name = `${scenario}-${mode}-r${rep}`;
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(settingsPath, JSON.stringify({ ...ISOLATION_SETTINGS }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", ...(mode === "partial" ? ["--include-partial-messages"] : []),
    "--model", MODEL, "--effort", EFFORT,
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Bash", "--permission-mode", "dontAsk",
  ];
  const t0 = Date.now();
  // Timeline: every stream line, except content_block_delta payloads, which are reduced to type + length.
  const log = (ev: any) => appendFileSync(logPath, JSON.stringify({ t: Date.now() - t0, ...ev }) + "\n");

  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(loadPrompt(scenario));
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  const timeout = setTimeout(() => { log({ runner: "HARD_TIMEOUT" }); child.kill(); }, 10 * 60_000);

  const msgs = new Map<string, Msg>();
  const order: string[] = [];
  const msg = (id: string) => {
    if (!msgs.has(id)) { msgs.set(id, { id, assistant_events: [], message_start_output_tokens: null, message_delta_output_tokens: [], message_delta_stop_reason: null, transcript_output_tokens: [] }); order.push(id); }
    return msgs.get(id)!;
  };
  let currentStreamId: string | null = null;
  let sessionId: string | undefined, cliVersion: string | undefined, result: any = null;
  const counts: Record<string, number> = {};

  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { log({ unparsed: line.slice(0, 500) }); return; }
    const key = a.type === "stream_event" ? `stream_event:${a.event?.type}` : `${a.type}${a.subtype ? ":" + a.subtype : ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
    if (a.type === "stream_event" && a.event?.type === "content_block_delta") {
      const d = a.event.delta ?? {};
      log({ type: "stream_event", event: { type: "content_block_delta", index: a.event.index, delta_type: d.type, len: String(d.text ?? d.thinking ?? d.partial_json ?? "").length } });
    } else log(a);

    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version;
      recordClaudeVersion("cli", a.claude_code_version);
    } else if (a.type === "assistant" && a.message?.id) {
      const m = msg(a.message.id);
      m.model = a.message.model;
      m.assistant_events.push({
        blocks: (a.message.content ?? []).map((b: any) => b.type),
        output_tokens: a.message.usage?.output_tokens ?? null,
        stop_reason: a.message.stop_reason ?? null,
      });
    } else if (a.type === "stream_event") {
      const e = a.event ?? {};
      if (e.type === "message_start" && e.message?.id) {
        currentStreamId = e.message.id;
        msg(e.message.id).message_start_output_tokens = e.message.usage?.output_tokens ?? null;
      } else if (e.type === "message_delta" && currentStreamId) {
        const m = msg(currentStreamId);
        if (e.usage?.output_tokens != null) m.message_delta_output_tokens.push(e.usage.output_tokens);
        m.message_delta_stop_reason = e.delta?.stop_reason ?? m.message_delta_stop_reason;
      }
    } else if (a.type === "result") result = a;
  });
  const exitCode: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);

  // Transcript: assistant entries of the main session, grouped by message.id.
  const transcriptPath = sessionId ? join(SESSIONS_DIR, `${sessionId}.jsonl`) : null;
  const transcriptOtherIds: string[] = [];
  if (transcriptPath && existsSync(transcriptPath)) {
    for (const l of readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean)) {
      let e: any; try { e = JSON.parse(l); } catch { continue; }
      if (e.type !== "assistant" || !e.message?.id) continue;
      if (!msgs.has(e.message.id)) transcriptOtherIds.push(e.message.id);
      msg(e.message.id).transcript_output_tokens.push(e.message.usage?.output_tokens ?? null);
    }
  }

  const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  const last = <T,>(xs: T[]) => (xs.length ? xs[xs.length - 1] : null);
  const perMessage = order.map((id) => {
    const m = msgs.get(id)!;
    const ae = m.assistant_events.map((x) => x.output_tokens);
    return {
      id, model: m.model ?? null,
      assistant_events: m.assistant_events.length,
      assistant_blocks: m.assistant_events.map((x) => x.blocks.join("+")),
      assistant_output_tokens: ae,
      assistant_stop_reasons: m.assistant_events.map((x) => x.stop_reason),
      message_start_output_tokens: m.message_start_output_tokens,
      message_delta_output_tokens: m.message_delta_output_tokens,
      message_delta_stop_reason: m.message_delta_stop_reason,
      transcript_output_tokens: m.transcript_output_tokens,
    };
  });

  const resultOut: number | null = result?.usage?.output_tokens ?? null;
  const modelUsageOut = result?.modelUsage ? Object.fromEntries(Object.entries(result.modelUsage).map(([k, v]: any) => [k, v.outputTokens])) : null;
  const modelUsageTotal = modelUsageOut ? sum(Object.values(modelUsageOut) as number[]) : null;
  const totals = {
    result_usage_output_tokens: resultOut,
    result_modelUsage_output_tokens: modelUsageOut,
    assistant_first_per_message: sum(perMessage.map((p) => p.assistant_output_tokens[0])),
    assistant_last_per_message: sum(perMessage.map((p) => last(p.assistant_output_tokens))),
    assistant_max_per_message: sum(perMessage.map((p) => Math.max(0, ...p.assistant_output_tokens.map((x) => x ?? 0)))),
    assistant_naive_sum_all_events: sum(perMessage.flatMap((p) => p.assistant_output_tokens)),
    message_start_sum: mode === "partial" ? sum(perMessage.map((p) => p.message_start_output_tokens)) : null,
    message_delta_last_sum: mode === "partial" ? sum(perMessage.map((p) => last(p.message_delta_output_tokens))) : null,
    transcript_last_per_message: sum(perMessage.map((p) => last(p.transcript_output_tokens))),
    transcript_naive_sum_all_entries: sum(perMessage.flatMap((p) => p.transcript_output_tokens)),
  };
  const ref = resultOut;
  const matches = (v: number | null) => (v == null || ref == null ? null : v === ref);
  const verdict = {
    run: name, scenario, mode, rep, model: MODEL, effort: EFFORT,
    cli_version: cliVersion ?? null, exit_code: exitCode, session_id: sessionId ?? null,
    api_messages: perMessage.length,
    totals,
    matches_result_usage: {
      result_modelUsage_total: matches(modelUsageTotal),
      assistant_first_per_message: matches(totals.assistant_first_per_message),
      assistant_last_per_message: matches(totals.assistant_last_per_message),
      assistant_naive_sum_all_events: matches(totals.assistant_naive_sum_all_events),
      message_delta_last_sum: matches(totals.message_delta_last_sum),
      transcript_last_per_message: matches(totals.transcript_last_per_message),
    },
    per_message: perMessage,
    transcript_ids_not_in_stream: transcriptOtherIds,
    event_counts: counts,
    result_subtype: result?.subtype ?? null, num_turns: result?.num_turns ?? null,
    cost_usd: result?.total_cost_usd ?? null, duration_ms: result?.duration_ms ?? null,
    final_text_chars: typeof result?.result === "string" ? result.result.length : null,
    stderr: stderr.trim().slice(0, 2000) || null,
    session_log: transcriptPath,
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`[${name}] exit=${exitCode} msgs=${perMessage.length} result=${ref} assistant(first/last/naive)=${totals.assistant_first_per_message}/${totals.assistant_last_per_message}/${totals.assistant_naive_sum_all_events} delta=${totals.message_delta_last_sum} transcript=${totals.transcript_last_per_message}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return verdict;
}

async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); }
  }));
  return out;
}

async function main() {
  beginRun();
  const argv = process.argv.slice(2);
  const opt = (flag: string, def: string) => { const i = argv.indexOf(flag); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const reps = Number(opt("--reps", "3"));
  const concurrency = Number(opt("--concurrency", "3"));
  const modes = opt("--modes", "plain,partial").split(",") as Mode[];
  const scenarios = argv.length ? argv : [...SCENARIOS];
  const jobs: (() => Promise<any>)[] = [];
  for (let r = 1; r <= reps; r++) for (const s of scenarios) for (const m of modes) jobs.push(() => runOne(s, m, r));
  const v = await pool(jobs, concurrency);
  v.sort((a, b) => a.run.localeCompare(b.run));

  const yn = (x: boolean | null) => (x == null ? "–" : x ? "✅" : "❌");
  const lines = [
    `## Output tokens in \`claude -p --output-format stream-json --verbose\`: ${MODEL}, effort ${EFFORT}`,
    "",
    "Columns are sums over the run's API messages (one per `message.id`). Reference: `result.usage.output_tokens`.",
    "",
    "| run | msgs | result.usage | modelUsage | assistant first | assistant last | assistant naive Σ events | message_start | message_delta | transcript | delta = result | last assistant = result |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...v.map((x) => `| ${x.run} | ${x.api_messages} | ${x.totals.result_usage_output_tokens} | ${Object.values(x.totals.result_modelUsage_output_tokens ?? {}).join("+")} | ` +
      `${x.totals.assistant_first_per_message} | ${x.totals.assistant_last_per_message} | ${x.totals.assistant_naive_sum_all_events} | ` +
      `${x.totals.message_start_sum ?? "–"} | ${x.totals.message_delta_last_sum ?? "–"} | ${x.totals.transcript_last_per_message} | ` +
      `${yn(x.matches_result_usage.message_delta_last_sum)} | ${yn(x.matches_result_usage.assistant_last_per_message)} |`),
    "",
    "### Per message",
    "",
    "| run | message.id | assistant events (blocks: output_tokens) | message_start | message_delta | transcript |",
    "|---|---|---|---|---|---|",
    ...v.flatMap((x) => x.per_message.map((p: any) => `| ${x.run} | \`${p.id.slice(-8)}\` | ${p.assistant_blocks.map((b: string, i: number) => `${b}: ${p.assistant_output_tokens[i]}`).join("<br>") || "none"} | ` +
      `${p.message_start_output_tokens ?? "–"} | ${p.message_delta_output_tokens.join(", ") || "–"} | ${p.transcript_output_tokens.join(", ") || "–"} |`)),
  ];
  writeSummary("output-tokens-cli-summary.md", lines.join("\n"));
  console.log(lines.slice(0, 6 + v.length).join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
