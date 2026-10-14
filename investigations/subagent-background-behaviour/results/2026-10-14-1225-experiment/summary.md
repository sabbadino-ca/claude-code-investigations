> **Run** `results/2026-10-14-1225-experiment` · `experiment.ts` (no args) · started 2026-10-14 12:25
> **Claude Code** 2.1.296 via Agent SDK 0.3.296 · **git** 3004f73 (uncommitted changes)

## Did the WORKER_TOKEN reach main before the session ended?

input `open` = this script kept the session open until background work drained; `string` = one-shot, the CLI alone decides when to end.

| scenario | chain (fg = sync, bg = async) | input | worker ended (s) | token reached main | at (s) | session ended (s) | before end |
|---|---|---|---|---|---|---|---|
| fg-bg | main →fg launcher →bg worker | open | 53.46 | callback (task-notification turn) | 54.803 | 65.116 | yes |
| fg-fg | main →fg launcher →fg worker | open | 52.314 | sync (in the prompt's turn) | 54.565 | 65.652 | yes |
| bg-bg | main →bg launcher →bg worker | open | 52.53 | callback (task-notification turn) | 53.94 | 64.63 | yes |
| bg-fg | main →bg launcher →fg worker | open | 52.177 | callback (task-notification turn) | 54.685 | 65.653 | yes |
| main-busy | main →fg launcher →bg worker | open | 52.313 | sync (in the prompt's turn) | 82.54 | 93.838 | yes |
| main-close | main →fg launcher →bg worker | close | 52.316 | callback (task-notification turn) | 53.541 | 53.882 | yes |
| main-string | main →fg launcher →bg worker | string | 52.58 | callback (task-notification turn) | 53.808 | 54.125 | yes |
| direct-fg | main →fg worker | open | 50.465 | sync (in the prompt's turn) | 51.441 | 62.641 | yes |
| direct-bg | main →bg worker | open | 50.403 | callback (task-notification turn) | 51.382 | 61.74 | yes |
| 1shot-direct-fg | main →fg worker | string | 50.823 | sync (in the prompt's turn) | 51.774 | 52.231 | yes |
| 1shot-direct-bg | main →bg worker | string | 50.195 | callback (task-notification turn) | 51.103 | 51.424 | yes |
| 1shot-fg-fg | main →fg launcher →fg worker | string | 52.18 | sync (in the prompt's turn) | 54.373 | 54.727 | yes |
| 1shot-fg-bg | main →fg launcher →bg worker | string | 52.305 | callback (task-notification turn) | 53.72 | 54.041 | yes |
| 1shot-bg-fg | main →bg launcher →fg worker | string | 52.575 | callback (task-notification turn) | 54.97 | 55.376 | yes |
| 1shot-bg-bg | main →bg launcher →bg worker | string | 52.449 | callback (task-notification turn) | 53.817 | 54.142 | yes |

## Launcher behaviour

| scenario (outer-inner) | launcher bg | worker bg | launcher ended (s) | worker ended (s) | launcher got token | launcher |
|---|---|---|---|---|---|---|
| fg-bg | false | true | 6.249 | 53.453 | false | **DID NOT WAIT** |
| fg-fg | false | false | 53.372 | 52.293 | true | **WAITED** |
| bg-bg | true | true | 5.496 | 52.525 | false | **DID NOT WAIT** |
| bg-fg | true | false | 53.316 | 52.153 | true | **WAITED** |
| main-busy | false | true | 5.666 | 52.308 | false | **DID NOT WAIT** |
| main-close | false | true | 5.538 | 52.31 | false | **DID NOT WAIT** |
| main-string | false | true | 5.811 | 52.573 | false | **DID NOT WAIT** |
| 1shot-fg-fg | false | false | 53.413 | 52.157 | true | **WAITED** |
| 1shot-fg-bg | false | true | 5.343 | 52.298 | false | **DID NOT WAIT** |
| 1shot-bg-fg | true | false | 53.701 | 52.552 | true | **WAITED** |
| 1shot-bg-bg | true | true | 5.765 | 52.444 | false | **DID NOT WAIT** |

## Main conversation behaviour

| scenario | input | main's Agent call returned (s) | worker | main results (time, turn origin, text) | worker token reached main in | query iterator ended (s) |
|---|---|---|---|---|---|---|
| fg-bg | open |6.277 | completed @ 53.46s | 7.452s prompt: `MAIN_TURN_DONE: NONE`<br>54.803s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=112742877` | task-notification | 65.116 |
| fg-fg | open |53.38 | completed @ 52.314s | 54.565s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=193328159` | prompt | 65.652 |
| bg-bg | open |2.584 | completed @ 52.53s | 3.839s prompt: `MAIN_TURN_DONE: NONE`<br>6.727s task-notification: `MAIN_GOT_NOTIFICATION: launcher NONE`<br>53.94s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=980203144` | task-notification | 64.63 |
| bg-fg | open |2.729 | completed @ 52.177s | 3.852s prompt: `MAIN_TURN_DONE: NONE`<br>54.685s task-notification: `MAIN_GOT_NOTIFICATION: launcher WORKER_TOKEN=647514112` | task-notification | 65.653 |
| main-busy | open + busy main |5.696 | completed @ 52.313s | 82.54s prompt: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=269097694` | prompt | 93.838 |
| main-close | close |5.583 | completed @ 52.316s | 6.725s prompt: `MAIN_TURN_DONE: NONE`<br>53.541s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=443932990` | task-notification | 53.882 |
| main-string | string |5.838 | completed @ 52.58s | 7.209s prompt: `MAIN_TURN_DONE: NONE`<br>53.808s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=707601658` | task-notification | 54.125 |
| direct-fg | direct worker fg |50.469 | completed @ 50.465s | 51.441s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=255315074` | prompt | 62.641 |
| direct-bg | direct worker bg |2.543 | completed @ 50.403s | 3.663s prompt: `MAIN_TURN_DONE: NONE`<br>51.382s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=503692086` | task-notification | 61.74 |
| 1shot-direct-fg | direct worker fg |50.827 | completed @ 50.823s | 51.774s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=68462047` | prompt | 52.231 |
| 1shot-direct-bg | direct worker bg |2.253 | completed @ 50.195s | 3.269s prompt: `MAIN_TURN_DONE: NONE`<br>51.103s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=558523957` | task-notification | 51.424 |
| 1shot-fg-fg | string |53.421 | completed @ 52.18s | 54.373s prompt: `MAIN_TURN_DONE: WORKER_TOKEN=826444495` | prompt | 54.727 |
| 1shot-fg-bg | string |5.37 | completed @ 52.305s | 6.426s prompt: `MAIN_TURN_DONE: NONE`<br>53.72s task-notification: `MAIN_GOT_NOTIFICATION: slow worker WORKER_TOKEN=790037297` | task-notification | 54.041 |
| 1shot-bg-fg | string |2.722 | completed @ 52.575s | 4.006s prompt: `MAIN_TURN_DONE: NONE`<br>54.97s task-notification: `MAIN_GOT_NOTIFICATION: launcher WORKER_TOKEN=977677166` | task-notification | 55.376 |
| 1shot-bg-bg | string |2.728 | completed @ 52.449s | 3.927s prompt: `MAIN_TURN_DONE: NONE`<br>6.977s task-notification: `MAIN_GOT_NOTIFICATION: launcher NONE`<br>53.817s task-notification: `MAIN_GOT_NOTIFICATION: slow-worker WORKER_TOKEN=739393303` | task-notification | 54.142 |
