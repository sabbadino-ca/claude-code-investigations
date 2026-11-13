> **Run** `results/2026-11-13-0622-tool-scoping-cli` · `tool-scoping-cli.ts` (no args) · started 2026-11-13 06:22
> **Claude Code** 2.1.323 via installed `claude -p` · **git** 6dd0345 (uncommitted changes)

## Exact tool sets with `--agent`: headless `claude -p`

Cell = visibility in that thread's API requests (`sent` inline, `deferred` via ToolSearch, `absent`), then `ok` / `failed` if it was used (ok = Bash printed BASH_RAN, Read returned READ_NONCE, Write produced WRITE_NONCE, an MCP tool returned its NONCE).

| scenario | thread | exact | missing | extra | Agent | Bash | Read | Write | ToolSearch | mcp__alpha__tool_one | mcp__alpha__tool_two | mcp__beta__tool_one | mcp__beta__tool_two | mcp__gamma__tool_one | mcp__gamma__tool_two |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| star | main (--agent main-star) | false | none | DeferredToolPlaceholder | sent | sent, ok | absent | absent | absent | sent, ok | sent, ok | absent | absent | absent | absent |
| star | sub1-star | false | none | DeferredToolPlaceholder | absent | absent | sent, ok | absent | absent | absent | absent | sent, ok | sent, ok | absent | absent |
| star | sub2-star | false | none | DeferredToolPlaceholder | absent | absent | absent | sent, ok | absent | absent | absent | absent | absent | sent, ok | sent, ok |
| bare | main (--agent main-bare) | false | none | DeferredToolPlaceholder | sent | sent, ok | absent | absent | absent | sent, ok | sent, ok | absent | absent | absent | absent |
| bare | sub1-bare | false | none | DeferredToolPlaceholder | absent | absent | sent, ok | absent | absent | absent | absent | sent, ok | sent, ok | absent | absent |
| bare | sub2-bare | false | none | DeferredToolPlaceholder | absent | absent | absent | sent, ok | absent | absent | absent | absent | absent | sent, ok | sent, ok |

- star: all threads exact = false; exit 0; cost $0.047; init mcp [{"name":"alpha","status":"connected","source":"project"},{"name":"beta","status":"connected","source":"project"},{"name":"gamma","status":"connected","source":"project"}]
- bare: all threads exact = false; exit 0; cost $0.047; init mcp [{"name":"alpha","status":"connected","source":"project"},{"name":"beta","status":"connected","source":"project"},{"name":"gamma","status":"connected","source":"project"}]
