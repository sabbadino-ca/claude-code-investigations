> **Run** `results/2026-10-13-1024-parallel` · `parallel.ts` (args not recorded) · started 2026-10-13 10:24 (approx.)
> **Claude Code** 2.1.296 via Agent SDK 0.3.296 · **git** not recorded

## Parallel foreground fan-out (5 workers, prompt-steered, no input-changing hooks)

| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | session ended (s) |
|---|---|---|---|---|---|---|
| parallel-5-run1 | PASS (5) | PASS | PASS (5/5) | PASS (1.449 / 49.019 / 240.598) | 55.547 | 55.994 |
| parallel-5-run2 | PASS (5) | PASS | PASS (5/5) | PASS (1.457 / 54.582 / 247.058) | 58.204 | 58.634 |
