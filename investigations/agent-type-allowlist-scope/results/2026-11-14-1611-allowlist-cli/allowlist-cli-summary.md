> **Run** `results/2026-11-14-1611-allowlist-cli` · `allowlist-cli.ts` (no args) · started 2026-11-14 16:11
> **Claude Code** 2.1.325 via installed `claude -p` · **git** 27294b3 (uncommitted changes)

## `tools: Agent(allowed-worker)` on gate: main thread vs subagent, headless `claude -p`

gate's `tools:` is `Agent(allowed-worker)`. It spawns allowed-worker, then blocked-worker. `spawned` = the worker's WORKER_TOKEN came back in gate's tool_result.

| scenario | gate is | gate has Agent | types listed to gate | allowed-worker spawned | blocked-worker spawned | subagents started (type@depth) | cost |
|---|---|---|---|---|---|---|---|
| main-thread | main thread (--agent gate) | true | allowed-worker | yes (token returned) | no: ERROR Agent type 'blocked-worker' not found. Available agents: allowed-worker | allowed-worker@1 | $0.017 |
| subagent | subagent of the default main thread | true | Explore, Plan, allowed-worker, blocked-worker, claude, gate, general-purpose, statusline-setup | yes (token returned) | yes (token returned) | blocked-worker@2, gate@1, allowed-worker@2 | $0.051 |

- main-thread: exit 0; final answer: "ALLOWED: WORKER_TOKEN=40718263\nBLOCKED: Agent type 'blocked-worker' not found. Available agents: allowed-worker"
- subagent: exit 0; final answer: "ALLOWED: WORKER_TOKEN=40718263\nBLOCKED: WORKER_TOKEN=95136027"
