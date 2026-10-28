/**
 * Same question as reference-files-cli.ts, but the reference files are named in a SKILL.md that the subagent preloads
 * through `skills:` (no Skill tool, so no skill listing). Does the subagent read .claude/skills/<skill>/references/*.md,
 * named relative to the skill folder, with one direct Read? Headless `claude -p` only.
 *
 *   main --Agent--> architect-skill (tools: Read, Glob, Grep, Bash; skills: [arch-rules])  --Read--> references/<topic>.md
 *
 * Each reference file ends with an unguessable NONCE=<n>. Everything is judged from the subagent's own tool calls
 * (stream-json events with parent_tool_use_id) and from its transcript up to its first tool call (preload check,
 * plus the injected skill message and its "Base directory for this skill" line).
 *
 * Usage:  npx tsx investigations/subagent-reference-files/reference-files-skill-cli.ts [scenario ...]   (default: all)
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Topic = "naming" | "layering" | "security";
type Scenario = { name: string; agent: string; skill: string; question: string; expectRead: Topic[]; note: string };

// keyed by skill
const NONCES: Record<string, Record<Topic, string>> = {
  "arch-rules": { naming: "57193846", layering: "28465017", security: "69302581" },
  "arch-rules-rooted": { naming: "41829530", layering: "86031472", security: "13576928" },
};
// skill descriptions: if one shows up before the first tool call, a skill listing reached the subagent
const LISTING_MARKERS = ["Test-harness architecture rules. Use only", "Test-harness architecture rules (paths written from the project root)"];
const BODY_MARKER = "Architecture rules for the experiment.";
const ALL_TOPICS: Topic[] = ["naming", "layering", "security"];

const ALL: Scenario[] = [
  { name: "skill-rel", agent: "architect-skill", skill: "arch-rules", expectRead: ["naming"], note: "SKILL.md path relative to the skill folder (references/naming.md)",
    question: "Which naming convention applies to services?" },
  { name: "skill-rooted", agent: "architect-skill-rooted", skill: "arch-rules-rooted", expectRead: ["naming"], note: "SKILL.md path written from the project root",
    question: "Which naming convention applies to services?" },
  { name: "skill-two", agent: "architect-skill", skill: "arch-rules", expectRead: ["naming", "layering"], note: "two topics needed, third not",
    question: "Which naming convention applies to services, and which layering rule applies between controllers and services?" },
  { name: "skill-none", agent: "architect-skill", skill: "arch-rules", expectRead: [], note: "question needs no reference file",
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
  const nonces = NONCES[s.skill];
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
  // also: the injected skill message, its base-directory line, and any skill listing
  let preloaded: string[] | null = null;
  let skillMessage: string | null = null, baseDirLine: string | null = null, bodyBeforeFirstCall = false;
  const listingSeen: string[] = [];
  const subDir = sessionId ? join(SESSIONS_DIR, sessionId, "subagents") : "";
  if (subDir && existsSync(subDir)) {
    preloaded = [];
    for (const f of readdirSync(subDir).filter((x) => x.endsWith(".jsonl"))) {
      for (const l of readFileSync(join(subDir, f), "utf8").split("\n").filter(Boolean)) {
        const e = JSON.parse(l);
        const s2 = JSON.stringify(e);
        if (e.type === "assistant" && s2.includes('"tool_use"')) break; // reached the first tool call
        for (const t of ALL_TOPICS) if (s2.includes(nonces[t])) preloaded.push(`${f}:${t}`);
        if (s2.includes(BODY_MARKER)) bodyBeforeFirstCall = true;
        for (const m of LISTING_MARKERS) if (s2.includes(m) && !listingSeen.includes(m)) listingSeen.push(m);
        if (!skillMessage && e.type === "user" && s2.includes("Base directory for this skill")) {
          skillMessage = textOf(e.message?.content);
          baseDirLine = skillMessage.split("\n").find((x) => x.startsWith("Base directory for this skill")) ?? null;
        }
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
    skill: s.skill,
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
    skill_body_before_first_tool_call: bodyBeforeFirstCall,
    base_dir_line: baseDirLine,
    skill_listing_descriptions_seen: listingSeen,
    injected_skill_message: skillMessage,
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
    "## Reference files named in a preloaded skill, read by a subagent: headless `claude -p`",
    "",
    "| scenario | agent | skill body preloaded | base dir line | listing | subagent tool calls | direct read, no scan | expected read | unexpected read | NONCE preloaded |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...verdicts.map((v) =>
      `| ${v.scenario} | ${v.agent} | ${v.skill_body_before_first_tool_call} | ${v.base_dir_line ? "`" + v.base_dir_line + "`" : "none"} | ${v.skill_listing_descriptions_seen.length ? "yes" : "none"} | ${v.subagent_tool_calls.map((c: string) => "`" + c.replace(/\|/g, "\\|") + "`").join("<br>") || "none"} | ` +
      `${v.direct_read_without_scan ?? "n/a"} | ${v.expected_files_read} | ${v.unexpected_files_read.join(", ") || "none"} | ${v.nonces_preloaded_before_first_tool_call?.join(", ") || "no"} |`),
  ].join("\n");
  writeSummary("reference-files-skill-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
