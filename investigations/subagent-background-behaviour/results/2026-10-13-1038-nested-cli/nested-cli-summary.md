> **Run** `results/2026-10-13-1038-nested-cli` · `nested-cli.ts` (args not recorded) · started 2026-10-13 10:38 (approx.)
> **Claude Code** 2.1.296 via installed `claude -p` · **git** not recorded

## Nested matrix, one-shot: headless `claude -p` vs Agent SDK

Pairs are `claude -p` / SDK. Times in seconds from start. SDK values come from the experiment.ts `1shot-*` runs.

| chain | modes as intended (cli) | launcher ended, cli | launcher ended, SDK | worker ended | token reached main | token in main at | session ended |
|---|---|---|---|---|---|---|---|
| main →fg worker | yes | – | – | 54.715 / 52.551 | sync / sync | 55.798 / 53.44 | 56.152 / 53.801 |
| main →bg worker | yes | – | – | 50.538 / 49.771 | callback / callback | 51.579 / 50.688 | 51.896 / 51.022 |
| main →fg launcher →fg worker | yes | 53.606s, got token | 52.723s, got token | 52.271 / 51.645 | sync / sync | 55.034 / 53.811 | 55.417 / 54.146 |
| main →fg launcher →bg worker | yes | 5.843s, no token | 5.485s, no token | 52.68 / 51.799 | callback / callback | 54.068 / 52.931 | 54.415 / 53.244 |
| main →bg launcher →fg worker | yes | 56.07s, got token | 54.046s, got token | 54.731 / 52.977 | callback / callback | 57.327 / 55.14 | 57.693 / 55.498 |
| main →bg launcher →bg worker | yes | 6.578s, no token | 5.21s, no token | 54.414 / 52.597 | callback / callback | 55.687 / 53.755 | 55.989 / 54.071 |
