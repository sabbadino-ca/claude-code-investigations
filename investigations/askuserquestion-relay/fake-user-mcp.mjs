// Minimal stdio MCP server used as the `--permission-prompt-tool` of the `claude -p` AskUserQuestion experiment.
// A -p run offers AskUserQuestion only when it has a permission host; this server is that host.
// Tool `prompt` receives {tool_name, input, tool_use_id} and returns, as text, the permission result JSON:
// AskUserQuestion -> allow + updatedInput {questions, answers} (option matching argv[3], default "French");
// anything else -> allow unchanged. Every call is appended to the log file given as argv[2].
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const LOG = process.argv[2];
const wanted = new RegExp(process.argv[3] ?? "French", "i");
const log = (o) => { try { appendFileSync(LOG, JSON.stringify({ t_epoch: Date.now(), hook_event_name: "PermissionPromptTool", ...o }) + "\n"); } catch {} };
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") {
    send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fakeuser", version: "1.0.0" } } });
  } else if (m.method === "tools/list") {
    send({ id: m.id, result: { tools: [{
      name: "prompt",
      description: "Permission prompt handler for the experiment (plays the user).",
      inputSchema: { type: "object", properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } }, required: ["tool_name", "input"] },
    }] } });
  } else if (m.method === "tools/call") {
    const { tool_name, input } = m.params?.arguments ?? {};
    let result = { behavior: "allow", updatedInput: input };
    if (tool_name === "AskUserQuestion") {
      const answers = {};
      for (const q of input?.questions ?? []) answers[q.question] = (q.options.find((o) => wanted.test(o.label)) ?? q.options[0]).label;
      result = { behavior: "allow", updatedInput: { questions: input?.questions ?? [], answers } };
    }
    log({ tool_name, fake_user_answers: result.updatedInput?.answers });
    send({ id: m.id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
  } else if (m.id !== undefined) {
    send({ id: m.id, error: { code: -32601, message: `unsupported: ${m.method}` } });
  }
});
