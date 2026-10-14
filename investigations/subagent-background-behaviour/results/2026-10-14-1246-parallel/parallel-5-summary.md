> **Run** `results/2026-10-14-1246-parallel` · `parallel.ts` `2 5` · started 2026-10-14 12:46
> **Claude Code** 2.1.296 via Agent SDK 0.3.296 · **git** 3004f73 (uncommitted changes)

## Parallel foreground fan-out (5 workers, prompt-steered, no input-changing hooks)

| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | session ended (s) |
|---|---|---|---|---|---|---|
| parallel-5-run1 | PASS (5) | PASS | PASS (5/5) | PASS (1.476 / 48.528 / 237.862) | 53.056 | 53.45 |
| parallel-5-run2 | PASS (5) | PASS | PASS (5/5) | PASS (1.476 / 48.461 / 238.439) | 52.054 | 52.427 |
