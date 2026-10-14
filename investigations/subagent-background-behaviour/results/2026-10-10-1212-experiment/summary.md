> **Run** `results/2026-10-10-1212-experiment` · `experiment.ts` (args not recorded) · started 2026-10-10 12:12 (approx.)
> **Claude Code** 2.1.296 via Agent SDK 0.3.296 · **git** not recorded

## Did the WORKER_TOKEN reach main before the session ended?

input `open` = this script kept the session open until background work drained; `string` = one-shot, the CLI alone decides when to end.

| scenario | chain (fg = sync, bg = async) | input | worker ended (s) | token reached main | at (s) | session ended (s) | before end |
|---|---|---|---|---|---|---|---|
| fg-bg | main →fg launcher →bg worker | open | 52.052 | callback (task-notification turn) | 53.188 | 63.629 | yes |
| fg-fg | main →fg launcher →fg worker | open | 52.033 | sync (in the prompt's turn) | 54.416 | 65.642 | yes |
| bg-bg | main →bg launcher →bg worker | open | 52.874 | callback (task-notification turn) | 54.065 | 64.634 | yes |
| bg-fg | main →bg launcher →fg worker | open | 52.448 | callback (task-notification turn) | 54.565 | 65.666 | yes |
| main-busy | main →fg launcher →bg worker | open | 52.296 | sync (in the prompt's turn) | 84.867 | 95.774 | yes |
| main-close | main →fg launcher →bg worker | close | 51.923 | callback (task-notification turn) | 53.056 | 53.362 | yes |
| main-string | main →fg launcher →bg worker | string | 52.601 | callback (task-notification turn) | 53.77 | 54.081 | yes |
| direct-fg | main →fg worker | open | 49.628 | sync (in the prompt's turn) | 50.5 | 61.773 | yes |
| direct-bg | main →bg worker | open | 49.752 | callback (task-notification turn) | 50.631 | 61.794 | yes |
| 1shot-direct-fg | main →fg worker | string | 52.575 | sync (in the prompt's turn) | 53.44 | 53.801 | yes |
| 1shot-direct-bg | main →bg worker | string | 49.796 | callback (task-notification turn) | 50.688 | 51.022 | yes |
| 1shot-fg-fg | main →fg launcher →fg worker | string | 51.668 | sync (in the prompt's turn) | 53.811 | 54.146 | yes |
| 1shot-fg-bg | main →fg launcher →bg worker | string | 51.808 | callback (task-notification turn) | 52.931 | 53.244 | yes |
| 1shot-bg-fg | main →bg launcher →fg worker | string | 53.002 | callback (task-notification turn) | 55.14 | 55.498 | yes |
| 1shot-bg-bg | main →bg launcher →bg worker | string | 52.602 | callback (task-notification turn) | 53.755 | 54.071 | yes |

## Launcher behaviour

| scenario (outer-inner) | launcher bg | worker bg | launcher ended (s) | worker ended (s) | launcher got token | launcher |
|---|---|---|---|---|---|---|
| fg-bg | false | true | 5.152 | 52.042 | false | **DID NOT WAIT** |
| fg-fg | false | false | 53.108 | 52.01 | true | **WAITED** |
| bg-bg | true | true | 5.139 | 52.868 | false | **DID NOT WAIT** |
| bg-fg | true | false | 53.48 | 52.423 | true | **WAITED** |
| main-busy | false | true | 5.439 | 52.292 | false | **DID NOT WAIT** |
| main-close | false | true | 5.578 | 51.917 | false | **DID NOT WAIT** |
| main-string | false | true | 5.414 | 52.593 | false | **DID NOT WAIT** |
| 1shot-fg-fg | false | false | 52.723 | 51.645 | true | **WAITED** |
| 1shot-fg-bg | false | true | 5.485 | 51.799 | false | **DID NOT WAIT** |
| 1shot-bg-fg | true | false | 54.046 | 52.977 | true | **WAITED** |
| 1shot-bg-bg | true | true | 5.21 | 52.597 | false | **DID NOT WAIT** |

## Main conversation behaviour

| scenario | input | main's Agent call returned (s) | worker | main results (time, turn origin, text) | worker token reached main in | query iterator ended (s) |
|---|---|---|---|---|---|---|
| fg-bg | open |5.18 | completed @ 52.052s | 6.191s prompt: `MAIN_TURN_DONE: NONE`<br>53.188s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=617938606` | task-notification | 63.629 |
| fg-fg | open |53.116 | completed @ 52.033s | 54.416s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=414428603` | prompt | 65.642 |
| bg-bg | open |2.407 | completed @ 52.874s | 3.464s prompt: `MAIN_TURN_DONE: NONE`<br>6.264s task-notification: `MAIN_GOT_NOTIFICATION: launcher NONE`<br>54.065s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=909898313` | task-notification | 64.634 |
| bg-fg | open |2.283 | completed @ 52.448s | 3.368s prompt: `MAIN_TURN_DONE: NONE`<br>54.565s task-notification: `MAIN_GOT_NOTIFICATION: launcher WORKER_TOKEN=71256498` | task-notification | 65.666 |
| main-busy | open + busy main |5.474 | completed @ 52.296s | 84.867s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=999841991 ⏎ MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=999841991` | prompt | 95.774 |
| main-close | close |5.607 | completed @ 51.923s | 6.581s prompt: `MAIN_TURN_DONE: NONE`<br>53.056s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=162329547` | task-notification | 53.362 |
| main-string | string |5.455 | completed @ 52.601s | 6.507s prompt: `MAIN_TURN_DONE: NONE`<br>53.77s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=85112628` | task-notification | 54.081 |
| direct-fg | direct worker fg |49.632 | completed @ 49.628s | 50.5s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=630215260` | prompt | 61.773 |
| direct-bg | direct worker bg |1.956 | completed @ 49.752s | 2.811s prompt: `MAIN_TURN_DONE: NONE`<br>50.631s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=699749875` | task-notification | 61.794 |
| 1shot-direct-fg | direct worker fg |52.579 | completed @ 52.575s | 53.44s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=633619737` | prompt | 53.801 |
| 1shot-direct-bg | direct worker bg |2.053 | completed @ 49.796s | 2.805s prompt: `MAIN_TURN_DONE: NONE`<br>50.688s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=789954310` | task-notification | 51.022 |
| 1shot-fg-fg | string |52.731 | completed @ 51.668s | 53.811s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=687045454` | prompt | 54.146 |
| 1shot-fg-bg | string |5.514 | completed @ 51.808s | 6.545s prompt: `MAIN_TURN_DONE: NONE`<br>52.931s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=173168137` | task-notification | 53.244 |
| 1shot-bg-fg | string |2.367 | completed @ 53.002s | 3.42s prompt: `MAIN_TURN_DONE: NONE`<br>55.14s task-notification: `MAIN_GOT_NOTIFICATION: launcher WORKER_TOKEN=611673500` | task-notification | 55.498 |
| 1shot-bg-bg | string |2.46 | completed @ 52.602s | 3.525s prompt: `MAIN_TURN_DONE: NONE`<br>6.306s task-notification: `MAIN_GOT_NOTIFICATION: launcher NONE`<br>53.755s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=182283652` | task-notification | 54.071 |
