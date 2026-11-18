/**
 * Offline (no model calls): the exact tokens of a real Claude Code session, read from its session files, compared
 * with the estimates of a CAIP-report (`resources/session-analyzers/claude-code/report.mjs`, the `.json` it writes
 * beside its HTML).
 *
 * From the files: every `assistant` entry of <session>.jsonl and of each subagents/agent-<id>.jsonl, deduplicated by
 * message.id (`<synthetic>` entries left out), plus each agent's .meta.json (agentType, description, toolUseId).
 * Checks:
 *   - files are consistent: every entry of one message carries the same output_tokens, with output_tokens_details
 *     and a stop_reason (no provisional values);
 *   - the per-model sum over all files equals the last cost-state of the main file;
 *   - per API call, the file's output_tokens against the report's callLog[].out, the call matched by its exact prompt
 *     (input / cache_read / cache_creation).
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/session-vs-report.ts [<session>.jsonl <CAIP-report>.json]
 *         (default: the sample in samples/8cb96fe0/). Subagent files are looked up in <dir>/<session-id>/subagents/
 *         (Claude Code's layout) or <dir>/subagents/ (the sample's).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { INVESTIGATION_DIR, RESULTS_DIR, beginRun, writeSummary } from "../../lib/claude-home.mjs";

const DEFAULT_SESSION = join(INVESTIGATION_DIR, "samples", "8cb96fe0", "8cb96fe0-c2f4-48ec-9875-cfbe43c0e91b.jsonl");
const DEFAULT_REPORT = join(INVESTIGATION_DIR, "samples", "8cb96fe0", "CAIP-report-8cb96fe0.json");

const readJsonl = (f: string): any[] => readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

type M = { id: string; model: string; outs: (number | null)[]; stops: (string | null)[]; thinking: number | null; details: boolean[]; blocks: string[]; u: any };

function main() {
  beginRun();
  const [sessionArg, reportArg] = process.argv.slice(2);
  const sessionFile = resolve(sessionArg ?? DEFAULT_SESSION);
  const reportFile = resolve(reportArg ?? DEFAULT_REPORT);
  const sid = basename(sessionFile, ".jsonl");
  const subDir = [join(dirname(sessionFile), sid, "subagents"), join(dirname(sessionFile), "subagents")].find(existsSync);
  const agents = [{ agent: "main", file: sessionFile, meta: null as any },
    ...(subDir ? readdirSync(subDir).filter((x) => x.endsWith(".jsonl")).map((x) => {
      const metaFile = join(subDir, x.replace(/\.jsonl$/, ".meta.json"));
      return { agent: x.slice(6, -6), file: join(subDir, x), meta: existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : null };
    }) : [])];
  const report = JSON.parse(readFileSync(reportFile, "utf8"));

  const versions = new Set<string>();
  let lastCost: any = null, costStates = 0;
  const filesByModel: Record<string, { output: number; thinking: number; input: number; cache_read: number; cache_write: number }> = {};
  const rows = agents.map(({ agent, file, meta }) => {
    const msgs = new Map<string, M>();
    for (const e of readJsonl(file)) {
      if (e.version) versions.add(e.version);
      if (e.type === "cost-state") { lastCost = e; costStates++; }
      if (e.type !== "assistant" || !e.message?.id) continue;
      const m = msgs.get(e.message.id) ?? { id: e.message.id, model: e.message.model, outs: [], stops: [], thinking: null, details: [], blocks: [], u: null };
      m.outs.push(e.message.usage?.output_tokens ?? null); m.stops.push(e.message.stop_reason ?? null);
      m.details.push(!!e.message.usage?.output_tokens_details);
      m.thinking = e.message.usage?.output_tokens_details?.thinking_tokens ?? m.thinking;
      m.blocks.push((e.message.content ?? []).map((b: any) => b.type).join("+")); m.u = e.message.usage;
      msgs.set(e.message.id, m);
    }
    const real = [...msgs.values()].filter((m) => m.model !== "<synthetic>");
    for (const m of real) {
      const t = (filesByModel[m.model] ??= { output: 0, thinking: 0, input: 0, cache_read: 0, cache_write: 0 });
      t.output += m.u.output_tokens ?? 0; t.thinking += m.thinking ?? 0; t.input += m.u.input_tokens ?? 0;
      t.cache_read += m.u.cache_read_input_tokens ?? 0; t.cache_write += m.u.cache_creation_input_tokens ?? 0;
    }
    const row = report.rows?.find((r: any) => r.id === agent);
    const calls: any[] = row?.callLog ?? [];
    const pairs = real.map((m, i) => {
      const c = calls.find((k) => k.fresh === (m.u.input_tokens ?? 0) && k.read === (m.u.cache_read_input_tokens ?? 0) && k.write === (m.u.cache_creation_input_tokens ?? 0));
      return { n: i + 1, id: m.id, blocks: m.blocks.join(" | "), output: m.u.output_tokens, thinking: m.thinking, report_out: c?.out ?? null, entries: m.outs.length };
    });
    const sum = (f: (p: any) => number) => pairs.reduce((s, p) => s + f(p), 0);
    return {
      agent, agentType: meta?.agentType ?? (agent === "main" ? "main session" : null), description: meta?.description ?? null, toolUseId: meta?.toolUseId ?? null,
      model: [...new Set(real.map((m) => m.model))].join(", "), messages: real.length, synthetic: msgs.size - real.length,
      entries: real.reduce((s, m) => s + m.outs.length, 0),
      provisional: {
        messages_with_differing_outputs: real.filter((m) => new Set(m.outs).size > 1).length,
        messages_without_output_tokens_details: real.filter((m) => !m.details.some(Boolean)).length,
        messages_with_null_stop_reason: real.filter((m) => m.stops.every((s) => s == null)).length,
      },
      output: sum((p) => p.output ?? 0), thinking: sum((p) => p.thinking ?? 0),
      naive_output_over_entries: real.reduce((s, m) => s + m.outs.reduce<number>((a, b) => a + (b ?? 0), 0), 0),
      report: row ? { label: row.agent, calls: calls.length, out_sum: calls.reduce((s, k) => s + (k.out ?? 0), 0) } : null,
      calls_matched: pairs.filter((p) => p.report_out != null).length,
      report_out_matched: sum((p) => p.report_out ?? 0),
      pairs,
    };
  });

  const cs = lastCost ? Object.fromEntries(Object.entries(lastCost.modelUsage ?? {}).map(([k, x]: any) => [k, { output: x.outputTokens, thinking: x.thinkingTokens, input: x.inputTokens, cache_read: x.cacheReadInputTokens, cache_write: x.cacheCreationInputTokens }])) : null;
  const csMatches = cs ? Object.keys({ ...cs, ...filesByModel }).every((k) => JSON.stringify(cs[k]) === JSON.stringify(filesByModel[k])) : null;
  const total = rows.reduce((s, r) => s + r.output, 0), totalReport = rows.reduce((s, r) => s + r.report_out_matched, 0);
  const verdict = {
    session: sid, session_file: sessionFile, report_file: reportFile, claude_code_versions: [...versions],
    cost_states: costStates, files_by_model: filesByModel, last_cost_state_by_model: cs, last_cost_state_equals_files: csMatches,
    output_total_files: total, output_total_report: totalReport, report_over_files: total ? totalReport / total : null,
    rows,
  };
  writeFileSync(join(RESULTS_DIR, `${sid.slice(0, 8)}.verdict.json`), JSON.stringify(verdict, null, 2));

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const md = [
    `## Session \`${sid}\` (Claude Code ${[...versions].join(", ")}): files vs CAIP-report`,
    "",
    `Files: \`${basename(sessionFile)}\` + ${rows.length - 1} subagent file(s). Report: \`${basename(reportFile)}\`.`,
    "",
    `Last cost-state = files (per model, all fields): **${csMatches == null ? "no cost-state" : csMatches ? "✅ exact" : "❌"}**. Output in the files: **${total}**, report estimate: **${totalReport}** (${pct(totalReport, total)}).`,
    "",
    "| agent | type | description | msgs | entries | provisional values | output (files) | of which thinking | naive Σ over entries | report out (matched calls) | report / files |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.agent} | ${r.agentType ?? "–"} | ${r.description ?? "–"} | ${r.messages} | ${r.entries} | ${r.provisional.messages_with_differing_outputs + r.provisional.messages_without_output_tokens_details + r.provisional.messages_with_null_stop_reason === 0 ? "none" : JSON.stringify(r.provisional)} | ${r.output} | ${r.thinking} | ${r.naive_output_over_entries} | ${r.report_out_matched} (${r.calls_matched}/${r.report?.calls ?? 0}) | ${pct(r.report_out_matched, r.output)} |`),
    "",
    "### Per API call",
    "",
    "| agent | # | blocks | output (files) | thinking | report out | report / (output − thinking) |",
    "|---|---|---|---|---|---|---|",
    ...rows.flatMap((r) => r.pairs.map((p: any) => `| ${r.agent.slice(0, 8)} | ${p.n} | ${p.blocks} | ${p.output} | ${p.thinking ?? 0} | ${p.report_out ?? "–"} | ${p.report_out == null ? "–" : pct(p.report_out, p.output - (p.thinking ?? 0))} |`)),
  ].join("\n");
  writeSummary("session-vs-report-summary.md", md);
  console.log(md.split("\n").slice(0, 10 + rows.length).join("\n"));
}

main();
