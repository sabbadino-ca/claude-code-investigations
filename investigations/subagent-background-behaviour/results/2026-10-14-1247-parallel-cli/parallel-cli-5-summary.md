> **Run** `results/2026-10-14-1247-parallel-cli` · `parallel-cli.ts` `2 5` · started 2026-10-14 12:47
> **Claude Code** 2.1.299 via installed `claude -p` · **git** 3004f73 (uncommitted changes)

## Parallel foreground fan-out via `claude -p` (5 workers, prompt-steered, no SDK, no input-changing hooks)

| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | process exited (s) |
|---|---|---|---|---|---|---|
| parallel-cli-5-run1 | PASS (5) | PASS | PASS (5/5) | PASS (1.374 / 48.964 / 241.348) | 53.752 | 54.16 |
| parallel-cli-5-run2 | PASS (5) | PASS | PASS (5/5) | PASS (1.536 / 49.256 / 242.402) | 53.738 | 54.134 |
