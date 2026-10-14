> **Run** `results/2026-10-14-1240-nested-cli` · `nested-cli.ts` (no args) · started 2026-10-14 12:40
> **Claude Code** 2.1.299 via installed `claude -p` · **git** 3004f73 (uncommitted changes)

## Nested matrix, one-shot: headless `claude -p` vs Agent SDK

Pairs are `claude -p` / SDK. Times in seconds from start. SDK values come from the experiment.ts `1shot-*` runs in results/2026-10-14-1225-experiment.

| chain | modes as intended (cli) | launcher ended, cli | launcher ended, SDK | worker ended | token reached main | token in main at | session ended |
|---|---|---|---|---|---|---|---|
| main →fg worker | yes | – | – | 51.128 / 50.8 | sync / sync | 52.212 / 51.774 | 52.527 / 52.231 |
| main →bg worker | yes | – | – | 51.547 / 50.168 | callback / callback | 52.477 / 51.103 | 52.787 / 51.424 |
| main →fg launcher →fg worker | yes | 55.266s, got token | 53.413s, got token | 53.74 / 52.157 | sync / sync | 56.533 / 54.373 | 56.85 / 54.727 |
| main →fg launcher →bg worker | yes | 5.937s, no token | 5.343s, no token | 52.471 / 52.298 | callback / callback | 53.459 / 53.72 | 53.825 / 54.041 |
| main →bg launcher →fg worker | yes | 56.915s, got token | 53.701s, got token | 55.561 / 52.552 | callback / callback | 58.076 / 54.97 | 58.406 / 55.376 |
| main →bg launcher →bg worker | yes | 6.739s, no token | 5.765s, no token | 54.671 / 52.444 | callback / callback | 56.014 / 53.817 | 56.36 / 54.142 |
