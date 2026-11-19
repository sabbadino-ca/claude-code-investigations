/**
 * Builds the frozen corpus that compare.ts tokenizes: corpus/corpus.jsonl, one {id, category, source, chars, text} per line.
 * Run it once; the corpus file is committed, so every later compare.ts run sees exactly the same texts.
 *
 * Sources (all from this repository, nothing from outside it):
 *   - corpus/sentences.json: hand-written everyday and technical sentences, English and Italian, 2 words to ~130 words.
 *   - The session logs of the other investigations (investigations/* /.claude-home/projects): real Claude Code traffic.
 *     User prompts, the api-request-blob texts (system reminders and context), assistant text, tool_use inputs,
 *     tool_result payloads, the system prompt blocks and tool definitions of api-request-shape, and raw log lines.
 *     They are read as DATA only; this investigation does not depend on those folders to rerun (the corpus is frozen).
 *   - The results folders of the other investigations: stream-json timeline lines, run.json / verdict.json / settings.json
 *     (pretty and minified), summary markdown.
 *   - Repo files: drivers and lib (code), CLAUDE.md and REPORT.html files, and tool results generated from them in the
 *     formats Claude Code uses: Read ("<n>\t<line>"), Bash (git output), Grep (path:line:text) and Glob (path list).
 *
 * Sampling: per category, exact duplicates dropped, items ordered by sha256 of their text (deterministic, content
 * independent), then up to PER_BUCKET items per length bucket so short and long texts are both represented.
 *
 * Usage:  npx tsx investigations/tokenizer-p50k-vs-claude/build-corpus.ts
 */
import { INVESTIGATION_DIR } from "../../lib/claude-home.mjs";
import { readFileSync, readdirSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = join(INVESTIGATION_DIR, "..", "..");
const INV = join(REPO, "investigations");
const SELF = basename(INVESTIGATION_DIR);
const MAX_CHARS = 60_000;
const BUCKETS = [200, 1_000, 5_000, 20_000, Infinity];
const PER_BUCKET = 6;

type Item = { category: string; source: string; text: string };
const pool: Item[] = [];
const add = (category: string, source: string, text: unknown) => {
  if (typeof text !== "string") return;
  let t = text;
  if (!t.trim()) return;
  if (t.length > MAX_CHARS) { const cut = t.lastIndexOf("\n", MAX_CHARS); t = t.slice(0, cut > MAX_CHARS / 2 ? cut : MAX_CHARS); }
  pool.push({ category, source, text: t });
};
const fwd = (p: string) => relative(REPO, p).replace(/\\/g, "/");
const walk = (dir: string, keep: (f: string) => boolean, skip: string[] = []): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!skip.includes(e.name)) out.push(...walk(p, keep, skip)); }
    else if (keep(p)) out.push(p);
  }
  return out;
};
const readJsonl = (f: string): any[] => readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const others = readdirSync(INV, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_") && d.name !== SELF).map((d) => d.name);

// ---- 1. hand-written sentences ----
const S = JSON.parse(readFileSync(join(INVESTIGATION_DIR, "corpus", "sentences.json"), "utf8"));
for (const t of S.en) add("sentence-en", "corpus/sentences.json", t);
for (const t of S.it) add("sentence-it", "corpus/sentences.json", t);

// ---- 2. session logs ----
const resultCategory = (tool: string) =>
  tool === "Read" ? "result-read" : tool === "Bash" || tool === "PowerShell" ? "result-bash" : tool === "Grep" || tool === "Glob" ? "result-grep-glob" : tool === "Agent" || tool === "Task" ? "result-agent" : "result-other";
const resultText = (c: any): string | undefined =>
  typeof c === "string" ? c : Array.isArray(c) ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") || undefined : undefined;
for (const inv of others) {
  for (const f of walk(join(INV, inv, ".claude-home", "projects"), (p) => p.endsWith(".jsonl"))) {
    const src = fwd(f);
    const raw = readFileSync(f, "utf8").split("\n").filter(Boolean);
    for (const line of raw) if (line.length < 4_000) add("jsonl-event", src, line);
    const toolNames = new Map<string, string>();
    for (const e of readJsonl(f)) {
      const c = e.message?.content;
      if (e.type === "user" && typeof c === "string") add("user-prompt", src, c);
      if (e.type === "user" && Array.isArray(c)) for (const b of c) {
        if (b.type === "text") add("user-prompt", src, b.text);
        if (b.type === "tool_result") add(resultCategory(toolNames.get(b.tool_use_id) ?? "?"), src, resultText(b.content));
      }
      if (e.type === "assistant" && Array.isArray(c)) for (const b of c) {
        if (b.type === "text") add("assistant-text", src, b.text);
        if (b.type === "tool_use") { toolNames.set(b.id, b.name); add("tool-input-json", src, JSON.stringify(b.input ?? "")); }
      }
      if (e.type === "api-request-blob" && Array.isArray(c) && e.message.role !== "assistant")
        for (const b of c) if (b.type === "text") add("context-blob", src, b.text);
      if (e.type === "api-request-shape") {
        for (const b of e.shape?.system ?? []) add("system-prompt", src, b.text);
        for (const t of e.shape?.tools ?? []) { const { cache_control, ...rest } = t; add("tool-schema-json", src, JSON.stringify(rest)); }
      }
    }
  }
}

// ---- 3. results folders of the other investigations ----
for (const inv of others) {
  for (const f of walk(join(INV, inv, "results"), () => true)) {
    const src = fwd(f), name = basename(f);
    if (name.endsWith(".md")) add("markdown", src, readFileSync(f, "utf8"));
    else if (name.endsWith(".json")) {
      const t = readFileSync(f, "utf8");
      if (/run\.json$|verdict\.json$|settings\.json$|runs\.json$/.test(name)) {
        add("json-pretty", src, t);
        try { add("json-minified", src, JSON.stringify(JSON.parse(t))); } catch { /* not JSON */ }
      }
    } else if (name.endsWith(".jsonl")) {
      for (const l of readFileSync(f, "utf8").split("\n").filter(Boolean)) if (l.length < 4_000) add("stream-json-event", src, l);
    }
  }
}

// ---- 4. repo files and tool results generated from them ----
const repoFiles = walk(REPO, (p) => /\.(ts|mjs|md|html|json)$/.test(p), ["node_modules", ".git", ".claude-home", "results", "vendor", ".tokensave", SELF]);
for (const f of repoFiles) {
  const t = readFileSync(f, "utf8"), src = fwd(f), ext = extname(f);
  if (ext === ".ts" || ext === ".mjs") add("code", src, t);
  if (ext === ".md") add("markdown", src, t);
  if (ext === ".html") add("html", src, t);
  // the Read tool: "<n>\t<line>", at most 2000 lines
  add("result-read", `generated: Read ${src}`, t.split("\n").slice(0, 2000).map((l, i) => `${i + 1}\t${l}`).join("\n"));
}
const git = (...a: string[]) => { try { return execFileSync("git", ["-C", REPO, ...a], { encoding: "utf8", maxBuffer: 64 << 20 }); } catch { return ""; } };
for (const a of [["log", "--stat", "-n", "4"], ["log", "--oneline", "-n", "40"], ["log", "-n", "3"], ["show", "--stat", "HEAD~1"], ["show", "HEAD~2", "--", "lib"], ["diff", "HEAD~3", "HEAD~2", "--stat"], ["ls-files"], ["ls-files", "investigations/subagent-reference-files"], ["show", "HEAD~1", "--", "investigations/subagent-reference-files/REPORT.html"]])
  add("result-bash", `generated: git ${a.join(" ")}`, git(...a));
const lsLike = (dir: string) => readdirSync(dir, { withFileTypes: true }).map((e) => { const s = statSync(join(dir, e.name)); return `${e.isDirectory() ? "d" : "-"}rw-r--r-- 1 user 197121 ${String(s.size).padStart(8)} ${s.mtime.toISOString().slice(0, 16).replace("T", " ")} ${e.name}`; }).join("\n");
for (const d of [REPO, join(REPO, "lib"), ...others.map((o) => join(INV, o))]) add("result-bash", `generated: ls -la ${fwd(d) || "."}`, lsLike(d));
for (const pat of ["beginRun", "WORKER_TOKEN", "count_tokens", "permissionMode", "TODO|FIXME", "export (async )?function", "claude_code_version", "settingSources"]) {
  const re = new RegExp(pat);
  const hits = repoFiles.flatMap((f) => readFileSync(f, "utf8").split("\n").flatMap((l, i) => (re.test(l) ? [`${fwd(f)}:${i + 1}:${l}`] : [])));
  add("result-grep-glob", `generated: Grep ${pat} (content)`, hits.join("\n"));
  const files = [...new Set(hits.map((h) => h.split(":")[0]))];
  add("result-grep-glob", `generated: Grep ${pat} (files)`, `Found ${files.length} files\n${files.join("\n")}`);
}
for (const g of [/\.ts$/, /\.md$/, /REPORT\.html$/, /\.json$/]) add("result-grep-glob", `generated: Glob ${g.source}`, repoFiles.filter((f) => g.test(f)).map((f) => f.replace(/\\/g, "/")).join("\n"));

// ---- sample ----
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const bucketOf = (n: number) => BUCKETS.findIndex((b) => n < b);
const byCat = new Map<string, Map<string, Item>>();
for (const it of pool) { const m = byCat.get(it.category) ?? new Map(); if (!m.has(it.text)) m.set(it.text, it); byCat.set(it.category, m); }
const out: any[] = [];
const report: string[] = [];
for (const [cat, m] of [...byCat].sort()) {
  const items = [...m.values()].map((it) => ({ ...it, h: sha(it.text) })).sort((a, b) => a.h.localeCompare(b.h));
  const taken: number[] = BUCKETS.map(() => 0);
  let n = 0;
  for (const it of items) {
    const b = bucketOf(it.text.length);
    if (cat.startsWith("sentence-") || taken[b] < PER_BUCKET) {
      taken[b]++; n++;
      out.push({ id: `${cat}-${it.h.slice(0, 10)}`, category: cat, source: it.source, chars: it.text.length, text: it.text });
    }
  }
  report.push(`${cat.padEnd(18)} unique ${String(items.length).padStart(5)}  taken ${String(n).padStart(3)}  per bucket ${taken.join("/")}`);
}
writeFileSync(join(INVESTIGATION_DIR, "corpus", "corpus.jsonl"), out.map((o) => JSON.stringify(o)).join("\n") + "\n");
console.log(report.join("\n"));
console.log(`\n${out.length} items, ${out.reduce((s, o) => s + o.chars, 0)} chars -> corpus/corpus.jsonl`);
