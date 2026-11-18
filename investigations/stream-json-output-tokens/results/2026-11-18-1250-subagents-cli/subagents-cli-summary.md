> **Run** `results/2026-11-18-1250-subagents-cli` · `subagents-cli.ts` (no args) · started 2026-11-18 12:50
> **Claude Code** 2.1.327 via installed `claude -p` · **git** 6f8e06f (uncommitted changes)

## Subagents: main claude-haiku-5-5 (effort medium), worker on Sonnet; process 1 = 2 parallel workers, process 2 (--resume) = 1 worker

Usage cells: input / cache_creation / cache_read / **output**. Truth = stream_event message_start + message_delta, keyed by parent_tool_use_id.

### Runtime: each process's result

| chat | turn | stream msgs main / sub (sub without delta) | truth main (process) | truth main+sub (process) | result.usage | result.usage scope | modelUsage Σ | modelUsage scope | total_cost_usd | results in stream |
|---|---|---|---|---|---|---|---|---|---|---|
| chat1 | 1 | 2 / 0 (0) | 4 / 10043 / 44230 / **473** | 4 / 10043 / 44230 / **473** | 4 / 10043 / 44230 / **473** | process, main only | 12 / 13554 / 58068 / **1633** | neither | 0.024465099999999997 | 1 |
| chat1 | 2 | 2 / 0 (0) | 4 / 5822 / 61074 / **316** | 4 / 5822 / 61074 / **316** | 4 / 5822 / 61074 / **316** | process, main only | 20 / 22110 / 125075 / **2572** | neither | 0.04006493999999999 | 1 |
| chat2 | 1 | 2 / 0 (0) | 4 / 9973 / 44230 / **471** | 4 / 9973 / 44230 / **471** | 4 / 9973 / 44230 / **471** | process, main only | 12 / 20378 / 51149 / **1543** | neither | 0.040113199999999995 | 1 |
| chat2 | 2 | 2 / 0 (0) | 4 / 5739 / 60932 / **297** | 4 / 5739 / 60932 / **297** | 4 / 5739 / 60932 / **297** | process, main only | 20 / 28876 / 118014 / **2411** | neither | 0.055228019999999996 | 1 |

### Session files after the chat

| chat | subagent stream_events forwarded | truth main | files main (dedup) | = | truth subagents | files subagents (dedup) | = | subagent files | last cost-state Σ | cost-state scope | cost-state = files all |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chat1 | false | 8 / 15865 / 105304 / **789** | 8 / 15865 / 105304 / **789** | ✅ | 0 / 0 / 0 / **0** | 12 / 6245 / 19771 / **1783** | – | 3 (2+2+2 msgs) | 20 / 22110 / 125075 / **2572** | main + subagents (= files) | ✅ |
| chat2 | false | 8 / 15712 / 105162 / **768** | 8 / 15712 / 105162 / **768** | ✅ | 0 / 0 / 0 / **0** | 12 / 13164 / 12852 / **1643** | – | 3 (2+2+2 msgs) | 20 / 28876 / 118014 / **2411** | main + subagents (= files) | ✅ |

### Per model (truth vs files vs last cost-state)

| chat | model | truth | files (dedup) | cost-state | cost-state thinking | cost-state costUSD |
|---|---|---|---|---|---|---|
| chat1 | claude-haiku-5-5 | 8 / 15865 / 105304 / **789** | 8 / 15865 / 105304 / **789** | 8 / 15865 / 105304 / **789** | 225 | 0.00462134 |
| chat1 | claude-sonnet-5-5 | – | 12 / 6245 / 19771 / **1783** | 12 / 6245 / 19771 / **1783** | 0 | 0.0354436 |
| chat2 | claude-haiku-5-5 | 8 / 15712 / 105162 / **768** | 8 / 15712 / 105162 / **768** | 8 / 15712 / 105162 / **768** | 206 | 0.004578820000000001 |
| chat2 | claude-sonnet-5-5 | – | 12 / 13164 / 12852 / **1643** | 12 / 13164 / 12852 / **1643** | 0 | 0.0506492 |
