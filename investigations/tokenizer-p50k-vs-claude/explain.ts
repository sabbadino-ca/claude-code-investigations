/**
 * Why is p50k further from Claude on the two real sessions (×1.38) than on the corpus (×1.29)?
 *
 * 1. Features. Every piece of both datasets gets text features (share of non-ASCII chars, accented letters, digits,
 *    hex/UUID runs, whitespace, indentation, symbols, uppercase, Italian/English stopwords, mean word length, lines).
 *    Claude counts are NOT requested again: they come from the latest compare run (items.jsonl, claude-opus-5-5,
 *    same counts as claude-sonnet-5-5) and the latest sessions run (sessions.items.jsonl, matched by sha256 prefix).
 *    The session texts are re-read from the given paths, in memory only.
 * 2. Weighted least squares of log(Claude/p50k) on the features (weight = Claude tokens, so totals drive the fit), then a
 *    decomposition of the gap between the two datasets: Σ β_k (mean_k sessions − mean_k corpus) + unexplained.
 *    The same per-feature bins are tabulated for both datasets.
 * 3. Probes: synthetic strings of one kind each (UUIDs, hashes, paths, Italian, English, accents, box-drawing, emoji,
 *    indentation, camelCase identifiers, numbers...) counted with both tokenizers, to see the mechanism directly.
 *
 * Usage:  npx tsx investigations/tokenizer-p50k-vs-claude/explain.ts <session path> [...] [--model m] [--no-probes]
 */
import { INVESTIGATION_DIR, ISOLATION_ENV, RESULTS_DIR, beginRun, writeSummary, latestRunDir } from "../../lib/claude-home.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { jsonlUnder, piecesOf } from "./pieces.ts";
// @ts-ignore: vendored plain ESM, no types
import { countTokens } from "./vendor/gpt-tokenizer/esm/encoding/p50k_base.js";

const argv = process.argv.slice(2);
const flag = (k: string) => { const i = argv.indexOf(`--${k}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const MODEL = opt("model", "claude-sonnet-5-5");
const NO_PROBES = flag("no-probes");
const ROOTS = argv.map((p) => resolve(p));
const sha = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 12);
const readJsonl = (f: string) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const f2 = (x: number) => x.toFixed(2), f3 = (x: number) => x.toFixed(3), f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const table = (head: string[], rows: (string | number)[][]) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;

// ---------------- features ----------------
const IT = new Set("di che il la le per non con una un sono del della dei delle nel nella è al alla gli lo si come anche più da questo questa ma se ci ha essere viene quando dove sul sulla".split(" "));
const EN = new Set("the and of to is in that for it with as on are be this by an or from at not can if which when you should".split(" "));
const FEATURES = ["nonAscii", "accented", "digits", "hexRuns", "whitespace", "indent", "symbols", "upper", "itWords", "enWords", "wordLen", "lineLen"] as const;
type F = Record<(typeof FEATURES)[number], number>;
function features(t: string): F {
  const n = t.length || 1;
  const cnt = (re: RegExp) => (t.match(re) ?? []).length;
  const words = t.toLowerCase().match(/[a-zàèéìòù]+/g) ?? [];
  const nw = words.length || 1;
  const lines = t.split("\n");
  return {
    nonAscii: cnt(/[^\x00-\x7f]/g) / n,
    accented: cnt(/[àèéìòùÀÈÉÌÒÙ]/g) / n,
    digits: cnt(/[0-9]/g) / n,
    hexRuns: (t.match(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f-]{8,}\b/gi) ?? []).join("").length / n,
    whitespace: cnt(/\s/g) / n,
    indent: lines.reduce((a, l) => a + (l.match(/^[ \t]*/)![0].length), 0) / n,
    symbols: cnt(/[{}\[\]":,;=<>\/\\|_#*`()]/g) / n,
    upper: cnt(/[A-Z]/g) / n,
    itWords: words.filter((w) => IT.has(w)).length / nw,
    enWords: words.filter((w) => EN.has(w)).length / nw,
    wordLen: words.reduce((a, w) => a + w.length, 0) / nw,
    lineLen: n / lines.length / 100,
  };
}

type P = { set: "corpus" | "sessions"; category: string; text: string; p50k: number; claude: number; f: F };

/** Weighted least squares with intercept: returns [b0, b1..bk]. */
function wls(X: number[][], y: number[], w: number[]): number[] {
  const k = X[0].length + 1;
  const A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  X.forEach((row, i) => { const r = [1, ...row]; for (let a = 0; a < k; a++) { b[a] += w[i] * r[a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += w[i] * r[a] * r[c]; } });
  for (let a = 0; a < k; a++) A[a][a] += 1e-9;
  for (let c = 0; c < k; c++) { // Gauss-Jordan
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const m = A[r][c] / A[c][c]; for (let x = c; x < k; x++) A[r][x] -= m * A[c][x]; b[r] -= m * b[c]; }
  }
  return b.map((v, i) => v / A[i][i]);
}
const wmean = (xs: number[], w: number[]) => xs.reduce((a, x, i) => a + x * w[i], 0) / w.reduce((a, b) => a + b, 0);

// ---------------- probes ----------------
function probes(): [string, string][] {
  const S = JSON.parse(readFileSync(join(INVESTIGATION_DIR, "corpus", "sentences.json"), "utf8"));
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const hex = (n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(rnd() * 16)]).join("");
  const rep = (f: () => string, n: number, sep = "\n") => Array.from({ length: n }, f).join(sep);
  const words = ["model", "node", "artifact", "slice", "edge", "member", "layout", "context", "requirement", "scenario", "feature", "container", "component", "relation"];
  const pick = () => words[Math.floor(rnd() * words.length)];
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  const obj = { id: "n-123", name: "OrderService", type: "container", technology: "ASP.NET Core", children: [{ id: "c-1", name: "OrderController", members: [{ name: "Create", kind: "method", returns: "Task<OrderDto>" }, { name: "Cancel", kind: "method", returns: "Task" }] }], tags: ["backend", "orders"] };
  const deep = { a: { b: { c: { d: { e: obj } } } } };
  return [
    ["English prose", S.en.join("\n\n")],
    ["Italian prose", S.it.join("\n\n")],
    ["Italian words with accents (è, più, perché, già, così)", rep(() => "è più perché già così però città qualità attività verrà", 20, " ")],
    ["UUIDs", rep(() => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`, 40)],
    ["hex hashes (40 chars)", rep(() => hex(40), 30)],
    ["Windows paths", rep(() => `C:\\Users\\dev\\Desktop\\repo\\src\\${pick()}\\${cap(pick())}${cap(pick())}.cs`, 40)],
    ["POSIX paths", rep(() => `/home/dev/repo/src/${pick()}/${pick()}-${pick()}.ts`, 40)],
    ["camelCase identifiers", rep(() => `caip${cap(pick())}${cap(pick())}${cap(pick())}`, 80, " ")],
    ["snake_case identifiers", rep(() => `${pick()}_${pick()}_${pick()}`, 80, " ")],
    ["integers and decimals", rep(() => `${Math.floor(rnd() * 100000)} ${(rnd() * 1000).toFixed(3)}`, 60, " ")],
    ["JSON minified", JSON.stringify(Array.from({ length: 6 }, () => deep))],
    ["JSON pretty, 2 spaces", JSON.stringify(Array.from({ length: 6 }, () => deep), null, 2)],
    ["JSON pretty, 4 spaces", JSON.stringify(Array.from({ length: 6 }, () => deep), null, 4)],
    ["JSON pretty, tabs", JSON.stringify(Array.from({ length: 6 }, () => deep), null, "\t")],
    ["markdown table", "| id | name | type | status |\n|---|---|---|---|\n" + rep(() => `| ${hex(6)} | ${cap(pick())}${cap(pick())} | ${pick()} | ok |`, 40)],
    ["markdown bullets '- name: description'", rep(() => `- ${pick()}-${pick()}: ${cap(pick())} ${pick()} for the ${pick()} ${pick()}, used when the ${pick()} changes.`, 30)],
    ["box drawing and arrows (├ └ ─ → ✓)", rep(() => `├─ ${pick()} → ${pick()} ✓\n└─ ${pick()} ─ ${pick()}`, 30)],
    ["emoji", rep(() => "✅ done 🚀 deploy ⚠️ warning ❌ failed 📄 file", 20)],
    ["C# code", rep(() => `public async Task<${cap(pick())}Dto> Get${cap(pick())}Async(Guid id, CancellationToken ct)\n{\n    var entity = await _db.${cap(pick())}s.FindAsync(new object[] { id }, ct);\n    return entity is null ? null : _mapper.Map<${cap(pick())}Dto>(entity);\n}`, 10)],
    ["Gherkin (Italian)", rep(() => `  Scenario: ${cap(pick())} non valido\n    Dato un ${pick()} esistente\n    Quando l'utente modifica il ${pick()}\n    Allora il sistema mostra un errore di validazione`, 12)],
    ["Gherkin (English)", rep(() => `  Scenario: Invalid ${pick()}\n    Given an existing ${pick()}\n    When the user edits the ${pick()}\n    Then the system shows a validation error`, 12)],
  ];
}

async function count(token: string, text: string): Promise<number> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: [{ type: "text", text }] }] }),
    });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`count_tokens ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body).input_tokens;
  }
  throw new Error("count_tokens: still failing");
}

async function main() {
  if (!ROOTS.length) throw new Error("usage: explain.ts <session path> [...]");
  beginRun();
  // corpus (without the synthetic fixture filler, which is not real text)
  const cdir = latestRunDir("compare")!, sdir = latestRunDir("sessions")!;
  const texts = new Map(readJsonl(join(INVESTIGATION_DIR, "corpus", "corpus.jsonl")).map((c: any) => [c.id, c.text]));
  const filler = (t: string) => /_MARK_[A-Z0-9]+\n\n[A-Z][a-z]+ [a-z]+ [a-z]+/.test(t);
  const all: P[] = [];
  for (const it of readJsonl(join(cdir, "items.jsonl"))) {
    const t = texts.get(it.id)!; if (filler(t)) continue;
    const c = it.claude["claude-opus-5-5"] ?? it.claude[MODEL]; if (!(c > 0)) continue;
    all.push({ set: "corpus", category: it.category, text: t, p50k: it.p50k, claude: c, f: features(t) });
  }
  // sessions: re-read texts in memory, counts from the sessions run
  const counts = new Map(readJsonl(join(sdir, "sessions.items.jsonl")).map((r: any) => [`${r.sha}|${r.category}`, r.claude]));
  let missing = 0;
  for (const r of ROOTS) for (const f of jsonlUnder(r)) for (const p of piecesOf(basename(r), f)) {
    const c = counts.get(`${sha(p.text)}|${p.category}`); if (c == null) { missing++; continue; } if (!(c > 0)) continue;
    all.push({ set: "sessions", category: p.category, text: p.text, p50k: countTokens(p.text), claude: c, f: features(p.text) });
  }
  const C = all.filter((p) => p.set === "corpus"), Sx = all.filter((p) => p.set === "sessions");
  const ratio = (ps: P[]) => ps.reduce((a, p) => a + p.claude, 0) / ps.reduce((a, p) => a + p.p50k, 0);
  let md = `Corpus: ${C.length} texts from \`${basename(cdir)}\` (fixture filler excluded), ×${f3(ratio(C))}. Sessions: ${Sx.length} pieces from \`${basename(sdir)}\` (${missing} not matched), ×${f3(ratio(Sx))}. ×correction = ΣClaude/Σp50k.\n\n`;

  // 0. same category in both datasets, and the session mix
  const toCorpus = (c: string) => ({ "result:Read": "result-read", "result:Bash": "result-bash", "result:Grep": "result-grep-glob", "result:Glob": "result-grep-glob", "result:Agent": "result-agent", "attachment:instructions": "markdown" } as Record<string, string>)[c] ?? (c.startsWith("result:mcp__") ? "(MCP tool results)" : c.startsWith("result:") ? "result-other" : c.startsWith("attachment:") ? `(${c})` : c);
  const totS = Sx.reduce((a, p) => a + p.claude, 0), totC = C.reduce((a, p) => a + p.claude, 0);
  const cats = [...new Set(Sx.map((p) => toCorpus(p.category)))];
  const catRows = cats.map((k) => { const s = Sx.filter((p) => toCorpus(p.category) === k), c = C.filter((p) => p.category === k); const sT = s.reduce((a, p) => a + p.claude, 0); return { k, s, c, sT }; }).sort((a, b) => b.sT - a.sT);
  md += `## 0. Same category in both datasets\n\nSession categories mapped to the corpus ones (CLAUDE.md instructions → markdown). Categories in brackets have no counterpart in the corpus.\n\n` + table(["category", "corpus ×", "sessions ×", "share of corpus tokens", "share of session tokens"], catRows.map(({ k, s, c, sT }) => [k, c.length ? `${f3(ratio(c))} (${c.length})` : "–", `${f3(ratio(s))} (${s.length})`, c.length ? pct(c.reduce((a, p) => a + p.claude, 0) / totC) : "–", pct(sT / totS)]));
  const matched = catRows.filter((r) => r.c.length);
  const sMatched = matched.flatMap((r) => r.s), cMatched = matched.flatMap((r) => r.c);
  // the corpus ratio of each category, weighted with the session mix: what the corpus would give with the sessions' mix
  const remix = matched.reduce((a, r) => a + r.sT, 0) / matched.reduce((a, r) => a + r.sT / ratio(r.c), 0);
  md += `\nOn the matched categories only: corpus ×${f3(ratio(cMatched))}, sessions ×${f3(ratio(sMatched))}; corpus ratios re-weighted with the sessions' category mix ×${f3(remix)}. Unmatched categories hold ${pct(1 - sMatched.reduce((a, p) => a + p.claude, 0) / totS)} of the session tokens at ×${f3(ratio(Sx.filter((p) => !sMatched.includes(p))))}.\n\n`;

  // 1. feature means
  const wC = C.map((p) => p.claude), wS = Sx.map((p) => p.claude);
  md += `## 1. Feature means (weighted by Claude tokens)\n\n` + table(["feature", "corpus", "sessions"], FEATURES.map((k) => [k, f3(wmean(C.map((p) => p.f[k]), wC)), f3(wmean(Sx.map((p) => p.f[k]), wS))]));

  // 2. regression + decomposition
  const X = all.map((p) => FEATURES.map((k) => p.f[k])), y = all.map((p) => Math.log(p.claude / p.p50k)), w = all.map((p) => p.claude);
  const beta = wls(X, y, w);
  const yhat = X.map((r) => beta[0] + r.reduce((a, x, i) => a + x * beta[i + 1], 0));
  const ybar = wmean(y, w), r2 = 1 - y.reduce((a, v, i) => a + w[i] * (v - yhat[i]) ** 2, 0) / y.reduce((a, v, i) => a + w[i] * (v - ybar) ** 2, 0);
  const yC = wmean(C.map((p) => Math.log(p.claude / p.p50k)), wC), yS = wmean(Sx.map((p) => Math.log(p.claude / p.p50k)), wS);
  const contrib = FEATURES.map((k, i) => ({ k, beta: beta[i + 1], dx: wmean(Sx.map((p) => p.f[k]), wS) - wmean(C.map((p) => p.f[k]), wC) })).map((c) => ({ ...c, part: c.beta * c.dx }));
  const explained = contrib.reduce((a, c) => a + c.part, 0);
  md += `\n## 2. log(Claude/p50k) regressed on the features (WLS, weight = Claude tokens, both datasets, R² ${f3(r2)})\n\n`;
  md += `Gap to explain: mean log ratio sessions ${f3(yS)} − corpus ${f3(yC)} = ${f3(yS - yC)} (×${f3(Math.exp(yS))} vs ×${f3(Math.exp(yC))}). Explained by feature differences: ${f3(explained)} (${pct(explained / (yS - yC))}); unexplained: ${f3(yS - yC - explained)}.\n\n`;
  md += table(["feature", "β", "sessions − corpus", "contribution to the gap", "share of the gap"], [...contrib].sort((a, b) => Math.abs(b.part) - Math.abs(a.part)).map((c) => [c.k, f3(c.beta), f3(c.dx), f3(c.part), pct(c.part / (yS - yC))]));

  // 3. bins
  md += `\n## 3. ×correction by feature bin (Σ Claude / Σ p50k; pieces in brackets)\n\n`;
  const BINS: Record<string, number[]> = { nonAscii: [0.001, 0.005, 0.02, 1], accented: [0.0005, 0.003, 0.01, 1], hexRuns: [0.001, 0.02, 0.1, 1], itWords: [0.01, 0.05, 0.12, 1], enWords: [0.02, 0.08, 0.15, 1], indent: [0.01, 0.05, 0.15, 1], upper: [0.03, 0.06, 0.1, 1] };
  for (const [k, edges] of Object.entries(BINS)) {
    const rows = edges.map((e, i) => { const lo = i ? edges[i - 1] : -1; const inB = (p: P) => p.f[k as keyof F] > lo && p.f[k as keyof F] <= e; const c = C.filter(inB), s = Sx.filter(inB); return [`${i ? f3(lo) : "0"} – ${e === 1 ? "max" : f3(e)}`, c.length ? `${f3(ratio(c))} (${c.length})` : "–", s.length ? `${f3(ratio(s))} (${s.length})` : "–", pct(c.reduce((a, p) => a + p.claude, 0) / C.reduce((a, p) => a + p.claude, 0)), pct(s.reduce((a, p) => a + p.claude, 0) / Sx.reduce((a, p) => a + p.claude, 0))]; });
    md += `**${k}**\n\n` + table(["bin", "corpus", "sessions", "share of corpus tokens", "share of session tokens"], rows) + "\n";
  }

  // 4. probes
  const probeRows: any[] = [];
  if (!NO_PROBES) {
    const token = JSON.parse(readFileSync(join(ISOLATION_ENV.CLAUDE_CONFIG_DIR, ".credentials.json"), "utf8")).claudeAiOauth?.accessToken;
    const framing = (await count(token, "x")) - 1;
    for (const [label, text] of probes()) { const c = (await count(token, text)) - framing, p = countTokens(text) as number; probeRows.push({ label, chars: text.length, p50k: p, claude: c }); }
    md += `## 4. Probes (${MODEL}, framing ${framing})\n\n` + table(["probe", "chars", "p50k", "Claude", "×correction", "chars/p50k tok", "chars/Claude tok"], [...probeRows].sort((a, b) => b.claude / b.p50k - a.claude / a.p50k).map((r) => [r.label, r.chars, r.p50k, r.claude, f3(r.claude / r.p50k), f2(r.chars / r.p50k), f2(r.chars / r.claude)]));
  }
  writeFileSync(join(RESULTS_DIR, "explain.verdict.json"), JSON.stringify({ corpus: { n: C.length, correction: ratio(C) }, sessions: { n: Sx.length, missing, correction: ratio(Sx) }, r2, gap: yS - yC, explained, contrib, probes: probeRows }, null, 2));
  writeSummary("explain-summary.md", md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
