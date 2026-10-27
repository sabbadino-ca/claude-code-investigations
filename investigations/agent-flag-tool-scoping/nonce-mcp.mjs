// Minimal stdio MCP server for the agent-flag-tool-scoping fixture. Started by .mcp.json as `node nonce-mcp.mjs <server>`.
// Each server exposes two tools, tool_one and tool_two, which take no arguments and return the server's and tool's
// unguessable NONCE=<n>. A nonce in a tool result therefore proves that this exact MCP tool was called.
import { createInterface } from "node:readline";

const NONCES = {
  alpha: { tool_one: "58203917", tool_two: "31749628" },
  beta: { tool_one: "86420571", tool_two: "24068395" },
  gamma: { tool_one: "47195362", tool_two: "90537184" },
};
const server = process.argv[2];
if (!NONCES[server]) { console.error(`unknown server ${server}`); process.exit(2); }
const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") {
    send({ id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: server, version: "1.0.0" } } });
  } else if (m.method === "tools/list") {
    send({ id: m.id, result: { tools: Object.keys(NONCES[server]).map((name) => ({
      name, description: `Returns the ${server}/${name} nonce. Takes no arguments.`, inputSchema: { type: "object", properties: {} },
    })) } });
  } else if (m.method === "tools/call") {
    const nonce = NONCES[server][m.params?.name];
    send({ id: m.id, result: nonce
      ? { content: [{ type: "text", text: `NONCE=${nonce}` }] }
      : { content: [{ type: "text", text: `unknown tool ${m.params?.name}` }], isError: true } });
  } else if (m.id !== undefined) {
    send({ id: m.id, error: { code: -32601, message: `unsupported: ${m.method}` } });
  }
});
