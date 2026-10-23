/**
 * Does a subagent defined in .claude/agents/<name>/<name>.md read, on demand and by direct path, the reference files
 * its body mentions (.claude/agents/<name>/references/*.md), without scanning the directory and without them being
 * preloaded? Headless `claude -p` only.
 *
 *   main --Agent--> architect (tools: Read, Glob, Grep, Bash)  --Read--> references/<topic>.md
 *
 * Each reference file ends with an unguessable NONCE=<n>. Everything is judged from the subagent's own tool calls
 * (stream-json events with parent_tool_use_id) and from the first line of its transcript (preload check).
 *
 * Usage:  npx tsx investigations/subagent-reference-files/reference-files-cli.ts [scenario ...]   (default: all)
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Topic = "naming" | "layering" | "security";
type Scenario = { name: string; agent: string; question: string; expectRead: Topic[]; note: string };

const NONCES: Record<string, Record<Topic, string>> = {
  architect: { naming: "48213907", layering: "73920415", security: "15846302" },
  "architect-rooted": { naming: "60417283", layering: "92851746", security: "31570964" },
  "architect-anchor-dir": { naming: "81726354", layering: "27364518", security: "53628174" },
  "architect-anchor-nodir": { naming: "94837261", layering: "38291746", security: "72649153" },
};
const ALL_TOPICS: Topic[] = ["naming", "layering", "security"];

const ALL: Scenario[] = [
  { name: "rel-naming", agent: "architect", expectRead: ["naming"], note: "body path relative to the agent file (references/naming.md)",
    question: "Which naming convention applies to services?" },
  { name: "rooted-naming", agent: "architect-rooted", expectRead: ["naming"], note: "body path written from the project root",
    question: "Which naming convention applies to services?" },
  { name: "anchor-dir-naming", agent: "architect-anchor-dir", expectRead: ["naming"], note: "relative paths plus a one-time anchor folder in the body",
    question: "Which naming convention applies to services?" },
  { name: "anchor-nodir-naming", agent: "architect-anchor-nodir", expectRead: ["naming"], note: "relative paths, body says only: relative to the folder containing this file",
    question: "Which naming convention applies to services?" },
  { name: "rel-two", agent: "architect", expectRead: ["naming", "layering"], note: "two topics needed, third not",
    question: "Which naming convention applies to services, and which layering rule applies between controllers and services?" },
  { name: "rel-none", agent: "architect", expectRead: [], note: "question needs no reference file",
    question: "What is 2+2? Answer with the number only." },
];

const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const SCAN_BASH = /\b(ls|dir|find|tree|Get-ChildItem|gci|cat\s+\S*\*|rg|grep)\b/;

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

const norm = (p: unknown) => String(p ?? "").replace(/\\/g, "/");
const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : JSON.stringify(c ?? ""));

async function runScenario(s: Scenario) {
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${s.name}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(settingsPath, JSON.stringify({ ...ISOLATION_SETTINGS }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath,
    "--allowedTools", "Agent", "Read", "Glob", "Grep", "Bash", "--permission-mode", "dontAsk",
  ];
  const t0 = Date.now();
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v)}`).join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(14)} ${brief}`);
  };

  const prompt = loadPrompt("main", { agent: s.agent, question: s.question });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(prompt);
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 5 * 60_000);

  let sessionId: string | undefined, cliVersion: string | undefined, finalResult = "", cost: number | undefined;
  // subagent timeline, in stream order
  const calls: { id: string; name: string; input: any }[] = [];
  const results: { id: string; text: string; is_error: boolean }[] = [];

  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version;
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model });
    } else if (a.type === "assistant" && a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) if (b.type === "tool_use") {
        calls.push({ id: b.id, name: b.name, input: b.input });
        log("agent", "tool_use", { name: b.name, input: b.input });
      }
    } else if (a.type === "user" && a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) if (b.type === "tool_result") {
        const text = textOf(b.content);
        results.push({ id: b.tool_use_id, text, is_error: !!b.is_error });
        log("agent", "tool_result", { is_error: !!b.is_error, text });
      }
    } else if (a.type === "result") {
      finalResult = a.result ?? ""; cost = a.total_cost_usd;
      log("stream", "RESULT", { result: a.result, cost });
    }
  });
  const exitCode: number | null = await new Promise((r) => child.on("close", (c) => r(c)));
  clearTimeout(timeout);
  log("runner", "claude -p exited", { code: exitCode });

  // ---- judge ----
  const nonces = NONCES[s.agent];
  const topicOfPath = (p: string): Topic | null => ALL_TOPICS.find((t) => norm(p).endsWith(`/references/${t}.md`) || norm(p) === `references/${t}.md`) ?? null;
  const isScan = (c: { name: string; input: any }) =>
    c.name === "Glob" || c.name === "Grep" || (c.name === "Bash" && SCAN_BASH.test(String(c.input?.command ?? "")));

  const firstOkReadIdx: Partial<Record<Topic, number>> = {};
  const readsByTopic: Partial<Record<Topic, { path: string; is_error: boolean }[]>> = {};
  calls.forEach((c, i) => {
    if (c.name !== "Read") return;
    const t = topicOfPath(c.input?.file_path);
    if (!t) return;
    const r = results.find((x) => x.id === c.id);
    (readsByTopic[t] ??= []).push({ path: norm(c.input.file_path), is_error: !!r?.is_error });
    if (!r?.is_error) firstOkReadIdx[t] ??= i;
  });

  const perTopic = Object.fromEntries(ALL_TOPICS.map((t) => {
    const idx = firstOkReadIdx[t];
    const scansBefore = idx === undefined ? null : calls.slice(0, idx).filter(isScan).map((c) => `${c.name}: ${JSON.stringify(c.input)}`);
    const failedReadsBefore = idx === undefined ? null : (readsByTopic[t] ?? []).filter((r) => r.is_error).length;
    return [t, {
      expected: s.expectRead.includes(t),
      read_ok: idx !== undefined,
      read_attempts: readsByTopic[t]?.length ?? 0,
      failed_reads_before_success: failedReadsBefore,
      scans_before_first_ok_read: scansBefore,
      nonce_in_read_result: idx !== undefined && results.some((r) => r.id === calls[idx].id && r.text.includes(nonces[t])),
      nonce_in_final_answer: finalResult.includes(nonces[t]),
    }];
  }));

  // preload check: does any nonce appear in the subagent transcript before its first tool call?
  let preloaded: string[] | null = null;
  const subDir = sessionId ? join(SESSIONS_DIR, sessionId, "subagents") : "";
  if (subDir && existsSync(subDir)) {
    preloaded = [];
    for (const f of readdirSync(subDir).filter((x) => x.endsWith(".jsonl"))) {
      for (const l of readFileSync(join(subDir, f), "utf8").split("\n").filter(Boolean)) {
        const e = JSON.parse(l);
        const s2 = JSON.stringify(e);
        if (e.type === "assistant" && s2.includes('"tool_use"')) break; // reached the first tool call
        for (const t of ALL_TOPICS) if (s2.includes(nonces[t])) preloaded.push(`${f}:${t}`);
      }
    }
  }

  const expectedOk = ALL_TOPICS.filter((t) => s.expectRead.includes(t)).every((t) => (perTopic as any)[t].read_ok && (perTopic as any)[t].nonce_in_final_answer);
  const unexpectedRead = ALL_TOPICS.filter((t) => !s.expectRead.includes(t) && (perTopic as any)[t].read_attempts > 0);
  const allScans = calls.filter(isScan).map((c) => `${c.name}: ${JSON.stringify(c.input)}`);
  const verdict = {
    scenario: s.name,
    driver: "claude -p (no SDK)",
    cli_version: cliVersion ?? null,
    agent: s.agent,
    note: s.note,
    question: s.question,
    subagent_tool_calls: calls.map((c) => `${c.name} ${JSON.stringify(c.input)}`),
    first_tool_call: calls[0] ? `${calls[0].name} ${JSON.stringify(calls[0].input)}` : null,
    per_topic: perTopic,
    scan_calls_total: allScans,
    direct_read_without_scan: s.expectRead.length === 0 ? null : s.expectRead.every((t) => (perTopic as any)[t].read_ok && (perTopic as any)[t].scans_before_first_ok_read?.length === 0),
    expected_files_read: expectedOk,
    unexpected_files_read: unexpectedRead,
    nonces_preloaded_before_first_tool_call: preloaded,
    final_answer: finalResult,
    cost_usd: cost ?? null,
    exit_code: exitCode,
    session_log: sessionId ? join(SESSIONS_DIR, `${sessionId}.jsonl`) : null,
  };
  writeFileSync(join(RESULTS_DIR, `${s.name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${s.name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const names = process.argv.slice(2);
  const verdicts = [];
  for (const s of names.length ? ALL.filter((x) => names.includes(x.name)) : ALL) verdicts.push(await runScenario(s));
  const md = [
    "## Reference files read on demand by a subagent: headless `claude -p`",
    "",
    "| scenario | agent | subagent tool calls | direct read, no scan | expected read | unexpected read | preloaded |",
    "|---|---|---|---|---|---|---|",
    ...verdicts.map((v) =>
      `| ${v.scenario} | ${v.agent} | ${v.subagent_tool_calls.map((c: string) => "`" + c.replace(/\|/g, "\\|") + "`").join("<br>") || "none"} | ` +
      `${v.direct_read_without_scan ?? "n/a"} | ${v.expected_files_read} | ${v.unexpected_files_read.join(", ") || "none"} | ${v.nonces_preloaded_before_first_tool_call?.join(", ") || "no"} |`),
  ].join("\n");
  writeSummary("reference-files-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
