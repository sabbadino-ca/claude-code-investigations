/**
 * Is AskUserQuestion offered to the model in a plain `claude -p` run?
 *
 * Each scenario spawns the installed claude.exe in -p stream-json mode with the same scripted probe prompt
 * (prompts/probe.md): report how AskUserQuestion appears, try ToolSearch select:AskUserQuestion, then call it.
 * Recorded per run:
 *   - system:init `tools` (does it list AskUserQuestion?) and `permissionMode`
 *   - every ToolSearch / AskUserQuestion tool_use and its tool_result (session .jsonl)
 *   - session entries, other than the prompt and the probe's own calls, that mention AskUserQuestion
 *     (e.g. a deferred-tools listing)
 *   - CLI hook events for those tools, the result message's permission_denials, exit code and stderr
 *
 * Scenarios (no flag beyond these; no --allowedTools, no --permission-prompt-tool):
 *   base           claude -p
 *   prompts-none   claude -p --permission-prompts none
 *   mode-none      claude -p --permission-mode none   (literal; not a listed choice, recorded as-is)
 *   mode-dontAsk   claude -p --permission-mode dontAsk
 *
 * Usage:  npx tsx investigations/askuserquestion-headless-availability/availability.ts [scenario|all=all] [runs=1]
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ISOLATION_ENV, ISOLATION_SETTINGS, SESSIONS_DIR, RESULTS_DIR, LIB_DIR, loadPrompt, beginRun, recordClaudeVersion, writeSummary } from "../../lib/claude-home.mjs";

const SCENARIOS: Record<string, string[]> = {
  "base": [],
  "prompts-none": ["--permission-prompts", "none"],
  "mode-none": ["--permission-mode", "none"],
  "mode-dontAsk": ["--permission-mode", "dontAsk"],
};
const WHICH = process.argv[2] ?? "all";
const RUNS = Number(process.argv[3] ?? 1);
const CLAUDE = join(homedir(), ".local", "bin", "claude.exe");
const PROMPT = loadPrompt("probe");
const TOOL = "AskUserQuestion";

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^CLAUDE/.test(k) && v !== undefined) env[k] = v;
  return { ...env, ...ISOLATION_ENV };
}

const textOf = (c: any): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: any) => (b.type === "text" ? b.text : b.type === "tool_result" ? textOf(b.content) : "")).join("\n") : "";
const readJsonl = (p: string) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

async function runOnce(scenario: string, r: number) {
  const name = `${scenario}-${r}`;
  const t0 = Date.now();
  const logPath = join(RESULTS_DIR, `${name}.jsonl`);
  writeFileSync(logPath, "");
  const log = (src: string, event: string, data: Record<string, unknown> = {}) => {
    appendFileSync(logPath, JSON.stringify({ t: Date.now() - t0, src, event, ...data }) + "\n");
    const s = JSON.stringify(data);
    console.log(`[${name}] ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s ${src.padEnd(6)} ${event.padEnd(20)} ${s.length > 220 ? s.slice(0, 220) + "…" : s}`);
  };

  const hookLog = join(RESULTS_DIR, `${name}.hooks.jsonl`);
  const settingsPath = join(RESULTS_DIR, `${name}.settings.json`);
  writeFileSync(hookLog, "");
  const logger = [{ hooks: [{ type: "command", command: `node "${join(LIB_DIR, "hook-log.mjs").replace(/\\/g, "/")}" "${hookLog.replace(/\\/g, "/")}"` }] }];
  writeFileSync(settingsPath, JSON.stringify({
    ...ISOLATION_SETTINGS,
    hooks: { PreToolUse: logger, PostToolUse: logger, PostToolUseFailure: logger, PermissionRequest: logger },
  }, null, 2));

  const args = ["-p", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    "--setting-sources", "project", "--settings", settingsPath, ...SCENARIOS[scenario]];
  log("runner", "spawn", { args: args.join(" ") });

  const st: any = { init: null, result: null, stderr: "" };
  const child = spawn(CLAUDE, args, { cwd: process.cwd(), env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(PROMPT);
  child.stderr.on("data", (d) => { st.stderr += String(d); log("stderr", "chunk", { text: String(d).trim() }); });
  const timeout = setTimeout(() => { log("runner", "HARD_TIMEOUT"); child.kill(); }, 4 * 60_000);
  createInterface({ input: child.stdout }).on("line", (line) => {
    let a: any;
    try { a = JSON.parse(line); } catch { log("stdout", "non-json", { text: line }); return; }
    if (a.type === "system" && a.subtype === "init") {
      st.init = a;
      if (a.claude_code_version) recordClaudeVersion("cli", a.claude_code_version);
      log("stream", "system:init", { cli: a.claude_code_version, permissionMode: a.permissionMode, tools_count: a.tools?.length, has_AskUserQuestion: a.tools?.includes(TOOL) });
    } else if (a.type === "assistant") {
      for (const b of a.message?.content ?? []) {
        if (b.type === "tool_use") log("stream", "tool_use", { name: b.name, input: b.input });
        else if (b.type === "text") log("stream", "text", { text: b.text });
      }
    } else if (a.type === "user") {
      for (const b of (Array.isArray(a.message?.content) ? a.message.content : []).filter((b: any) => b.type === "tool_result"))
        log("stream", "tool_result", { is_error: !!b.is_error, text: textOf(b.content) });
    } else if (a.type === "result") {
      st.result = a;
      log("stream", "RESULT", { subtype: a.subtype, num_turns: a.num_turns, permission_denials: a.permission_denials, cost: a.total_cost_usd });
    }
  });
  const code: number | null = await new Promise((res) => child.on("close", (c) => res(c)));
  clearTimeout(timeout);
  log("runner", "exited", { code });

  const hooks = readJsonl(hookLog);
  for (const h of hooks) appendFileSync(logPath, JSON.stringify({ t: h.t_epoch - t0, src: "hook", event: h.hook_event_name, tool: h.tool_name }) + "\n");

  // ---- session transcript
  const sessionId = st.init?.session_id;
  const mainPath = sessionId ? join(SESSIONS_DIR, `${sessionId}.jsonl`) : null;
  const calls: { id: string; name: string; input: any; result?: string; is_error?: boolean }[] = [];
  const mentions: { type: string; subtype?: string; snippet: string }[] = [];
  if (mainPath && existsSync(mainPath)) {
    const entries = readJsonl(mainPath).filter((e) => !e.isSidechain);
    for (const e of entries) {
      if (e.type === "assistant") for (const b of e.message?.content ?? []) if (b.type === "tool_use") calls.push({ id: b.id, name: b.name, input: b.input });
      if (e.type === "user" && Array.isArray(e.message?.content))
        for (const b of e.message.content) if (b.type === "tool_result") {
          const c = calls.find((x) => x.id === b.tool_use_id);
          if (c) { c.result = textOf(b.content); c.is_error = !!b.is_error; }
        }
    }
    // mentions of the tool outside the prompt and the probe's own tool calls/results
    for (const e of entries) {
      if (e.type === "assistant") continue;
      const raw = JSON.stringify(e);
      if (!raw.includes(TOOL)) continue;
      if (e.type === "user" && textOf(e.message?.content).includes("This is a scripted probe")) continue;
      if (e.type === "user" && Array.isArray(e.message?.content) && e.message.content.every((b: any) => b.type === "tool_result")) continue;
      const i = raw.indexOf(TOOL);
      mentions.push({ type: e.type, subtype: e.subtype ?? e.attachment?.type, snippet: raw.slice(Math.max(0, i - 200), i + 200) });
    }
  }
  const finalText = st.result?.result ?? "";
  const line = (k: string) => finalText.match(new RegExp(`${k}=(.*)`))?.[1]?.trim() ?? null;
  const verdict = {
    run: name, scenario, flags: SCENARIOS[scenario],
    exit_code: code, stderr: st.stderr.trim() || null,
    cli_version: st.init?.claude_code_version ?? null,
    init_permissionMode: st.init?.permissionMode ?? null,
    init_tools_count: st.init?.tools?.length ?? null,
    init_tools_has_AskUserQuestion: st.init ? st.init.tools?.includes(TOOL) : null,
    init_tools_has_ToolSearch: st.init ? st.init.tools?.includes("ToolSearch") : null,
    init_tools: st.init?.tools ?? null,
    toolsearch_calls: calls.filter((c) => c.name === "ToolSearch"),
    ask_calls: calls.filter((c) => c.name === TOOL),
    other_calls: calls.filter((c) => c.name !== "ToolSearch" && c.name !== TOOL).map((c) => c.name),
    ask_hook_events: hooks.filter((h) => h.tool_name === TOOL).map((h) => h.hook_event_name),
    permission_denials: st.result?.permission_denials ?? null,
    session_mentions: mentions,
    model_reported: { LISTED: line("LISTED"), TOOLSEARCH: line("TOOLSEARCH"), ASK_RESULT: line("ASK_RESULT") },
    final_text: finalText || null,
    cost_usd: st.result?.total_cost_usd ?? null,
    transcript: mainPath,
  };
  writeFileSync(join(RESULTS_DIR, `${name}.verdict.json`), JSON.stringify(verdict, null, 2));
  return verdict;
}

async function main() {
  beginRun();
  mkdirSync(RESULTS_DIR, { recursive: true });
  const names = WHICH === "all" ? Object.keys(SCENARIOS) : [WHICH];
  for (const s of names) if (!SCENARIOS[s]) throw new Error(`unknown scenario ${s}`);
  for (const s of names) for (let r = 1; r <= RUNS; r++) await runOnce(s, r);
  const all = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".verdict.json")).sort()
    .map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
  const cell = (s: unknown) => String(s ?? "-").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 160);
  const md = [
    "## AskUserQuestion availability in `claude -p`",
    "",
    "| run | flags | exit | init permissionMode | init tools has AskUserQuestion | ToolSearch select:AskUserQuestion → | AskUserQuestion call → | hook events (AskUserQuestion) | permission_denials | other session mentions | model LISTED= |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...all.map((v) => `| ${v.run} | \`${v.flags.join(" ") || "(none)"}\` | ${v.exit_code} | ${v.init_permissionMode ?? "-"} | ${v.init_tools_has_AskUserQuestion ?? "-"} | ` +
      `${cell(v.toolsearch_calls.map((c: any) => c.result).join(" / ") || "not called")} | ` +
      `${cell(v.ask_calls.map((c: any) => `${c.is_error ? "ERROR: " : ""}${c.result}`).join(" / ") || "not called")} | ` +
      `${v.ask_hook_events.join(", ") || "none"} | ${cell(JSON.stringify(v.permission_denials))} | ${v.session_mentions.length} | ${cell(v.model_reported.LISTED)} |`),
    "",
    ...all.filter((v) => v.stderr).map((v) => `- ${v.run} stderr: \`${cell(v.stderr)}\``),
  ].join("\n");
  writeSummary("availability-summary.md", md);
  console.log("\n" + md);
}

main().catch((e) => { console.error(e); process.exit(1); });
