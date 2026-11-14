/**
 * Does the `Agent(type, ...)` allowlist in an agent's `tools:` frontmatter apply only when that agent is the main
 * thread (`claude --agent`), or also when the same agent is invoked as a subagent? Headless `claude -p` only.
 *
 * Fixture: gate.md has `tools: Agent(allowed-worker)`. allowed-worker and blocked-worker reply with their own
 * unguessable WORKER_TOKEN and nothing else. gate always runs the same script (prompts/gate.md): spawn
 * allowed-worker, then blocked-worker, then report both results.
 *
 *   scenario main-thread:  claude -p --agent gate               gate is the main thread
 *   scenario subagent:     claude -p  --Agent-->  gate         gate is a depth-1 subagent of the default main thread
 *
 * Recorded for the gate thread (its transcript: the main .jsonl, or subagents/agent-<id>.jsonl):
 *   - visible agent types: the agent_listing_delta attachments (the types the system tells it it can spawn)
 *   - whether Agent is among the tools sent to the API (api-request-shape)
 *   - every Agent tool_use and its tool_result: subagent_type, is_error, text, which WORKER_TOKEN came back
 * Plus every subagent that actually started (subagents/*.meta.json, SubagentStart hooks), with its spawn depth.
 *
 * Usage:  npx tsx investigations/agent-type-allowlist-scope/allowlist-cli.ts [scenario ...]   (default: both)
 */
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

type Scenario = { name: string; note: string; agentFlag: boolean };
const ALL: Scenario[] = [
  { name: "main-thread", note: "claude -p --agent gate: gate is the main thread", agentFlag: true },
  { name: "subagent", note: "claude -p (default main) spawns gate as a subagent", agentFlag: false },
];
const TOKENS: Record<string, string> = { "allowed-worker": "40718263", "blocked-worker": "95136027" };
const WORKERS = Object.keys(TOKENS);

// the installed CLI: ~/.local/bin/claude.exe on Windows, otherwise `claude` on PATH (same rule as lib/claude-home.mjs)
const CLAUDE_EXE = join(homedir(), ".local", "bin", "claude.exe");
const CLAUDE = existsSync(CLAUDE_EXE) ? CLAUDE_EXE : "claude";
const fwd = (p: string) => p.replace(/\\/g, "/");

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k)) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

const textOf = (c: any): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n") : JSON.stringify(c ?? ""));
const readJsonl = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const tokenIn = (s: string) => Object.entries(TOKENS).filter(([, n]) => s.includes(`WORKER_TOKEN=${n}`)).map(([w]) => w);

/** What one thread saw and did, from its transcript lines. */
function analyseThread(lines: any[]) {
  const listed = new Set<string>();
  const listingLines: string[] = [];
  let agentToolSent = false;
  const toolSets = new Set<string>();
  const uses = new Map<string, { subagent_type: string; input: any; is_error?: boolean; result?: string; tokens?: string[] }>();
  for (const e of lines) {
    if (e.type === "attachment" && e.attachment?.type === "agent_listing_delta") {
      for (const t of e.attachment.addedTypes ?? []) listed.add(t);
      for (const t of e.attachment.removedTypes ?? []) listed.delete(t);
      listingLines.push(...(e.attachment.addedLines ?? []).map((l: string) => l.slice(0, 140)));
    }
    if (e.type === "api-request-shape") {
      const names = (e.shape?.tools ?? []).map((t: any) => t.name);
      if (names.includes("Agent")) agentToolSent = true;
      toolSets.add(names.join(","));
    }
    if (e.type === "assistant") for (const b of e.message?.content ?? []) if (b.type === "tool_use" && b.name === "Agent")
      uses.set(b.id, { subagent_type: b.input?.subagent_type, input: { description: b.input?.description, run_in_background: b.input?.run_in_background } });
    if (e.type === "user" && Array.isArray(e.message?.content)) for (const b of e.message.content) if (b.type === "tool_result" && uses.has(b.tool_use_id)) {
      const u = uses.get(b.tool_use_id)!;
      u.is_error = !!b.is_error; u.result = textOf(b.content).slice(0, 600); u.tokens = tokenIn(textOf(b.content));
    }
  }
  return {
    visible_agent_types: [...listed].sort(),
    listing_lines: listingLines,
    agent_tool_sent: agentToolSent,
    tool_sets_sent: [...toolSets],
    agent_calls: [...uses.values()],
  };
}

async function runScenario(s: Scenario) {
  const logPath = join(RESULTS_DIR, `${s.name}.jsonl`);
  const hooksPath = join(RESULTS_DIR, `${s.name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${s.name}.settings.json`);
  writeFileSync(logPath, "");
  writeFileSync(hooksPath, "");
  const hook = [{ hooks: [{ type: "command", command: `node "${fwd(join(LIB_DIR, "hook-log.mjs"))}" "${fwd(hooksPath)}"` }] }];
  writeFileSync(settingsPath, JSON.stringify({
    ...ISOLATION_SETTINGS,
    hooks: { PreToolUse: hook, PostToolUse: hook, PostToolUseFailure: hook, SubagentStart: hook, SubagentStop: hook },
  }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath,
    ...(s.agentFlag ? ["--agent", "gate"] : []),
    // permissions only: Agent is pre-approved, so a refused spawn is never a disguised permission prompt
    "--allowedTools", "Agent", "Read",
    "--permission-mode", "dontAsk",
  ];
  const t0 = Date.now();
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    const t = Date.now() - t0;
    appendFileSync(logPath, JSON.stringify({ t, src, event, ...data }) + "\n");
    const brief = Object.entries(data).map(([k, v]) => `${k}=${JSON.stringify(typeof v === "string" && v.length > 140 ? v.slice(0, 140) + "…" : v)}`).join(" ");
    console.log(`[${s.name}] ${(t / 1000).toFixed(1).padStart(6)}s  ${src.padEnd(8)} ${event.padEnd(14)} ${brief}`);
  };

  const gate = loadPrompt("gate", {});
  const prompt = s.agentFlag ? gate : loadPrompt("main-spawns-gate", { gate });
  writeFileSync(join(RESULTS_DIR, `${s.name}.prompt.md`), prompt);
  log("runner", "spawn", { args: args.join(" ") });
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(prompt);
  child.stderr.on("data", (d) => log("stderr", "line", { text: String(d).trim() }));
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 10 * 60_000);

  let sessionId: string | undefined, cliVersion: string | undefined, finalResult = "", cost: number | undefined;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { return; }
    const who = a.parent_tool_use_id ? `sub:${String(a.parent_tool_use_id).slice(-6)}` : "main";
    if (a.type === "system" && a.subtype === "init") {
      sessionId = a.session_id; cliVersion = a.claude_code_version;
      recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, model: a.model, agents: a.agents, tools: a.tools });
    } else if (a.type === "assistant") {
      for (const b of a.message?.content ?? []) if (b.type === "tool_use") log(who, "tool_use", { id: b.id, name: b.name, input: b.input });
    } else if (a.type === "user") {
      for (const b of Array.isArray(a.message?.content) ? a.message.content : []) if (b.type === "tool_result")
        log(who, "tool_result", { id: b.tool_use_id, is_error: !!b.is_error, text: textOf(b.content) });
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
  const mainLines = mainLog && existsSync(mainLog) ? readJsonl(mainLog).filter((e) => !e.agentId && !e.isSidechain) : [];
  const subs: { file: string; agentType: string; spawnDepth?: number; lines: any[] }[] = [];
  const subDir = sessionId ? join(SESSIONS_DIR, sessionId, "subagents") : "";
  if (subDir && existsSync(subDir)) for (const f of readdirSync(subDir).filter((x) => x.endsWith(".jsonl"))) {
    const metaPath = join(subDir, f.replace(/\.jsonl$/, ".meta.json"));
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
    subs.push({ file: f, agentType: meta.agentType ?? "?", spawnDepth: meta.spawnDepth, lines: readJsonl(join(subDir, f)) });
  }
  const gateLines = s.agentFlag ? mainLines : subs.find((x) => x.agentType === "gate")?.lines ?? null;
  const gateThread = gateLines ? analyseThread(gateLines) : null;
  const hooks = existsSync(hooksPath) ? readJsonl(hooksPath) : [];
  const started = subs.map((x) => ({ agentType: x.agentType, spawnDepth: x.spawnDepth ?? null, file: x.file,
    final_text: [...x.lines].reverse().find((e) => e.type === "assistant")?.message?.content?.map((b: any) => b.text ?? "").join("").slice(0, 200) ?? null }));

  const outcome = Object.fromEntries(WORKERS.map((w) => {
    const calls = gateThread?.agent_calls.filter((c) => c.subagent_type === w) ?? [];
    const ran = calls.some((c) => !c.is_error && (c.tokens ?? []).includes(w));
    return [w, {
      requested_by_gate: calls.length,
      listed_to_gate: gateThread?.visible_agent_types.includes(w) ?? null,
      spawned: ran ? "yes (token returned)" : calls.length === 0 ? "not requested" : `no: ${calls.map((c) => `${c.is_error ? "ERROR " : ""}${c.result}`).join(" | ")}`,
      transcript_exists: started.some((x) => x.agentType === w),
    }];
  }));
  const verdict = {
    scenario: s.name,
    driver: "claude -p (no SDK)",
    cli_version: cliVersion ?? null,
    note: s.note,
    gate_is: s.agentFlag ? "main thread (--agent gate)" : "subagent of the default main thread",
    gate_transcript_found: !!gateLines,
    gate_has_Agent_tool: gateThread?.agent_tool_sent ?? null,
    gate_visible_agent_types: gateThread?.visible_agent_types ?? null,
    outcome,
    gate_agent_calls: gateThread?.agent_calls ?? null,
    subagents_started: started,
    subagent_start_hooks: hooks.filter((h) => h.hook_event_name === "SubagentStart").map((h) => ({ agent_type: h.agent_type, agent_id: h.agent_id })),
    agent_tool_hooks: hooks.filter((h) => h.tool_name === "Agent").map((h) => ({ event: h.hook_event_name, caller: h.agent_id ? `subagent ${h.agent_type}` : `main${h.agent_type ? ` (${h.agent_type})` : ""}`,
      subagent_type: h.tool_input?.subagent_type, error: h.error ? String(h.error).slice(0, 300) : undefined })),
    gate_listing_lines: gateThread?.listing_lines ?? null,
    gate_tool_sets_sent: gateThread?.tool_sets_sent ?? null,
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
  const md = [
    "## `tools: Agent(allowed-worker)` on gate: main thread vs subagent, headless `claude -p`",
    "",
    "gate's `tools:` is `Agent(allowed-worker)`. It spawns allowed-worker, then blocked-worker. `spawned` = the worker's WORKER_TOKEN came back in gate's tool_result.",
    "",
    "| scenario | gate is | gate has Agent | types listed to gate | allowed-worker spawned | blocked-worker spawned | subagents started (type@depth) | cost |",
    "|---|---|---|---|---|---|---|---|",
    ...verdicts.map((v) => `| ${v.scenario} | ${v.gate_is} | ${v.gate_has_Agent_tool} | ${(v.gate_visible_agent_types ?? []).join(", ") || "none"} | ${v.outcome["allowed-worker"].spawned} | ${v.outcome["blocked-worker"].spawned} | ${v.subagents_started.map((x) => `${x.agentType}@${x.spawnDepth}`).join(", ") || "none"} | $${v.cost_usd?.toFixed(3) ?? "?"} |`),
    "",
    ...verdicts.map((v) => `- ${v.scenario}: exit ${v.exit_code}; final answer: ${JSON.stringify(v.final_answer)}`),
  ].join("\n");
  writeSummary("allowlist-cli-summary.md", md);
  console.log(md);
}

main().catch((e) => { console.error(e); process.exit(1); });
