/**
 * p50k vs Claude on real Claude Code sessions given on the command line (a session folder holding <id>.jsonl and
 * <id>/subagents/*.jsonl, or a single .jsonl). Each transcript is cut into the same pieces the c4 analyzer
 * claude-code/report.mjs tokenizes, with the same text it tokenizes:
 *   user-prompt         user text (string content or text blocks)
 *   assistant-text      assistant text blocks (thinking is never stored, so never counted)
 *   tool-input-json     JSON.stringify(tool_use.input)
 *   result:<tool>       tool_result payload: text blocks; other non-image, non-base64 blocks as JSON (resultToks)
 *   system-prompt       prompt_snapshot.systemPrompt sections (+ cliPrefix), first snapshot of each transcript
 *   tool-schema-json    prompt_snapshot.tools as {name, description, input_schema}, first snapshot with tools
 *   attachment:<kind>   instructions / nested_memory / skill_listing lines / agent_listing_delta lines /
 *                       mcp_instructions_delta blocks / deferred_tools_delta / deferred_tools_record / other context
 * Every occurrence is counted (a text repeated in the session counts each time, as in report.mjs); Claude counts are
 * cached per distinct text. Claude = count_tokens − framing (count("x") − 1), as in compare.ts.
 *
 * The texts are private and are NOT written anywhere: items.jsonl holds only sha256 prefix, transcript, category,
 * label, chars and the two counts.
 *
 * Usage:  npx tsx investigations/tokenizer-p50k-vs-claude/sessions.ts <session path> [<session path> ...] [--model m] [--concurrency N]
 */
import { ISOLATION_ENV, RESULTS_DIR, beginRun, writeSummary } from "../../lib/claude-home.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { type Piece, jsonlUnder, piecesOf } from "./pieces.ts";
// @ts-ignore: vendored plain ESM, no types
import { countTokens } from "./vendor/gpt-tokenizer/esm/encoding/p50k_base.js";

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const MODEL = opt("model", "claude-sonnet-5-5");
const CONCURRENCY = Number(opt("concurrency", "6"));
const ROOTS = argv.map((p) => resolve(p));
let token = "", nCalls = 0, nRetry = 0;

async function count(text: string): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt++) {
    nCalls++;
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: [{ type: "text", text }] }] }),
    });
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) { nRetry++; await new Promise((r) => setTimeout(r, Math.min(Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt, 60_000))); continue; }
    if (!res.ok) throw new Error(`count_tokens ${res.status}: ${body.slice(0, 200)}`);
    return JSON.parse(body).input_tokens;
  }
  throw new Error("count_tokens: still failing after retries");
}
async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < xs.length) { const i = next++; out[i] = await f(xs[i]); } }));
  return out;
}

const f0 = (x: number) => Math.round(x).toLocaleString("en-US"), f3 = (x: number) => x.toFixed(3);
const table = (head: string[], rows: (string | number)[][]) => `| ${head.join(" | ")} |\n|${head.map(() => "---").join("|")}|\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
type Row = Piece & { p50k: number; claude: number };
const agg = (rs: Row[]) => { const P = rs.reduce((a, r) => a + r.p50k, 0), C = rs.reduce((a, r) => a + r.claude, 0); const err = rs.filter((r) => r.claude > 0).map((r) => Math.abs(r.p50k - r.claude) / r.claude); return { n: rs.length, chars: rs.reduce((a, r) => a + r.text.length, 0), sumP: P, sumC: C, meanP: P / rs.length, meanC: C / rs.length, ratio: P / C, corr: C / P, under: rs.filter((r) => r.p50k < r.claude).length / rs.length, mae: err.reduce((a, b) => a + b, 0) / Math.max(1, err.length) }; };
const HEAD = ["set", "pieces", "Σ p50k", "Σ Claude", "mean p50k", "mean Claude", "Σp50k/ΣClaude", "×correction", "p50k under", "mean abs err"];
const line = (label: string, s: ReturnType<typeof agg>) => [label, s.n, f0(s.sumP), f0(s.sumC), f0(s.meanP), f0(s.meanC), f3(s.ratio), f3(s.corr), `${Math.round(s.under * 100)}%`, `${(s.mae * 100).toFixed(1)}%`];
const group = (c: string) => c.startsWith("result:") ? "tool results" : c.startsWith("attachment:") || c === "system-prompt" || c === "tool-schema-json" ? "preamble (system, tools, attachments)" : c === "tool-input-json" ? "tool inputs (JSON)" : "conversation text (user + assistant)";

async function main() {
  if (!ROOTS.length) throw new Error("usage: sessions.ts <session path> [...]");
  beginRun();
  token = JSON.parse(readFileSync(join(ISOLATION_ENV.CLAUDE_CONFIG_DIR, ".credentials.json"), "utf8")).claudeAiOauth?.accessToken;
  const pieces: Piece[] = [];
  for (const r of ROOTS) { if (!existsSync(r)) throw new Error(`not found: ${r}`); const s = basename(r).replace(/\.jsonl$/, ""); for (const f of jsonlUnder(r)) pieces.push(...piecesOf(s, f)); }
  const distinct = [...new Set(pieces.map((p) => p.text))];
  console.log(`${pieces.length} pieces, ${distinct.length} distinct texts, model ${MODEL}`);
  const framing = (await count("x")) - 1;
  let done = 0;
  const cc = await pool(distinct, CONCURRENCY, async (t) => { const n = await count(t); if (++done % 100 === 0) console.log(`  ${done}/${distinct.length}`); return n - framing; });
  const claudeOf = new Map(distinct.map((t, i) => [t, cc[i]]));
  const rows: Row[] = pieces.map((p) => ({ ...p, p50k: countTokens(p.text) as number, claude: claudeOf.get(p.text)! }));

  const sha = (t: string) => createHash("sha256").update(t).digest("hex").slice(0, 12);
  writeFileSync(join(RESULTS_DIR, "sessions.items.jsonl"), rows.map((r) => JSON.stringify({ sha: sha(r.text), session: r.session, transcript: r.transcript, category: r.category, label: r.label, chars: r.text.length, p50k: r.p50k, claude: r.claude })).join("\n") + "\n");

  const sessions = [...new Set(rows.map((r) => r.session))];
  const verdict: any = { model: MODEL, framing, calls: nCalls, retries: nRetry, pieces: rows.length, distinct: distinct.length, overall: agg(rows), sessions: {} };
  let md = `Model ${MODEL} (framing ${framing}). ${rows.length} pieces, ${distinct.length} distinct texts, ${nCalls} count_tokens requests (${nRetry} retried). Texts are not stored; \`sessions.items.jsonl\` has counts only.\n\n`;
  md += `**ratio = p50k / Claude**: below 1 means p50k underestimates. ×correction = ΣClaude/Σp50k.\n\n## Per session\n\n` + table(HEAD, [...sessions.map((s) => line(s, agg(rows.filter((r) => r.session === s)))), line("both", agg(rows))]);
  for (const s of sessions) {
    const rs = rows.filter((r) => r.session === s);
    const transcripts = new Set(rs.map((r) => r.transcript)).size;
    const groups = [...new Set(rs.map((r) => group(r.category)))].sort();
    const cats = [...new Set(rs.map((r) => r.category))].sort();
    verdict.sessions[s] = { transcripts, overall: agg(rs), by_group: Object.fromEntries(groups.map((g) => [g, agg(rs.filter((r) => group(r.category) === g))])), by_category: Object.fromEntries(cats.map((c) => [c, agg(rs.filter((r) => r.category === c))])) };
    md += `\n## ${s} (${transcripts} transcripts: main + ${transcripts - 1} subagents)\n\n### By kind\n\n` + table(HEAD, groups.map((g) => line(g, verdict.sessions[s].by_group[g])));
    md += `\n### By category\n\n` + table(HEAD, cats.map((c) => line(c, verdict.sessions[s].by_category[c])));
  }
  writeFileSync(join(RESULTS_DIR, "sessions.verdict.json"), JSON.stringify(verdict, null, 2));
  writeSummary("sessions-summary.md", md);
  console.log(md);
}
main().catch((e) => { console.error(e); process.exit(1); });
