> **Run** `results/2026-11-18-1218-output-tokens-cli` · `output-tokens-cli.ts` (no args) · started 2026-11-18 12:18
> **Claude Code** 2.1.327 via installed `claude -p` · **git** 6f8e06f (uncommitted changes)

## Output tokens in `claude -p --output-format stream-json --verbose`: claude-haiku-5-5, effort medium

Columns are sums over the run's API messages (one per `message.id`). Reference: `result.usage.output_tokens`.

| run | msgs | result.usage | modelUsage | assistant first | assistant last | assistant naive Σ events | message_start | message_delta | transcript | delta = result | last assistant = result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| long-text-partial-r1 | 1 | 4211 | 4211 | 2 | 2 | 4 | 2 | 4211 | 4211 | ✅ | ❌ |
| long-text-partial-r2 | 1 | 4488 | 4488 | 2 | 2 | 4 | 2 | 4488 | 4488 | ✅ | ❌ |
| long-text-partial-r3 | 1 | 3931 | 3931 | 2 | 2 | 4 | 2 | 3931 | 3931 | ✅ | ❌ |
| long-text-plain-r1 | 1 | 3831 | 3831 | 3 | 3 | 6 | – | – | 3831 | – | ❌ |
| long-text-plain-r2 | 1 | 3607 | 3607 | 2 | 2 | 4 | – | – | 3607 | – | ❌ |
| long-text-plain-r3 | 1 | 4305 | 4305 | 3 | 3 | 6 | – | – | 4305 | – | ❌ |
| multi-tool-partial-r1 | 3 | 1374 | 1374 | 30 | 30 | 80 | 30 | 1374 | 1374 | ✅ | ❌ |
| multi-tool-partial-r2 | 3 | 1274 | 1274 | 23 | 23 | 63 | 23 | 1274 | 1274 | ✅ | ❌ |
| multi-tool-partial-r3 | 3 | 1353 | 1353 | 22 | 22 | 60 | 22 | 1353 | 1353 | ✅ | ❌ |
| multi-tool-plain-r1 | 3 | 1146 | 1146 | 28 | 28 | 73 | – | – | 1146 | – | ❌ |
| multi-tool-plain-r2 | 3 | 1149 | 1149 | 27 | 27 | 70 | – | – | 1149 | – | ❌ |
| multi-tool-plain-r3 | 3 | 1307 | 1307 | 22 | 22 | 60 | – | – | 1307 | – | ❌ |
| one-tool-partial-r1 | 2 | 92 | 92 | 18 | 18 | 18 | 18 | 92 | 92 | ✅ | ❌ |
| one-tool-partial-r2 | 2 | 92 | 92 | 17 | 17 | 17 | 17 | 92 | 92 | ✅ | ❌ |
| one-tool-partial-r3 | 2 | 92 | 92 | 17 | 17 | 17 | 17 | 92 | 92 | ✅ | ❌ |
| one-tool-plain-r1 | 2 | 93 | 93 | 17 | 17 | 17 | – | – | 93 | – | ❌ |
| one-tool-plain-r2 | 2 | 92 | 92 | 17 | 17 | 17 | – | – | 92 | – | ❌ |
| one-tool-plain-r3 | 2 | 92 | 92 | 17 | 17 | 17 | – | – | 92 | – | ❌ |
| short-text-partial-r1 | 1 | 20 | 20 | 8 | 8 | 8 | 8 | 20 | 20 | ✅ | ❌ |
| short-text-partial-r2 | 1 | 20 | 20 | 8 | 8 | 8 | 8 | 20 | 20 | ✅ | ❌ |
| short-text-partial-r3 | 1 | 20 | 20 | 8 | 8 | 8 | 8 | 20 | 20 | ✅ | ❌ |
| short-text-plain-r1 | 1 | 20 | 20 | 8 | 8 | 8 | – | – | 20 | – | ❌ |
| short-text-plain-r2 | 1 | 20 | 20 | 8 | 8 | 8 | – | – | 20 | – | ❌ |
| short-text-plain-r3 | 1 | 20 | 20 | 8 | 8 | 8 | – | – | 20 | – | ❌ |
| very-long-text-partial-r1 | 1 | 29341 | 29341 | 2 | 2 | 4 | 2 | 29341 | 29341 | ✅ | ❌ |
| very-long-text-partial-r2 | 1 | 26287 | 26287 | 8 | 8 | 16 | 8 | 26287 | 26287 | ✅ | ❌ |
| very-long-text-partial-r3 | 1 | 25685 | 25685 | 8 | 8 | 16 | 8 | 25685 | 25685 | ✅ | ❌ |
| very-long-text-plain-r1 | 1 | 25880 | 25880 | 2 | 2 | 4 | – | – | 25880 | – | ❌ |
| very-long-text-plain-r2 | 1 | 18274 | 18274 | 8 | 8 | 16 | – | – | 18274 | – | ❌ |
| very-long-text-plain-r3 | 1 | 29694 | 29694 | 8 | 8 | 16 | – | – | 29694 | – | ❌ |

### Per message

| run | message.id | assistant events (blocks: output_tokens) | message_start | message_delta | transcript |
|---|---|---|---|---|---|
| long-text-partial-r1 | `J6q9qGMt` | thinking: 2<br>text: 2 | 2 | 4211 | 4211, 4211 |
| long-text-partial-r2 | `tqoNEnpo` | thinking: 2<br>text: 2 | 2 | 4488 | 4488, 4488 |
| long-text-partial-r3 | `WpabaFwD` | thinking: 2<br>text: 2 | 2 | 3931 | 3931, 3931 |
| long-text-plain-r1 | `g6NyWrq8` | thinking: 3<br>text: 3 | – | – | 3831, 3831 |
| long-text-plain-r2 | `zwWaW9bp` | thinking: 2<br>text: 2 | – | – | 3607, 3607 |
| long-text-plain-r3 | `NRaBNWp3` | thinking: 3<br>text: 3 | – | – | 4305, 4305 |
| multi-tool-partial-r1 | `C1Rkp1di` | tool_use: 20<br>tool_use: 20<br>tool_use: 20 | 20 | 246 | 246, 246, 246 |
| multi-tool-partial-r1 | `DitVuP9v` | thinking: 5<br>tool_use: 5 | 5 | 206 | 206, 206 |
| multi-tool-partial-r1 | `M9qpcNyi` | thinking: 5<br>text: 5 | 5 | 922 | 922, 922 |
| multi-tool-partial-r2 | `NsVt4Pzm` | tool_use: 17<br>tool_use: 17<br>tool_use: 17 | 17 | 243 | 243, 243, 243 |
| multi-tool-partial-r2 | `9afwNGiZ` | thinking: 3<br>tool_use: 3 | 3 | 125 | 125, 125 |
| multi-tool-partial-r2 | `pyiNgKtS` | thinking: 3<br>text: 3 | 3 | 906 | 906, 906 |
| multi-tool-partial-r3 | `KVjYYYTP` | tool_use: 16<br>tool_use: 16<br>tool_use: 16 | 16 | 246 | 246, 246, 246 |
| multi-tool-partial-r3 | `6jxXD6Bc` | thinking: 3<br>tool_use: 3 | 3 | 171 | 171, 171 |
| multi-tool-partial-r3 | `Uyf91dG7` | thinking: 3<br>text: 3 | 3 | 936 | 936, 936 |
| multi-tool-plain-r1 | `QUWEGxLV` | tool_use: 17<br>tool_use: 17<br>tool_use: 17 | – | – | 243, 243, 243 |
| multi-tool-plain-r1 | `BDiPHvf3` | thinking: 6<br>tool_use: 6 | – | – | 144, 144 |
| multi-tool-plain-r1 | `tVX5fkDh` | thinking: 5<br>text: 5 | – | – | 759, 759 |
| multi-tool-plain-r2 | `coWkt3AD` | tool_use: 16<br>tool_use: 16<br>tool_use: 16 | – | – | 243, 243, 243 |
| multi-tool-plain-r2 | `4BsSJMjs` | thinking: 6<br>tool_use: 6 | – | – | 157, 157 |
| multi-tool-plain-r2 | `52nkFZ33` | thinking: 5<br>text: 5 | – | – | 749, 749 |
| multi-tool-plain-r3 | `kKW1VbFD` | tool_use: 16<br>tool_use: 16<br>tool_use: 16 | – | – | 246, 246, 246 |
| multi-tool-plain-r3 | `U3CpEV2C` | thinking: 3<br>tool_use: 3 | – | – | 171, 171 |
| multi-tool-plain-r3 | `FxnLr8ss` | thinking: 3<br>text: 3 | – | – | 890, 890 |
| one-tool-partial-r1 | `QQGTFydq` | tool_use: 17 | 17 | 82 | 82 |
| one-tool-partial-r1 | `6SjYicBQ` | text: 1 | 1 | 10 | 10 |
| one-tool-partial-r2 | `AdyiwXt3` | tool_use: 16 | 16 | 82 | 82 |
| one-tool-partial-r2 | `xxKfgURu` | text: 1 | 1 | 10 | 10 |
| one-tool-partial-r3 | `9eQuBkhD` | tool_use: 16 | 16 | 82 | 82 |
| one-tool-partial-r3 | `GKSfneZ5` | text: 1 | 1 | 10 | 10 |
| one-tool-plain-r1 | `hm93fNVC` | tool_use: 16 | – | – | 83 |
| one-tool-plain-r1 | `rF1gZq7d` | text: 1 | – | – | 10 |
| one-tool-plain-r2 | `owAkUxF1` | tool_use: 16 | – | – | 82 |
| one-tool-plain-r2 | `n5XmSwFu` | text: 1 | – | – | 10 |
| one-tool-plain-r3 | `T5BEekkJ` | tool_use: 16 | – | – | 82 |
| one-tool-plain-r3 | `tYCMC2jP` | text: 1 | – | – | 10 |
| short-text-partial-r1 | `KHv9HPYS` | text: 8 | 8 | 20 | 20 |
| short-text-partial-r2 | `2GFXcfV5` | text: 8 | 8 | 20 | 20 |
| short-text-partial-r3 | `3ENZTykE` | text: 8 | 8 | 20 | 20 |
| short-text-plain-r1 | `DMaZud4v` | text: 8 | – | – | 20 |
| short-text-plain-r2 | `qY3kh28Y` | text: 8 | – | – | 20 |
| short-text-plain-r3 | `wS7yFQMF` | text: 8 | – | – | 20 |
| very-long-text-partial-r1 | `vivwwoK6` | thinking: 2<br>text: 2 | 2 | 29341 | 29341, 29341 |
| very-long-text-partial-r2 | `T9NniSW6` | thinking: 8<br>text: 8 | 8 | 26287 | 26287, 26287 |
| very-long-text-partial-r3 | `q8NJtwAJ` | thinking: 8<br>text: 8 | 8 | 25685 | 25685, 25685 |
| very-long-text-plain-r1 | `BT41WbT8` | thinking: 2<br>text: 2 | – | – | 25880, 25880 |
| very-long-text-plain-r2 | `3bGU64XY` | thinking: 8<br>text: 8 | – | – | 18274, 18274 |
| very-long-text-plain-r3 | `KTRB58V5` | thinking: 8<br>text: 8 | – | – | 29694, 29694 |
