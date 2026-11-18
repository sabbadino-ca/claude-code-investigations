/**
 * Offline (no model calls): can the cost of every agent of a session, subagents included, be computed from the
 * session files, and does it add up to what Claude Code itself records?
 *
 * For every session under .claude-home/projects/sessions/ that has a `cost-state` entry:
 *   - reads <session>.jsonl and <session>/subagents/agent-*.jsonl; keeps one usage per message.id (last entry);
 *   - prices each message: input, output, cache write 5m / 1h (usage.cache_creation.ephemeral_*), cache read,
 *     with the per-model prices below;
 *   - sums per agent (main, each agent-<id>) and per model, and compares each model's sum with the last
 *     cost-state's modelUsage[model].costUSD and the total with totalCostUSD.
 *
 * Prices: $/MTok, Claude API first-party, from the claude-api skill bundled with Claude Code 2.1.327 (table cached
 * 2026-11-03). Cache write 5m = 1.25x input, 1h = 2x input; cache read as listed. Haiku 5.5 prices are for prompts up
 * to 100K tokens; no prompt here goes over (the check would fail if one did).
 *
 * Usage:  npx tsx investigations/stream-json-output-tokens/cost-check.ts
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR, beginRun, writeSummary, RESULTS_DIR } from "../../lib/claude-home.mjs";
import { writeFileSync } from "node:fs";

const PRICES: Record<string, { input: number; output: number; write5m: number; write1h: number; read: number }> = {
  "claude-haiku-5-5": { input: 0.10, output: 0.50, write5m: 0.125, write1h: 0.20, read: 0.01 },
  "claude-sonnet-5-5": { input: 2.00, output: 10.00, write5m: 2.50, write1h: 4.00, read: 0.10 },
};

const readJsonl = (f: string): any[] => readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

function priceOf(model: string, u: any): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const c = u.cache_creation ?? {};
  const w5 = c.ephemeral_5m_input_tokens ?? 0, w1 = c.ephemeral_1h_input_tokens ?? 0;
  const unsplit = (u.cache_creation_input_tokens ?? 0) - w5 - w1; // a write not split by TTL: priced as 5m
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (w5 + Math.max(0, unsplit)) * p.write5m + w1 * p.write1h + (u.cache_read_input_tokens ?? 0) * p.read) / 1e6;
}

function main() {
  beginRun();
  const sessions = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".jsonl")).map((f) => f.slice(0, -6));
  const rows: any[] = [];
  for (const sid of sessions) {
    const mainFile = join(SESSIONS_DIR, `${sid}.jsonl`);
    const subDir = join(SESSIONS_DIR, sid, "subagents");
    const agents: { agent: string; file: string }[] = [{ agent: "main", file: mainFile }];
    if (existsSync(subDir) && statSync(subDir).isDirectory())
      for (const f of readdirSync(subDir).filter((x) => x.endsWith(".jsonl"))) agents.push({ agent: f.slice(0, -6), file: join(subDir, f) });

    let costState: any = null;
    const perAgent: any[] = [];
    const perModel: Record<string, number> = {};
    let unpriced = 0;
    for (const a of agents) {
      const msgs = new Map<string, any>();
      for (const e of readJsonl(a.file)) {
        if (e.type === "cost-state") costState = e;
        if (e.type === "assistant" && e.message?.id && e.message?.usage) msgs.set(e.message.id, e.message);
      }
      let cost = 0; const models = new Set<string>(); let out = 0;
      for (const m of msgs.values()) {
        const c = priceOf(m.model, m.usage);
        if (c == null) { unpriced++; continue; }
        cost += c; models.add(m.model); out += m.usage.output_tokens ?? 0;
        perModel[m.model] = (perModel[m.model] ?? 0) + c;
      }
      perAgent.push({ agent: a.agent, messages: msgs.size, models: [...models], output_tokens: out, cost_usd: cost });
    }
    if (!costState) continue;
    const modelChecks = Object.entries(costState.modelUsage ?? {}).map(([model, x]: any) => ({
      model, computed: perModel[model] ?? 0, cost_state: x.costUSD, diff: (perModel[model] ?? 0) - x.costUSD,
    }));
    const computedTotal = Object.values(perModel).reduce((s, x) => s + x, 0);
    rows.push({
      session: sid, agents: perAgent, unpriced_messages: unpriced, per_model: modelChecks,
      computed_total: computedTotal, cost_state_total: costState.totalCostUSD, total_diff: computedTotal - costState.totalCostUSD,
      models_missing_from_files: Object.keys(costState.modelUsage ?? {}).filter((m) => !(m in perModel)),
    });
  }
  const tol = 1e-9;
  const exact = (d: number) => Math.abs(d) < tol;
  const modelsChecked = rows.flatMap((r) => r.per_model);
  const verdict = {
    prices_usd_per_mtok: PRICES,
    sessions_with_cost_state: rows.length,
    model_entries_checked: modelsChecked.length,
    model_entries_exact: modelsChecked.filter((m) => exact(m.diff)).length,
    totals_exact: rows.filter((r) => exact(r.total_diff)).length,
    sessions_with_subagents: rows.filter((r) => r.agents.length > 1).length,
    rows,
  };
  writeFileSync(join(RESULTS_DIR, "cost-check.verdict.json"), JSON.stringify(verdict, null, 2));

  const usd = (x: number) => `$${x.toFixed(8)}`;
  const md = [
    "## Cost recomputed from the session files vs Claude Code's own `cost-state`",
    "",
    `Prices ($/MTok): ${Object.entries(PRICES).map(([m, p]) => `${m} in ${p.input} / out ${p.output} / write5m ${p.write5m} / write1h ${p.write1h} / read ${p.read}`).join("; ")}.`,
    "",
    `Sessions with a cost-state: **${rows.length}**. Per-model entries matching \`costUSD\` exactly (|diff| < 1e-9): **${verdict.model_entries_exact}/${verdict.model_entries_checked}**. Totals matching \`totalCostUSD\`: **${verdict.totals_exact}/${rows.length}**.`,
    "",
    "### Sessions with subagents: cost per agent",
    "",
    "| session | agent | model(s) | msgs | output tokens | computed cost |",
    "|---|---|---|---|---|---|",
    ...rows.filter((r) => r.agents.length > 1).flatMap((r) => [
      ...r.agents.map((a: any) => `| \`${r.session.slice(0, 8)}\` | ${a.agent} | ${a.models.join(", ")} | ${a.messages} | ${a.output_tokens} | ${usd(a.cost_usd)} |`),
      `| \`${r.session.slice(0, 8)}\` | **sum** | | | | **${usd(r.computed_total)}** (cost-state ${usd(r.cost_state_total)}, ${exact(r.total_diff) ? "✅" : "❌ " + r.total_diff})|`,
    ]),
    "",
    "### Every session",
    "",
    "| session | agents | model | computed | cost-state costUSD | exact |",
    "|---|---|---|---|---|---|",
    ...rows.flatMap((r) => r.per_model.map((m: any) => `| \`${r.session.slice(0, 8)}\` | ${r.agents.length} | ${m.model} | ${usd(m.computed)} | ${usd(m.cost_state)} | ${exact(m.diff) ? "✅" : "❌ " + m.diff} |`)),
  ].join("\n");
  writeSummary("cost-check-summary.md", md);
  console.log(md.split("\n").slice(0, 6).join("\n"));
}

main();
