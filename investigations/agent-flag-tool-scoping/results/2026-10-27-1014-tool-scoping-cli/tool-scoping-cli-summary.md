> **Run** `results/2026-10-27-1014-tool-scoping-cli` · `tool-scoping-cli.ts` `star` · started 2026-10-27 10:14
> **Claude Code** 2.1.311 via installed `claude -p` · **git** fe8c729 (uncommitted changes)

## Exact tool sets with `--agent`: headless `claude -p`

Cell = visibility in that thread's API requests (`sent` inline, `deferred` via ToolSearch, `absent`), then `ok` / `failed` if it was used (ok = Bash printed BASH_RAN, Read returned READ_NONCE, Write produced WRITE_NONCE, an MCP tool returned its NONCE).

| scenario | thread | exact | missing | extra | Agent | Bash | Read | Write | ToolSearch | mcp__alpha__tool_one | mcp__alpha__tool_two | mcp__beta__tool_one | mcp__beta__tool_two | mcp__gamma__tool_one | mcp__gamma__tool_two |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| star | main (--agent main-star) | false | none | DeferredToolPlaceholder, advisor | sent | sent, ok | absent | absent | absent | sent, ok | sent, ok | absent | absent | absent | absent |
| star | sub1-star | false | none | DeferredToolPlaceholder, advisor | absent | absent | sent, ok | absent | absent | absent | absent | sent, ok | sent, ok | absent | absent |
| star | sub2-star | false | none | DeferredToolPlaceholder, advisor | absent | absent | absent | sent, ok | absent | absent | absent | absent | absent | sent, ok | sent, ok |

- star: all threads exact = false; exit 0; cost $0.079; init mcp [{"name":"alpha","status":"connected","source":"project"},{"name":"beta","status":"connected","source":"project"},{"name":"gamma","status":"connected","source":"project"}]
