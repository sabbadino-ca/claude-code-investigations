> **Run** `results/2026-11-18-1313-session-vs-report` · `session-vs-report.ts` (no args) · started 2026-11-18 13:13
> **Claude Code** not recorded · **git** 6f8e06f (uncommitted changes)

## Session `8cb96fe0-c2f4-48ec-9875-cfbe43c0e91b` (Claude Code 2.1.319): files vs CAIP-report

Files: `8cb96fe0-c2f4-48ec-9875-cfbe43c0e91b.jsonl` + 2 subagent file(s). Report: `CAIP-report-8cb96fe0.json`.

Last cost-state = files (per model, all fields): **✅ exact**. Output in the files: **20750**, report estimate: **9917** (48%).

| agent | type | description | msgs | entries | provisional values | output (files) | of which thinking | naive Σ over entries | report out (matched calls) | report / files |
|---|---|---|---|---|---|---|---|---|---|---|
| main | main session | – | 4 | 6 | none | 3102 | 203 | 5012 | 2106 (4/4) | 68% |
| a3de139157d34b107 | CAIP Architect Validator | Validate Post Service L3/L4 | 16 | 40 | none | 6300 | 1142 | 16058 | 2830 (16/16) | 45% |
| ab10914d3a3d01aeb | CAIP Architect | Model L3 and L4 Post Service | 24 | 68 | none | 11348 | 1069 | 42139 | 4981 (24/24) | 44% |

### Per API call

| agent | # | blocks | output (files) | thinking | report out | report / (output − thinking) |
|---|---|---|---|---|---|---|
| main | 1 | thinking | tool_use | 870 | 157 | 478 | 67% |
| main | 2 | thinking | text | 1040 | 46 | 757 | 76% |
| main | 3 | tool_use | 564 | 0 | 363 | 64% |
| main | 4 | text | 628 | 0 | 508 | 81% |
| a3de1391 | 1 | thinking | text | tool_use | tool_use | 420 | 13 | 241 | 59% |
| a3de1391 | 2 | tool_use | 97 | 0 | 29 | 30% |
| a3de1391 | 3 | tool_use | tool_use | 151 | 0 | 31 | 21% |
| a3de1391 | 4 | tool_use | tool_use | 128 | 0 | 8 | 6% |
| a3de1391 | 5 | thinking | tool_use | tool_use | tool_use | 484 | 71 | 247 | 60% |
| a3de1391 | 6 | thinking | tool_use | tool_use | tool_use | 370 | 78 | 137 | 47% |
| a3de1391 | 7 | tool_use | tool_use | 149 | 0 | 34 | 23% |
| a3de1391 | 8 | thinking | tool_use | 118 | 21 | 28 | 29% |
| a3de1391 | 9 | tool_use | tool_use | 150 | 0 | 35 | 23% |
| a3de1391 | 10 | thinking | tool_use | tool_use | 325 | 128 | 88 | 45% |
| a3de1391 | 11 | tool_use | tool_use | tool_use | tool_use | 341 | 0 | 141 | 41% |
| a3de1391 | 12 | thinking | tool_use | 147 | 50 | 29 | 30% |
| a3de1391 | 13 | tool_use | tool_use | 264 | 0 | 138 | 52% |
| a3de1391 | 14 | thinking | tool_use | 164 | 62 | 28 | 27% |
| a3de1391 | 15 | tool_use | tool_use | 292 | 0 | 138 | 47% |
| a3de1391 | 16 | thinking | text | 2700 | 719 | 1478 | 75% |
| ab10914d | 1 | thinking | text | tool_use | tool_use | tool_use | tool_use | 1031 | 29 | 632 | 63% |
| ab10914d | 2 | tool_use | 47 | 0 | 2 | 4% |
| ab10914d | 3 | tool_use | 56 | 0 | 2 | 4% |
| ab10914d | 4 | thinking | tool_use | tool_use | tool_use | 296 | 24 | 69 | 25% |
| ab10914d | 5 | thinking | tool_use | tool_use | tool_use | tool_use | tool_use | tool_use | 1024 | 611 | 30 | 7% |
| ab10914d | 6 | thinking | tool_use | 408 | 41 | 179 | 49% |
| ab10914d | 7 | thinking | tool_use | 625 | 118 | 395 | 78% |
| ab10914d | 8 | tool_use | tool_use | 679 | 0 | 472 | 70% |
| ab10914d | 9 | text | tool_use | tool_use | tool_use | 300 | 0 | 114 | 38% |
| ab10914d | 10 | thinking | tool_use | 257 | 130 | 39 | 31% |
| ab10914d | 11 | tool_use | tool_use | tool_use | 404 | 0 | 130 | 32% |
| ab10914d | 12 | tool_use | 121 | 0 | 34 | 28% |
| ab10914d | 13 | tool_use | tool_use | tool_use | 374 | 0 | 127 | 34% |
| ab10914d | 14 | tool_use | 150 | 0 | 58 | 39% |
| ab10914d | 15 | tool_use | tool_use | tool_use | 378 | 0 | 140 | 37% |
| ab10914d | 16 | tool_use | 261 | 0 | 122 | 47% |
| ab10914d | 17 | text | tool_use | tool_use | tool_use | tool_use | tool_use | tool_use | tool_use | 1060 | 0 | 375 | 35% |
| ab10914d | 18 | tool_use | 272 | 0 | 123 | 45% |
| ab10914d | 19 | tool_use | tool_use | tool_use | tool_use | tool_use | 873 | 0 | 327 | 37% |
| ab10914d | 20 | text | tool_use | 86 | 0 | 11 | 13% |
| ab10914d | 21 | thinking | tool_use | tool_use | 260 | 116 | 31 | 22% |
| ab10914d | 22 | tool_use | tool_use | 93 | 0 | 4 | 4% |
| ab10914d | 23 | text | tool_use | tool_use | 906 | 0 | 519 | 57% |
| ab10914d | 24 | text | 1387 | 0 | 1046 | 75% |
