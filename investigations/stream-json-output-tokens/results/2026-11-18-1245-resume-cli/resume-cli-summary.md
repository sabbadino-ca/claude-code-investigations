> **Run** `results/2026-11-18-1245-resume-cli` · `resume-cli.ts` (no args) · started 2026-11-18 12:45
> **Claude Code** 2.1.327 via installed `claude -p` · **git** 6f8e06f (uncommitted changes)

## Multi-process chat: `claude -p`, then `claude -p --resume` ×2: claude-haiku-5-5, effort medium

Usage cells: input / cache_creation / cache_read / **output**. Truth = stream_event message_start (input, cache) + message_delta (output), summed over the process's API messages.

### A. Runtime: what each process's `result` covers

| chat | turn | session_id | msgs | truth (this process) | truth (running total) | result.usage | result.usage = | modelUsage out | modelUsage in | modelUsage = (out / in) | total_cost_usd | modelUsage costUSD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chat1 | 1 | `ad0db25e` | 2 | 4 / 8125 / 44103 / **799** | 4 / 8125 / 44103 / **799** | 4 / 8125 / 44103 / **799** | this process | 799 | 4 | this process / this process | 0.00246593 | 0.00246593 |
| chat1 | 2 | `ad0db25e` | 1 | 2 / 789 / 28046 / **2062** | 6 / 8914 / 72149 / **2861** | 2 / 789 / 28046 / **2062** | this process | 2861 | 6 | running total / running total | 0.0039353899999999995 | 0.0039353899999999995 |
| chat1 | 3 | `ad0db25e` | 2 | 4 / 2452 / 59861 / **274** | 10 / 11366 / 132010 / **3135** | 4 / 2452 / 59861 / **274** | this process | 3135 | 10 | running total / running total | 0.005161799999999999 | 0.005161799999999999 |
| chat2 | 1 | `7fb74409` | 2 | 4 / 8261 / 44103 / **959** | 4 / 8261 / 44103 / **959** | 4 / 8261 / 44103 / **959** | this process | 959 | 4 | this process / this process | 0.00257313 | 0.00257313 |
| chat2 | 2 | `7fb74409` | 1 | 2 / 872 / 28182 / **1734** | 6 / 9133 / 72285 / **2693** | 2 / 872 / 28182 / **1734** | this process | 2693 | 6 | running total / running total | 0.00389655 | 0.00389655 |
| chat2 | 3 | `7fb74409` | 2 | 4 / 2122 / 59971 / **357** | 10 / 11255 / 132256 / **3050** | 4 / 2122 / 59971 / **357** | this process | 3050 | 10 | running total / running total | 0.00509956 | 0.00509956 |

### B. After the chat: the session files alone

| chat | same session_id across --resume | files | entry types | truth total | files, dedup by message.id | equal | naive output Σ over entries | missing from files | cost / modelUsage in files |
|---|---|---|---|---|---|---|---|---|---|
| chat1 | true | ad0db25e: 71 lines, 5 msgs | session-owner:5, queue-operation:6, user:6, attachment:18, atis-latch:5, last-prompt:6, api-request-shape:1, api-request-blob:5, api-request:5, tools-used:2, assistant:8, cost-state:3, mode:1 | 10 / 11366 / 132010 / **3135** | 10 / 11366 / 132010 / **3135** | ✅ | 6077 | 0 | yes |
| chat2 | true | 7fb74409: 73 lines, 5 msgs | session-owner:5, queue-operation:6, user:7, attachment:18, atis-latch:5, last-prompt:6, api-request-shape:1, api-request-blob:5, api-request:5, tools-used:2, assistant:9, cost-state:3, mode:1 | 10 / 11255 / 132256 / **3050** | 10 / 11255 / 132256 / **3050** | ✅ | 4366 | 0 | yes |

### Per message (session files vs truth)

| chat | turn | message.id | entries in file | output values in file | file usage | truth | equal | thinking_tokens |
|---|---|---|---|---|---|---|---|---|
| chat1 | 1 | `fvD4xtAt` | 1 | 84 | 2 / 4261 / 19921 / **84** | 2 / 4261 / 19921 / **84** | ✅ | 0 |
| chat1 | 1 | `iRFHyxvG` | 2 | 715, 715 | 2 / 3864 / 24182 / **715** | 2 / 3864 / 24182 / **715** | ✅ | 148 |
| chat1 | 2 | `pD6qR3cE` | 2 | 2062, 2062 | 2 / 789 / 28046 / **2062** | 2 / 789 / 28046 / **2062** | ✅ | 323 |
| chat1 | 3 | `LXFcvtGh` | 2 | 165, 165 | 2 / 2191 / 28835 / **165** | 2 / 2191 / 28835 / **165** | ✅ | 0 |
| chat1 | 3 | `ionNjzg3` | 1 | 109 | 2 / 261 / 31026 / **109** | 2 / 261 / 31026 / **109** | ✅ | 0 |
| chat2 | 1 | `cP6R3DZ6` | 2 | 161, 161 | 2 / 4261 / 19921 / **161** | 2 / 4261 / 19921 / **161** | ✅ | 0 |
| chat2 | 1 | `Pcv8Bby2` | 2 | 798, 798 | 2 / 4000 / 24182 / **798** | 2 / 4000 / 24182 / **798** | ✅ | 148 |
| chat2 | 2 | `WgHDyJgz` | 1 | 1734 | 2 / 872 / 28182 / **1734** | 2 / 872 / 28182 / **1734** | ✅ | 0 |
| chat2 | 3 | `yTZM4Wvi` | 2 | 163, 163 | 2 / 1863 / 29054 / **163** | 2 / 1863 / 29054 / **163** | ✅ | 0 |
| chat2 | 3 | `TxdzKCfn` | 2 | 194, 194 | 2 / 259 / 30917 / **194** | 2 / 259 / 30917 / **194** | ✅ | 100 |
