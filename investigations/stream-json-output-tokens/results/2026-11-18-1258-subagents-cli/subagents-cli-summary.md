> **Run** `results/2026-11-18-1258-subagents-cli` · `subagents-cli.ts` `--same-model` · started 2026-11-18 12:58
> **Claude Code** 2.1.327 via installed `claude -p` · **git** 6f8e06f (uncommitted changes)

## Subagents: main claude-haiku-5-5 (effort medium), worker on the same model; process 1 = 2 parallel workers, process 2 (--resume) = 1 worker

Usage cells: input / cache_creation / cache_read / **output**. Truth = stream_event message_start + message_delta, keyed by parent_tool_use_id.

### Runtime: each process's result

| chat | turn | stream msgs main / sub (sub without delta) | truth main (process) | truth main+sub (process) | result.usage | result.usage scope | modelUsage Σ | modelUsage scope | total_cost_usd | results in stream |
|---|---|---|---|---|---|---|---|---|---|---|
| chat1 | 1 | 2 / 0 (0) | 4 / 10167 / 44304 / **477** | 4 / 10167 / 44304 / **477** | 4 / 10167 / 44304 / **477** | process, main only | 12 / 18217 / 53757 / **2173** | neither | 0.00466492 | 1 |
| chat1 | 2 | 2 / 0 (0) | 4 / 5789 / 61322 / **288** | 4 / 5789 / 61322 / **288** | 4 / 5789 / 61322 / **288** | process, main only | 20 / 26788 / 121055 / **3454** | neither | 0.00748475 | 1 |
| chat2 | 1 | 2 / 0 (0) | 4 / 10068 / 44304 / **468** | 4 / 10068 / 44304 / **468** | 4 / 10068 / 44304 / **468** | process, main only | 12 / 13654 / 58222 / **2280** | neither | 0.00418527 | 1 |
| chat2 | 2 | 2 / 0 (0) | 4 / 5843 / 61115 / **270** | 4 / 5843 / 61115 / **270** | 4 / 5843 / 61115 / **270** | process, main only | 20 / 19497 / 128095 / **3605** | neither | 0.0067158999999999995 | 1 |

### Session files after the chat

| chat | subagent stream_events forwarded | truth main | files main (dedup) | = | truth subagents | files subagents (dedup) | = | subagent files | last cost-state Σ | cost-state scope | cost-state = files all |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chat1 | false | 8 / 15956 / 105626 / **765** | 8 / 15956 / 105626 / **765** | ✅ | 0 / 0 / 0 / **0** | 12 / 10832 / 15429 / **2689** | – | 3 (2+2+2 msgs) | 20 / 26788 / 121055 / **3454** | main + subagents (= files) | ✅ |
| chat2 | false | 8 / 15911 / 105419 / **738** | 8 / 15911 / 105419 / **738** | ✅ | 0 / 0 / 0 / **0** | 12 / 3586 / 22676 / **2867** | – | 3 (2+2+2 msgs) | 20 / 19497 / 128095 / **3605** | main + subagents (= files) | ✅ |

### Per model (truth vs files vs last cost-state)

| chat | model | truth | files (dedup) | cost-state | cost-state thinking | cost-state costUSD |
|---|---|---|---|---|---|---|
| chat1 | claude-haiku-5-5 | 8 / 15956 / 105626 / **765** | 20 / 26788 / 121055 / **3454** | 20 / 26788 / 121055 / **3454** | 1047 | 0.00748475 |
| chat2 | claude-haiku-5-5 | 8 / 15911 / 105419 / **738** | 20 / 19497 / 128095 / **3605** | 20 / 19497 / 128095 / **3605** | 1190 | 0.0067158999999999995 |
