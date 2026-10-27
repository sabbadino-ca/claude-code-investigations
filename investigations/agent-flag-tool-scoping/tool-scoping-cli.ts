/**
 * With main running as an agent (`claude -p --agent main-star`), does each thread get exactly the tools its own
 * `tools:` field asks for, nothing more and nothing less? In particular, can a subagent get a built-in tool and an
 * MCP server that main's allowlist leaves out, i.e. does main's allowlist cap its subagents or not?
 * Headless `claude -p` only.
 *
 *   main  (--agent main-star: Agent, Bash, mcp__alpha__*)
 *     --Agent-->  sub1-star (Read,  mcp__beta__*)
 *     --Agent-->  sub2-star (Write, mcp__gamma__*)
 *
 * .mcp.json defines alpha, beta and gamma (nonce-mcp.mjs), each with tool_one and tool_two returning a NONCE. No thread
 * declares ToolSearch.
 * What a thread can SEE is read from its transcript: the tool names of every `api-request-shape` entry (tools sent
 * to the API) plus the names of `deferred_tools_delta` attachments (deferred tools). That set is compared with the
 * declared set. What a thread could USE comes from its stream-json tool calls: Bash printed BASH_RAN, Read returned
 * READ_NONCE, Write produced the file with WRITE_NONCE, an MCP tool returned its NONCE.
 *
 * Usage:  npx tsx investigations/agent-flag-tool-scoping/tool-scoping-cli.ts [scenario ...]   (default: all)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, INVESTIGATION_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Thread = { agent: string; expected: string[] };
type Scenario = { name: string; note: string; main: Thread; subs: Thread[] };

const mcp = (server: string) => [`mcp__${server}__tool_one`, `mcp__${server}__tool_two`];
const ALL: Scenario[] = [
  {
    name: "star", note: "every MCP entry written mcp__<server>__* (the documented form)",
    main: { agent: "main-star", expected: ["Agent", "Bash", ...mcp("alpha")] },
    subs: [
      { agent: "sub1-star", expected: ["Read", ...mcp("beta")] },
      { agent: "sub2-star", expected: ["Write", ...mcp("gamma")] },
    ],
  },
];

const NONCES: Record<string, string> = {
  mcp__alpha__tool_one: "58203917", mcp__alpha__tool_two: "31749628",
  mcp__beta__tool_one: "86420571", mcp__beta__tool_two: "24068395",
  mcp__gamma__tool_one: "47195362", mcp__gamma__tool_two: "90537184",
};
const READ_NONCE = "73019584";
const WRITE_NONCE = "61852047";
// tools whose presence or absence is reported for every thread, whatever it declares
const PROBED = ["Agent", "Bash", "Read", "Write", "ToolSearch", ...Object.keys(NONCES)];

const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const fwd = (p: string) => p.replace(/\\/g, "/");

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : JSON.stringify(c ?? ""));
const readJsonl = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });

/** Tools a thread could see, from its transcript lines: API request tool names plus deferred tool names. */
function visibleTools(lines: any[]) {
  const sent = new Set<string>(), deferred = new Set<string>(), shapes = new Set<string>();
  for (const e of lines) {
    if (e.type === "api-request-shape") {
      const names = (e.shape?.tools ?? []).map((t: any) => t.name);
      names.forEach((n: string) => sent.add(n));
      shapes.add(names.join(","));
    }
    if (e.type === "attachment" && e.attachment?.type === "deferred_tools_delta") {
      for (const n of e.attachment.addedNames ?? []) deferred.add(n);
      for (const n of e.attachment.removedNames ?? []) deferred.delete(n);
    }
  }
  return { sent: [...sent].sort(), deferred: [...deferred].sort(), distinct_tool_sets_sent: shapes.size };
}

function judgeThread(t: Thread, lines: any[] | null, calls: Call[], writeFile: string) {
  if (!lines) return { agent: t.agent, transcript_found: false };
  const v = visibleTools(lines);
  const all = new Set([...v.sent, ...v.deferred]);
  const used = Object.fromEntries(PROBED.filter((n) => n !== "Agent" && n !== "ToolSearch").map((n) => {
    const c = calls.filter((x) => x.name === n);
    const proof = (x: Call) => !x.is_error && (
      n === "Bash" ? /BASH_RAN/.test(x.result ?? "") :
      n === "Read" ? (x.result ?? "").includes(READ_NONCE) :
      n === "Write" ? existsSync(writeFile) && readFileSync(writeFile, "utf8").includes(WRITE_NONCE) :
      (x.result ?? "").includes(NONCES[n]));
    return [n, c.length === 0 ? "not called" : c.some(proof) ? "ok" : `failed: ${c.map((x) => (x.result ?? "").slice(0, 160)).join(" | ")}`];
  }));
  const extra = [...all].filter((n) => !t.expected.includes(n)).sort();
  const missing = t.expected.filter((n) => !all.has(n));
  return {
    agent: t.agent,
    expected: t.expected,
    exact_match: extra.length === 0 && missing.length === 0,
    missing,
    extra,
    probed: Object.fromEntries(PROBED.map((n) => [n, v.sent.includes(n) ? "sent" : v.deferred.includes(n) ? "deferred" : "absent"])),
    expected_tools_used: Object.fromEntries(t.expected.filter((n) => n in used).map((n) => [n, used[n]])),
    unexpected_tools_called: calls.filter((c) => !t.expected.includes(c.name)).map((c) => `${c.name} -> ${c.is_error ? "ERROR " : ""}${(c.result ?? "").slice(0, 160)}`),
    sent: v.sent,
    deferred: v.deferred,
    distinct_tool_sets_sent: v.distinct_tool_sets_sent,
    calls: calls.map((c) => `${c.name} ${JSON.stringify(c.input)} -> ${c.is_error ? "ERROR " : ""}${(c.result ?? "").slice(0, 160)}`),
  };
}

type Call = { id: string; name: string; input: any; result?: string; is_error?: boolean };

async function runScenario(s: Scenario) {
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  const hooksPath = join(RESULTS_DIR, `${s.name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${s.name}.settings.json`);
  const writeFile = join(RESULTS_DIR, `${s.name}.written.txt`);
  writeFileSync(logPath, "");
  writeFileSync(hooksPath, "");
  rmSync(writeFile, { force: true });
  const hook = [{ hooks: [{ type: "command", command: `node "${fwd(join(LIB_DIR, "hook-log.mjs"))}" "${fwd(hooksPath)}"` }] }];
  writeFileSync(settingsPath, JSON.stringify({
    ...ISOLATION_SETTINGS,
    enabledMcpjsonServers: ["alpha", "beta", "gamma"],
    hooks: { PreToolUse: hook, PostToolUse: hook, PostToolUseFailure: hook, SubagentStart: hook, SubagentStop: hook },
  }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath, "--agent", s.main.agent,
    // permissions only: every probed tool is pre-approved, so an absent tool is never a disguised permission denial
    "--allowedTools", "Agent", "Bash", "Read", "Write", "ToolSearch", "mcp__alpha", "mcp__beta", "mcp__gamma",
    "--permission-mode", "dontAsk",
  ];
  const t0 = Date.now();
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v)}`).join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(6)} ${event.padEnd(14)} ${brief}`);
  };

  const probe = loadPrompt("probe", { readFile: fwd(join(INVESTIGATION_DIR, "read-me.txt")), writeFile: fwd(writeFile), writeNonce: WRITE_NONCE });
  const prompt = loadPrompt("main", { probe, subagents: s.subs.map((x) => `"${x.agent}"`).join(" and ") });
  writeFileSync(join(RESULTS_DIR, `${s.name}.prompt.md`), prompt);
  log("runner", "spawn", { args: args.join(" ") });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(prompt);
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 10 * 60_000);

  let sessionId: string | undefined, cliVersion: string | undefined, init: any = null, finalResult = "", cost: number | undefined;
  const agentCalls = new Map<string, string>(); // main Agent tool_use id -> subagent_type
  const calls: Record<string, Call[]> = { main: [] }; // thread ("main" or subagent type) -> its tool calls
  const threadOf = (parent: string | null) => (parent ? agentCalls.get(parent) ?? parent : "main");

  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version; init = a;
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, tools: a.tools,
        mcp: a.mcp_servers?.filter((m: any) => ["alpha", "beta", "gamma"].includes(m.name)) });
    } else if (a.type === "assistant") {
      const th = threadOf(a.parent_tool_use_id);
      for (const b of a.message?.content ?? []) if (b.type === "tool_use") {
        (calls[th] ??= []).push({ id: b.id, name: b.name, input: b.input });
        if (th === "main" && b.name === "Agent") agentCalls.set(b.id, b.input?.subagent_type);
        log(th, "tool_use", { name: b.name, input: b.input });
      }
    } else if (a.type === "user") {
      const th = threadOf(a.parent_tool_use_id);
      for (const b of Array.isArray(a.message?.content) ? a.message.content : []) if (b.type === "tool_result") {
        const c = calls[th]?.find((x) => x.id === b.tool_use_id);
        if (c) { c.result = textOf(b.content); c.is_error = !!b.is_error; }
        log(th, "tool_result", { is_error: !!b.is_error, text: textOf(b.content) });
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
  const mainLog = sessionId ? join(SESSIONS_DIR, `${sessionId}.jsonl`) : "";
  const mainLines = mainLog && existsSync(mainLog) ? readJsonl(mainLog).filter((e) => !e.agentId && !e.isSidechain) : null;
  const subLines: Record<string, any[]> = {};
  const subDir = sessionId ? join(SESSIONS_DIR, sessionId, "subagents") : "";
  if (subDir && existsSync(subDir)) {
    for (const f of readdirSync(subDir).filter((x) => x.endsWith(".jsonl"))) {
      const metaPath = join(subDir, f.replace(/\.jsonl$/, ".meta.json"));
      const type = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")).agentType : f;
      subLines[type] = readJsonl(join(subDir, f));
    }
  }
  const threads = {
    main: judgeThread(s.main, mainLines, calls.main, writeFile),
    ...Object.fromEntries(s.subs.map((t) => [t.agent, judgeThread(t, subLines[t.agent] ?? null, calls[t.agent] ?? [], writeFile)])),
  };
  const verdict = {
    scenario: s.name,
    driver: "claude -p (no SDK)",
    cli_version: cliVersion ?? null,
    note: s.note,
    all_threads_exact: Object.values(threads).every((t: any) => t.exact_match),
    init_tools: init?.tools ?? null,
    init_mcp_servers: init?.mcp_servers?.filter((m: any) => ["alpha", "beta", "gamma"].includes(m.name)) ?? null,
    threads,
    unattributed_calls: Object.keys(calls).filter((k) => k !== "main" && !s.subs.some((t) => t.agent === k)),
    written_file: existsSync(writeFile) ? readFileSync(writeFile, "utf8") : null,
    final_answer: finalResult,
    cost_usd: cost ?? null,
    exit_code: exitCode,
    session_log: mainLog ? fwd(mainLog) : null,
  };
  writeFileSync(join(RESULTS_DIR, `${s.name}.verdict.json`), JSON.stringify(verdict, null, 2));
  console.log(`\n[${s.name}] VERDICT\n${JSON.stringify(verdict, null, 2)}\n`);
  return verdict;
}

async function main() {
  beginRun();
  const names = process.argv.slice(2);
  const verdicts = [];
  for (const s of names.length ? ALL.filter((x) => names.includes(x.name)) : ALL) verdicts.push(await runScenario(s));
  const cell = (t: any, n: string) => {
    const use = t.expected_tools_used?.[n];
    return `${t.probed?.[n] ?? "?"}${use && use !== "not called" ? (use === "ok" ? ", ok" : ", **failed**") : ""}`;
  };
  const md = [
    "## Exact tool sets with `--agent`: headless `claude -p`",
    "",
    "Cell = visibility in that thread's API requests (`sent` inline, `deferred` via ToolSearch, `absent`), then `ok` / `failed` if it was used (ok = Bash printed BASH_RAN, Read returned READ_NONCE, Write produced WRITE_NONCE, an MCP tool returned its NONCE).",
    "",
    `| scenario | thread | exact | missing | extra | ${PROBED.join(" | ")} |`,
    `|---|---|---|---|---|${PROBED.map(() => "---").join("|")}|`,
    ...verdicts.flatMap((v) => Object.entries(v.threads).map(([k, t]: [string, any]) =>
      `| ${v.scenario} | ${k === "main" ? `main (--agent ${t.agent})` : k} | ${t.exact_match ?? "no transcript"} | ${t.missing?.join(", ") || "none"} | ${t.extra?.join(", ") || "none"} | ${PROBED.map((n) => cell(t, n)).join(" | ")} |`)),
    "",
    ...verdicts.map((v) => `- ${v.scenario}: all threads exact = ${v.all_threads_exact}; exit ${v.exit_code}; cost $${v.cost_usd?.toFixed(3) ?? "?"}; init mcp ${JSON.stringify(v.init_mcp_servers)}`),
  ].join("\n");
  writeSummary("tool-scoping-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
