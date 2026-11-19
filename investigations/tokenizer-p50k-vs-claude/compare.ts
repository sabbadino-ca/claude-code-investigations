/**
 * Tokenizes every text of corpus/corpus.jsonl twice and compares:
 *   - p50k: gpt-tokenizer v4.0.0 p50k_base (vendor/gpt-tokenizer, a verbatim copy of the one the c4 session analyzers
 *     vendor under tests/vscode/resources/session-analyzers/vendor/gpt-tokenizer), countTokens(text);
 *   - claude: POST /v1/messages/count_tokens (free, no model call) with the text as the only user message,
 *     authenticated with the run's OAuth token (Bearer + anthropic-beta: oauth-2025-04-20; there is no API key).
 * Claude's count includes the message framing, so the driver subtracts it: framing = count("x") - 1, measured once per
 * model ("x" is one token in p50k and, being a single ASCII letter, one in any BPE). Hence claude(text) = count(text) - framing.
 * A chars/4 estimate is reported too as a baseline.
 *
 * Usage:  npx tsx investigations/tokenizer-p50k-vs-claude/compare.ts [--models a,b,...] [--concurrency N] [--limit N]
 */
import { INVESTIGATION_DIR, ISOLATION_ENV, RESULTS_DIR, beginRun, writeSummary } from "../../lib/claude-home.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore: vendored plain ESM, no types
import { countTokens } from "./vendor/gpt-tokenizer/esm/encoding/p50k_base.js";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODELS = arg("models", "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5,claude-opus-4-7,claude-sonnet-4-5").split(",");
const CONCURRENCY = Number(arg("concurrency", "4"));
const LIMIT = Number(arg("limit", "0"));
const BETAS = "oauth-2025-04-20";
let token = "";
let nCalls = 0, n429 = 0;

async function count(model: string, text: string): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    nCalls++;
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": BETAS, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text }] }] }),
    });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) {
      n429++;
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
      continue;
    }
    if (!res.ok) throw new Error(`count_tokens ${model} ${res.status}: ${body.slice(0, 300)}`);
    return JSON.parse(body).input_tokens;
  }
  throw new Error(`count_tokens ${model}: still failing after retries`);
}

async function pool<T, R>(xs: T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < xs.length) { const i = next++; out[i] = await f(xs[i], i); } }));
  return out;
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const f2 = (x: number) => x.toFixed(2), f3 = (x: number) => x.toFixed(3), f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const table = (head: string[], rows: (string | number)[][]) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
const BUCKETS: [string, number][] = [["< 200 chars", 200], ["200–1k", 1_000], ["1k–5k", 5_000], ["5k–20k", 20_000], ["≥ 20k", Infinity]];
const bucketOf = (n: number) => BUCKETS.find(([, b]) => n < b)![0];

type Row = { id: string; category: string; chars: number; p50k: number; c4: number; claude: number };
/** Statistics of p50k against Claude over a set of rows. ratio = p50k / claude: < 1 means p50k underestimates. */
function stats(rows: Row[]) {
  const P = rows.map((r) => r.p50k), C = rows.map((r) => r.claude), ratio = rows.map((r) => r.p50k / r.claude);
  const sumP = P.reduce((a, b) => a + b, 0), sumC = C.reduce((a, b) => a + b, 0), sumC4 = rows.reduce((a, r) => a + r.c4, 0);
  const err = rows.map((r) => (r.p50k - r.claude) / r.claude);
  return {
    n: rows.length, mean_p50k: mean(P), mean_claude: mean(C), sum_p50k: sumP, sum_claude: sumC,
    weighted_ratio: sumP / sumC, // Σp50k / Σclaude: the error on a total
    chars4_ratio: sumC4 / sumC,
    mean_ratio: mean(ratio), median_ratio: q(ratio, 0.5), p10_ratio: q(ratio, 0.1), p90_ratio: q(ratio, 0.9), sd_ratio: sd(ratio),
    mean_abs_err: mean(err.map(Math.abs)),
    share_under: rows.filter((r) => r.p50k < r.claude).length / rows.length, share_over: rows.filter((r) => r.p50k > r.claude).length / rows.length,
    correction: sumC / sumP, // multiply p50k by this to get Claude on a total
    chars_per_claude_token: rows.reduce((a, r) => a + r.chars, 0) / sumC,
  };
}
const statRow = (label: string, s: ReturnType<typeof stats>) => [label, s.n, f0(s.mean_p50k), f0(s.mean_claude), f3(s.weighted_ratio), f3(s.median_ratio), `${f3(s.p10_ratio)}–${f3(s.p90_ratio)}`, `${(s.mean_abs_err * 100).toFixed(1)}%`, `${Math.round(s.share_under * 100)}%`, f3(s.correction), f2(s.chars_per_claude_token)];
const STAT_HEAD = ["set", "n", "mean p50k", "mean Claude", "Σp50k/ΣClaude", "median ratio", "p10–p90 ratio", "mean abs err", "p50k under", "×correction", "chars/Claude tok"];

async function main() {
  beginRun();
  token = JSON.parse(readFileSync(join(ISOLATION_ENV.CLAUDE_CONFIG_DIR, ".credentials.json"), "utf8")).claudeAiOauth?.accessToken;
  let corpus: any[] = readFileSync(join(INVESTIGATION_DIR, "corpus", "corpus.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  if (LIMIT) corpus = corpus.slice(0, LIMIT);
  const p50k = corpus.map((c) => countTokens(c.text) as number);
  console.log(`${corpus.length} texts, ${MODELS.length} models`);

  const perModel: Record<string, Row[]> = {}, framing: Record<string, number> = {}, failed: Record<string, string> = {};
  for (const model of MODELS) {
    try {
      framing[model] = (await count(model, "x")) - 1;
      let done = 0;
      const counts = await pool(corpus, CONCURRENCY, async (c) => { const n = await count(model, c.text); if (++done % 50 === 0) console.log(`  ${model}: ${done}/${corpus.length}`); return n; });
      perModel[model] = corpus.map((c, i) => ({ id: c.id, category: c.category, chars: c.chars, p50k: p50k[i], c4: Math.ceil(c.chars / 4), claude: counts[i] - framing[model] }));
      console.log(`${model}: framing ${framing[model]}, done`);
    } catch (e: any) { failed[model] = String(e.message ?? e); console.log(`${model}: FAILED ${failed[model]}`); }
  }
  const ok = Object.keys(perModel);
  if (!ok.length) throw new Error("no model could be counted");

  // per-item output
  writeFileSync(join(RESULTS_DIR, "items.jsonl"), corpus.map((c, i) => JSON.stringify({ id: c.id, category: c.category, source: c.source, chars: c.chars, p50k: p50k[i], chars4: Math.ceil(c.chars / 4), claude: Object.fromEntries(ok.map((m) => [m, perModel[m][i].claude])) })).join("\n") + "\n");

  // do the models share a tokenizer?
  const ref = ok[0];
  const sameAs = Object.fromEntries(ok.map((m) => [m, perModel[m].filter((r, i) => r.claude === perModel[ref][i].claude).length / corpus.length]));

  const verdict: any = { models: ok, failed, framing, calls: nCalls, retries: n429, items: corpus.length, chars: corpus.reduce((a, c) => a + c.chars, 0), identical_counts_vs_first_model: sameAs, per_model: {} };
  let md = `Corpus: \`corpus/corpus.jsonl\`, ${corpus.length} texts, ${f0(verdict.chars)} chars. p50k = vendored gpt-tokenizer 4.0.0 p50k_base. Claude = count_tokens minus the message framing (count("x") − 1).\n\n`;
  md += `**ratio = p50k / Claude**: below 1 means p50k **underestimates** the real count. "×correction" = ΣClaude/Σp50k, the factor to multiply a p50k total by. "p50k under" = share of texts where p50k < Claude.\n\n`;
  md += `count_tokens requests: ${nCalls} (${n429} retried on 429/5xx).${Object.keys(failed).length ? ` Models that failed: ${Object.entries(failed).map(([m, e]) => `${m} (${e})`).join("; ")}.` : ""}\n\n`;

  md += `## Overall, per model\n\n` + table([...STAT_HEAD, "chars/4 vs Claude", "framing", `same counts as ${ref}`], ok.map((m) => { const s = stats(perModel[m]); verdict.per_model[m] = { overall: s }; return [...statRow(m, s), f3(s.chars4_ratio), framing[m], `${Math.round(sameAs[m] * 100)}%`]; }));

  for (const m of ok) {
    const rows = perModel[m];
    const cats = [...new Set(rows.map((r) => r.category))].sort();
    const byCat = Object.fromEntries(cats.map((c) => [c, stats(rows.filter((r) => r.category === c))]));
    const byBucket = Object.fromEntries(BUCKETS.map(([b]) => [b, rows.filter((r) => bucketOf(r.chars) === b)]).filter(([, rs]) => (rs as Row[]).length).map(([b, rs]) => [b, stats(rs as Row[])]));
    const groups: Record<string, string[]> = {
      "prose (sentences, prompts, assistant text, markdown)": ["sentence-en", "sentence-it", "user-prompt", "assistant-text", "markdown"],
      "JSON (tool inputs, schemas, events, files)": ["tool-input-json", "tool-schema-json", "jsonl-event", "stream-json-event", "json-pretty", "json-minified"],
      "tool results": ["result-read", "result-bash", "result-grep-glob", "result-agent", "result-other"],
      "code / html / system prompt / context": ["code", "html", "system-prompt", "context-blob"],
    };
    const byGroup = Object.fromEntries(Object.entries(groups).filter(([, cs]) => rows.some((r) => cs.includes(r.category))).map(([g, cs]) => [g, stats(rows.filter((r) => cs.includes(r.category)))]));
    Object.assign(verdict.per_model[m], { by_category: byCat, by_length: byBucket, by_group: byGroup });
    md += `\n## ${m}\n\n### By kind of content\n\n` + table(STAT_HEAD, Object.entries(byGroup).map(([g, s]) => statRow(g, s)));
    md += `\n### By category\n\n` + table(STAT_HEAD, cats.map((c) => statRow(c, byCat[c])));
    md += `\n### By length\n\n` + table(STAT_HEAD, Object.entries(byBucket).map(([b, s]) => statRow(b, s)));
    const worst = [...rows].sort((a, b) => a.p50k / a.claude - b.p50k / b.claude);
    md += `\n### Extremes (texts ≥ 50 Claude tokens)\n\n` + table(["id", "chars", "p50k", "Claude", "ratio"], [...worst.filter((r) => r.claude >= 50).slice(0, 5), ...worst.filter((r) => r.claude >= 50).slice(-5)].map((r) => [r.id, r.chars, r.p50k, r.claude, f3(r.p50k / r.claude)]));
  }
  const s0 = verdict.per_model[ref].overall;
  verdict.answer = { model: ref, p50k_direction: s0.weighted_ratio < 1 ? "underestimates" : "overestimates", weighted_ratio: s0.weighted_ratio, correction: s0.correction, mean_p50k: s0.mean_p50k, mean_claude: s0.mean_claude };
  writeFileSync(join(RESULTS_DIR, "compare.verdict.json"), JSON.stringify(verdict, null, 2));
  writeSummary("compare-summary.md", md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
