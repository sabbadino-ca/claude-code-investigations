/**
 * Cuts a Claude Code transcript into the pieces the c4 analyzer claude-code/report.mjs tokenizes, with the text it
 * tokenizes. Shared by sessions.ts and explain.ts. See sessions.ts for the list of categories.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

export type Piece = { session: string; transcript: string; category: string; label: string; text: string };
export const jsonlUnder = (p: string): string[] => statSync(p).isFile() ? [p] : readdirSync(p, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? jsonlUnder(join(p, e.name)) : e.name.endsWith(".jsonl") ? [join(p, e.name)] : []);
const isB64 = (b: any) => b?.source?.type === "base64";

export function piecesOf(session: string, file: string): Piece[] {
  const out: Piece[] = [];
  const transcript = basename(file, ".jsonl");
  const add = (category: string, label: string, text: unknown) => { if (typeof text === "string" && text) out.push({ session, transcript, category, label, text }); };
  const toolName = new Map<string, string>();
  let sysDone = false, toolsDone = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let e: any; try { e = JSON.parse(line); } catch { continue; }
    const a = e.attachment;
    if (a) switch (a.type) {
      case "instructions": for (const f of a.files ?? []) add("attachment:instructions", f.type ?? "?", f.content); break;
      case "nested_memory": add("attachment:instructions", a.content?.type ?? "?", a.content?.content); break;
      case "skill_listing": for (const l of String(a.content ?? "").split(/\n(?=- )/).filter(Boolean)) add("attachment:skill-listing", "", l); break;
      case "agent_listing_delta": for (const l of a.addedLines ?? []) add("attachment:agent-listing", "", l); break;
      case "mcp_instructions_delta": for (const b of a.addedBlocks ?? []) add("attachment:mcp", "", b); break;
      case "deferred_tools_delta": add("attachment:deferred-tools", "", (a.addedLines ?? []).join("\n")); break;
      case "deferred_tools_record": for (const x of a.entries ?? []) add("attachment:deferred-tools", x.name, JSON.stringify(x)); break;
      case "prompt_snapshot": {
        if (!sysDone && a.systemPrompt) { sysDone = true; add("system-prompt", "cliPrefix", a.cliPrefix); for (const s of a.systemPrompt) if (s && !s.startsWith("__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__")) add("system-prompt", "", s); }
        if (!toolsDone && a.tools) { toolsDone = true; for (const t of a.tools) add("tool-schema-json", t.name, JSON.stringify({ name: t.name, description: t.description, input_schema: t.schema })); }
        break;
      }
      default: { const { type, ...rest } = a; add("attachment:context", type, typeof a.text === "string" ? a.text : typeof a.content === "string" ? a.content : JSON.stringify(rest)); }
    }
    if (e.type !== "user" && e.type !== "assistant") continue;
    const c = e.message?.content, role = e.message?.role;
    if (typeof c === "string" && role === "user") add("user-prompt", "", c);
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type === "tool_use") { toolName.set(b.id, b.name); add("tool-input-json", b.name, JSON.stringify(b.input ?? "")); }
      else if (b.type === "tool_result") {
        const tool = toolName.get(b.tool_use_id) ?? "(unknown)";
        if (typeof b.content === "string") add(`result:${tool}`, tool, b.content);
        else if (Array.isArray(b.content)) for (const x of b.content) { if (x?.type === "text") add(`result:${tool}`, tool, x.text); else if (x && x.type !== "image" && !isB64(x)) add(`result:${tool}`, tool, JSON.stringify(x)); }
        else add(`result:${tool}`, tool, JSON.stringify(b.content ?? ""));
      } else if (b.type === "text") add(role === "assistant" ? "assistant-text" : "user-prompt", "", b.text);
    }
  }
  return out;
}

