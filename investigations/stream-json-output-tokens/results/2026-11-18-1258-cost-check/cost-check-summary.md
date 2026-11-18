> **Run** `results/2026-11-18-1258-cost-check` · `cost-check.ts` (no args) · started 2026-11-18 12:58
> **Claude Code** not recorded · **git** 6f8e06f (uncommitted changes)

## Cost recomputed from the session files vs Claude Code's own `cost-state`

Prices ($/MTok): claude-haiku-5-5 in 0.1 / out 0.5 / write5m 0.125 / write1h 0.2 / read 0.01; claude-sonnet-5-5 in 2 / out 10 / write5m 2.5 / write1h 4 / read 0.1.

Sessions with a cost-state: **40**. Per-model entries matching `costUSD` exactly (|diff| < 1e-9): **42/42**. Totals matching `totalCostUSD`: **40/40**.

### Sessions with subagents: cost per agent

| session | agent | model(s) | msgs | output tokens | computed cost |
|---|---|---|---|---|---|
| `00fd7e89` | main | claude-haiku-5-5 | 4 | 768 | $0.00457882 |
| `00fd7e89` | agent-a0cea6574292ab75a | claude-sonnet-5-5 | 2 | 529 | $0.01865150 |
| `00fd7e89` | agent-a68943ea59b3de642 | claude-sonnet-5-5 | 2 | 571 | $0.01320880 |
| `00fd7e89` | agent-af603905276e660fe | claude-sonnet-5-5 | 2 | 543 | $0.01878890 |
| `00fd7e89` | **sum** | | | | **$0.05522802** (cost-state $0.05522802, ✅)|
| `303f7d7b` | main | claude-haiku-5-5 | 4 | 789 | $0.00462134 |
| `303f7d7b` | agent-a865953dd6e23c538 | claude-sonnet-5-5 | 2 | 566 | $0.01071750 |
| `303f7d7b` | agent-aa14f1bdb698482b3 | claude-sonnet-5-5 | 2 | 623 | $0.01366630 |
| `303f7d7b` | agent-adb23137a456de70d | claude-sonnet-5-5 | 2 | 594 | $0.01105980 |
| `303f7d7b` | **sum** | | | | **$0.04006494** (cost-state $0.04006494, ✅)|
| `5494b80e` | main | claude-haiku-5-5 | 4 | 738 | $0.00460619 |
| `5494b80e` | agent-a2f679a66837802c7 | claude-haiku-5-5 | 2 | 1055 | $0.00061548 |
| `5494b80e` | agent-ac84a208bac7601e9 | claude-haiku-5-5 | 2 | 857 | $0.00072275 |
| `5494b80e` | agent-acd2fc010fcd02f50 | claude-haiku-5-5 | 2 | 955 | $0.00077148 |
| `5494b80e` | **sum** | | | | **$0.00671590** (cost-state $0.00671590, ✅)|
| `f5fd90b6` | main | claude-haiku-5-5 | 4 | 765 | $0.00463076 |
| `f5fd90b6` | agent-a37b2e686e95ae655 | claude-haiku-5-5 | 2 | 993 | $0.00090441 |
| `f5fd90b6` | agent-a4ac7f0543e9f149c | claude-haiku-5-5 | 2 | 994 | $0.00090452 |
| `f5fd90b6` | agent-a62c67908b451eba7 | claude-haiku-5-5 | 2 | 702 | $0.00104506 |
| `f5fd90b6` | **sum** | | | | **$0.00748475** (cost-state $0.00748475, ✅)|

### Every session

| session | agents | model | computed | cost-state costUSD | exact |
|---|---|---|---|---|---|
| `00fd7e89` | 4 | claude-haiku-5-5 | $0.00457882 | $0.00457882 | ✅ |
| `00fd7e89` | 4 | claude-sonnet-5-5 | $0.05064920 | $0.05064920 | ✅ |
| `10d324d2` | 1 | claude-haiku-5-5 | $0.00025160 | $0.00025160 | ✅ |
| `1b62fdbc` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `1e44664d` | 1 | claude-haiku-5-5 | $0.00105321 | $0.00105321 | ✅ |
| `2f345375` | 1 | claude-haiku-5-5 | $0.00025160 | $0.00025160 | ✅ |
| `303f7d7b` | 4 | claude-haiku-5-5 | $0.00462134 | $0.00462134 | ✅ |
| `303f7d7b` | 4 | claude-sonnet-5-5 | $0.03544360 | $0.03544360 | ✅ |
| `3463cf05` | 1 | claude-haiku-5-5 | $0.01399161 | $0.01399161 | ✅ |
| `34a4a7a8` | 1 | claude-haiku-5-5 | $0.00025160 | $0.00025160 | ✅ |
| `34e54866` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `37efe484` | 1 | claude-haiku-5-5 | $0.01491252 | $0.01491252 | ✅ |
| `38ae3661` | 1 | claude-haiku-5-5 | $0.00105240 | $0.00105240 | ✅ |
| `4fe7c3ac` | 1 | claude-haiku-5-5 | $0.00204524 | $0.00204524 | ✅ |
| `5204e9dd` | 1 | claude-haiku-5-5 | $0.00105321 | $0.00105321 | ✅ |
| `5494b80e` | 4 | claude-haiku-5-5 | $0.00671590 | $0.00671590 | ✅ |
| `5528ca24` | 1 | claude-haiku-5-5 | $0.00142367 | $0.00142367 | ✅ |
| `56e9d94e` | 1 | claude-haiku-5-5 | $0.00248574 | $0.00248574 | ✅ |
| `5b77ca29` | 1 | claude-haiku-5-5 | $0.01308452 | $0.01308452 | ✅ |
| `5c1102f8` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `609c6c0d` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `6faae256` | 1 | claude-haiku-5-5 | $0.01338552 | $0.01338552 | ✅ |
| `7fb74409` | 1 | claude-haiku-5-5 | $0.00509956 | $0.00509956 | ✅ |
| `88abceb5` | 1 | claude-haiku-5-5 | $0.00296151 | $0.00296151 | ✅ |
| `9a1a859e` | 1 | claude-haiku-5-5 | $0.00239424 | $0.00239424 | ✅ |
| `a7ce5f94` | 1 | claude-haiku-5-5 | $0.00130292 | $0.00130292 | ✅ |
| `ab918205` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `ad0db25e` | 1 | claude-haiku-5-5 | $0.00516180 | $0.00516180 | ✅ |
| `ad2a5ecf` | 1 | claude-haiku-5-5 | $0.00152853 | $0.00152853 | ✅ |
| `b3a91e5e` | 1 | claude-haiku-5-5 | $0.00147977 | $0.00147977 | ✅ |
| `bbe9a750` | 1 | claude-haiku-5-5 | $0.00232845 | $0.00232845 | ✅ |
| `c4d82156` | 1 | claude-haiku-5-5 | $0.00150553 | $0.00150553 | ✅ |
| `c90a8e90` | 1 | claude-haiku-5-5 | $0.01508902 | $0.01508902 | ✅ |
| `d56eaab7` | 1 | claude-haiku-5-5 | $0.00937902 | $0.00937902 | ✅ |
| `de9c2884` | 1 | claude-haiku-5-5 | $0.00105240 | $0.00105240 | ✅ |
| `e40ac66f` | 1 | claude-haiku-5-5 | $0.00056844 | $0.00056844 | ✅ |
| `ea8d966e` | 1 | claude-haiku-5-5 | $0.00025160 | $0.00025160 | ✅ |
| `f4df0fbc` | 1 | claude-haiku-5-5 | $0.00302374 | $0.00302374 | ✅ |
| `f5fd90b6` | 4 | claude-haiku-5-5 | $0.00748475 | $0.00748475 | ✅ |
| `f741a828` | 1 | claude-haiku-5-5 | $0.00258491 | $0.00258491 | ✅ |
| `f9a7205d` | 1 | claude-haiku-5-5 | $0.00220724 | $0.00220724 | ✅ |
| `fb821a4c` | 1 | claude-haiku-5-5 | $0.00234724 | $0.00234724 | ✅ |
