/**
 * Is a subagent aware of the project's skills (name + description) the way the main conversation is, or only of the
 * ones named in its `skills:` frontmatter? Agent SDK only (query()); skill-awareness-cli.ts runs the same scenarios
 * through headless `claude -p`. The SDK runs the Claude Code version it bundles.
 *
 *   main --Agent--> probe-inherit | probe-restricted | probe-preload      (or: main answers itself, as baseline)
 *
 * Every fixture skill has DESC_MARK=<n> in its description and BODY_MARK=<n> in its body. A mark seen in a context or
 * an answer proves the corresponding text reached that model. Judged from the transcripts (what was in the context
 * before the first assistant entry), from the answer, and from the subagent's own Skill tool calls.
 *
 * Usage:  npx tsx investigations/subagent-skill-awareness/skill-awareness-sdk.ts [scenario ...]   (default: all)
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const DESC: Record<string, string> = { "skill-alpha": "41730582", "skill-beta": "62915047", "skill-gamma": "17384926", "skill-hidden": "58204713", "skill-nouser": "73051846" };
const BODY: Record<string, string> = { "skill-alpha": "85206314", "skill-beta": "30478261", "skill-gamma": "96150738", "skill-hidden": "24690571", "skill-nouser": "19467203" };

const Q_LIST =
  "Do not call any tool. From the context you already have, list every skill you know of, one per line as: name | description, copied verbatim. " +
  "Then a line TOOLS= with the names of all tools you have. Then a line BODIES= with every BODY_MARK value you can see anywhere in your context, or NONE.";
const Q_INVOKE =
  "Call the Skill tool once with the skill named skill-beta, then report the BODY_MARK value it returned. " +
  "If you have no Skill tool, call nothing and reply SKILL_TOOL_UNAVAILABLE. Also add a line TOOLS= with the names of all tools you have.";

const qInvoke = (skill: string) =>
  `Call the Skill tool once with the skill named ${skill}, then report the BODY_MARK value it returned. ` +
  "You must make the call even if the skill is not in your skill list. If the call is refused, quote the refusal text exactly; if you have no Skill tool, reply SKILL_TOOL_UNAVAILABLE. Also add a line TOOLS= with the names of all tools you have.";
const F2 = ["skill-alpha", "skill-beta"];
const F3 = ["skill-alpha", "skill-gamma", "skill-nouser"];

type Scenario = { name: string; agent: string | null; question: string; note: string; sdkSkills?: string[]; prompt?: string };
const ALL: Scenario[] = [
  { name: "sdk2-main-list", agent: null, question: Q_LIST, sdkSkills: F2, note: "SDK skills: [alpha, beta]; main lists what it knows" },
  { name: "sdk2-main-invoke-beta", agent: null, question: qInvoke("skill-beta"), sdkSkills: F2, prompt: "main-tool", note: "SDK skills: [alpha, beta]; main invokes beta (in the list)" },
  { name: "sdk2-main-invoke-gamma", agent: null, question: qInvoke("skill-gamma"), sdkSkills: F2, prompt: "main-tool", note: "SDK skills: [alpha, beta]; main invokes gamma (not in the list)" },
  { name: "sdk2-inherit-list", agent: "probe-inherit", question: Q_LIST, sdkSkills: F2, note: "SDK skills: [alpha, beta]; subagent with no tools field lists" },
  { name: "sdk2-inherit-invoke-gamma", agent: "probe-inherit", question: qInvoke("skill-gamma"), sdkSkills: F2, note: "SDK skills: [alpha, beta]; subagent with no tools field invokes gamma (not in main's list)" },
  { name: "sdk3-main-list", agent: null, question: Q_LIST, sdkSkills: F3, note: "SDK skills: [alpha, gamma, nouser]; main lists what it knows" },
  { name: "main-list", agent: null, question: Q_LIST, note: "baseline: the main conversation lists what it knows" },
  { name: "inherit-list", agent: "probe-inherit", question: Q_LIST, note: "subagent, no tools field, no skills field" },
  { name: "restricted-list", agent: "probe-restricted", question: Q_LIST, note: "subagent, tools: Read, no skills field" },
  { name: "skilltool-list", agent: "probe-skilltool", question: Q_LIST, note: "subagent, tools: Read, Skill, no skills field" },
  { name: "preload-list", agent: "probe-preload", question: Q_LIST, note: "subagent, tools: Read, skills: [skill-alpha]" },
  { name: "inherit-hidden-list", agent: "probe-inherit-hidden", question: Q_LIST, note: "no tools field, skills: [skill-hidden]" },
  { name: "skilltool-hidden-list", agent: "probe-skilltool-hidden", question: Q_LIST, note: "tools: Read, Skill, skills: [skill-hidden]" },
  { name: "restricted-hidden-list", agent: "probe-restricted-hidden", question: Q_LIST, note: "tools: Read, skills: [skill-hidden]" },
  { name: "inherit-nouser-list", agent: "probe-inherit-nouser", question: Q_LIST, note: "no tools field, skills: [skill-nouser] (user-invocable: false)" },
  { name: "skilltool-nouser-list", agent: "probe-skilltool-nouser", question: Q_LIST, note: "tools: Read, Skill, skills: [skill-nouser]" },
  { name: "restricted-nouser-list", agent: "probe-restricted-nouser", question: Q_LIST, note: "tools: Read, skills: [skill-nouser]" },
  // SDK `skills` option: filters the main session's listing to the named skills (the type comment says subagents use their own definition)
  { name: "filter-main-list", agent: null, question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; main lists what it knows" },
  { name: "filter-inherit-list", agent: "probe-inherit", question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; no tools field, no skills field" },
  { name: "filter-skilltool-list", agent: "probe-skilltool", question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; tools: Read, Skill" },
  { name: "filter-restricted-list", agent: "probe-restricted", question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; tools: Read" },
  { name: "filter-preload-list", agent: "probe-preload", question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; tools: Read, skills: [skill-alpha] (alpha filtered out of main)" },
  { name: "filter-hidden-preload-list", agent: "probe-restricted-nouser", question: Q_LIST, sdkSkills: ["skill-beta"], note: "SDK skills: [skill-beta]; tools: Read, skills: [skill-nouser] (nouser filtered out of main)" },
  { name: "inherit-invoke", agent: "probe-inherit", question: Q_INVOKE, note: "subagent without skills field is asked to invoke skill-beta" },
  { name: "skilltool-invoke", agent: "probe-skilltool", question: Q_INVOKE, note: "subagent with tools: Read, Skill is asked to invoke skill-beta" },
  { name: "restricted-invoke", agent: "probe-restricted", question: Q_INVOKE, note: "subagent with tools: Read is asked to invoke skill-beta" },
];

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : JSON.stringify(c ?? ""));
const marksIn = (table: Record<string, string>, text: string) => Object.keys(table).filter((k) => text.includes(table[k]));

/** Marks that were in a transcript's context before its first assistant entry, and the entry kinds that carried them. */
function transcriptMarks(path: string) {
  const before = { desc: new Set<string>(), body: new Set<string>(), carriers: new Set<string>() };
  const anywhere = { desc: new Set<string>(), body: new Set<string>() };
  let seenAssistant = false;
  for (const l of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    const e = JSON.parse(l), s = JSON.stringify(e);
    if (e.type === "assistant") seenAssistant = true;
    const d = marksIn(DESC, s), b = marksIn(BODY, s);
    d.forEach((x) => anywhere.desc.add(x)); b.forEach((x) => anywhere.body.add(x));
    if (!seenAssistant && (d.length || b.length)) {
      d.forEach((x) => before.desc.add(x)); b.forEach((x) => before.body.add(x));
      before.carriers.add(e.type + (e.attachment?.type ? `:${e.attachment.type}` : ""));
    }
  }
  return {
    context_desc: [...before.desc], context_body: [...before.body], carriers: [...before.carriers],
    anywhere_desc: [...anywhere.desc], anywhere_body: [...anywhere.body],
  };
}

async function runScenario(s: Scenario) {
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  writeFileSync(logPath, "");
  const t0 = Date.now();
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v)}`).join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(14)} ${brief}`);
  };

  const prompt = s.prompt ? loadPrompt(s.prompt, { question: s.question }) : loadPrompt("main", { agent: s.agent ?? "", question: s.question, direct: s.agent === null });
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); process.exit(1); }, 5 * 60_000);
  let sessionId: string | undefined, cliVersion: string | undefined, initSkills: string[] | undefined, finalResult = "", cost: number | undefined;
  const subCalls: { id: string; name: string; input: any }[] = [];
  const subResults: { id: string; text: string; is_error: boolean }[] = [];

  const q = query({
    prompt,
    options: {
      cwd: process.cwd(),
      model: "sonnet",
      settingSources: ["project"], // loads .claude/agents and .claude/skills from the investigation folder (the cwd)
      settings: ISOLATION_SETTINGS,
      allowedTools: ["Agent", "Skill", "Read"],
      permissionMode: "dontAsk",
      ...(s.sdkSkills ? { skills: s.sdkSkills } : {}),
      env: cleanEnv(),
    },
  });
  for await (const a of q as AsyncIterable<any>) {
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version; initSkills = a.skills;
      recordClaudeVersion("sdk", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, skills: a.skills });
    } else if (a.type === "assistant" && a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) if (b.type === "tool_use") { subCalls.push({ id: b.id, name: b.name, input: b.input }); log("agent", "tool_use", { name: b.name, input: b.input }); }
    } else if (a.type === "user" && a.parent_tool_use_id) {
      for (const b of a.message?.content ?? []) if (b.type === "tool_result") {
        const text = textOf(b.content);
        subResults.push({ id: b.tool_use_id, text, is_error: !!b.is_error });
        log("agent", "tool_result", { is_error: !!b.is_error, text });
      }
    } else if (a.type === "result") {
      finalResult = a.result ?? ""; cost = a.total_cost_usd;
      log("stream", "RESULT", { result: a.result, cost });
    }
  }
  clearTimeout(timeout);
  const exitCode = 0;

  // ---- judge: facts only ----
  const main = sessionId && existsSync(join(SESSIONS_DIR, `${sessionId}.jsonl`)) ? transcriptMarks(join(SESSIONS_DIR, `${sessionId}.jsonl`)) : null;
  const subDir = sessionId ? join(SESSIONS_DIR, sessionId, "subagents") : "";
  const subFiles = subDir && existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")) : [];
  const sub = subFiles.map((f) => ({ file: f, ...transcriptMarks(join(subDir, f)) }));
  const mainSkillCalls: { input: unknown; is_error: boolean; text: string; body_marks: string[] }[] = [];
  if (sessionId && existsSync(join(SESSIONS_DIR, `${sessionId}.jsonl`))) {
    const entries = readFileSync(join(SESSIONS_DIR, `${sessionId}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const calls = new Map<string, unknown>();
    for (const e of entries) for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (b.type === "tool_use" && b.name === "Skill") calls.set(b.id, b.input);
      if (b.type === "tool_result" && calls.has(b.tool_use_id)) { const t = textOf(b.content); mainSkillCalls.push({ input: calls.get(b.tool_use_id), is_error: !!b.is_error, text: t.slice(0, 300), body_marks: marksIn(BODY, t) }); }
    }
  }
  const toolLine = finalResult.split("\n").find((l) => l.trim().startsWith("TOOLS=")) ?? null;
  const verdict = {
    scenario: s.name, driver: "Agent SDK query()", bundled_claude_code_version: cliVersion ?? null,
    agent: s.agent ?? "(main answers itself)", note: s.note,
    question: s.question,
    init_skills_listed_to_main: initSkills ?? null,
    main_context: main,
    subagent_context: sub,
    answer_desc_marks: marksIn(DESC, finalResult),
    answer_body_marks: marksIn(BODY, finalResult),
    answer_tools_line: toolLine,
    main_skill_tool_calls: mainSkillCalls,
    subagent_tool_calls: subCalls.map((c) => `${c.name} ${JSON.stringify(c.input)}`),
    subagent_skill_tool_results: subCalls.filter((c) => c.name === "Skill").map((c) => { const r = subResults.find((x) => x.id === c.id); return { is_error: !!r?.is_error, body_marks: marksIn(BODY, r?.text ?? ""), text: (r?.text ?? "").slice(0, 300) }; }),
    final_answer: finalResult,
    cost_usd: cost ?? null, exit_code: exitCode,
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
  const short = (m: string[]) => m.map((x) => x.replace("skill-", "")).join(", ") || "none";
  const md = [
    "## Skill awareness of subagents: Agent SDK",
    "",
    "Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.",
    "",
    "| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |",
    "|---|---|---|---|---|---|---|",
    ...verdicts.map((v) => {
      const c: any = v.agent.startsWith("(") ? v.main_context : v.subagent_context[0];
      return `| ${v.scenario} | ${v.agent} | ${c ? short(c.context_desc) : "n/a"} | ${c ? short(c.context_body) : "n/a"} | ${short(v.answer_desc_marks)} | ${short(v.answer_body_marks)} | ` +
        `${v.subagent_skill_tool_results.map((r: any) => (r.is_error ? "error" : short(r.body_marks))).join("; ") || "none"} |`;
    }),
  ].join("\n");
  writeSummary("skill-awareness-sdk-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
