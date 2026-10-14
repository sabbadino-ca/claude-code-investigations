> **Run** `results/2026-10-13-1030-parallel-cli` · `parallel-cli.ts` (args not recorded) · started 2026-10-13 10:30 (approx.)
> **Claude Code** 2.1.296 via installed `claude -p` · **git** not recorded

## Parallel foreground fan-out via `claude -p` (5 workers, prompt-steered, no SDK, no input-changing hooks)

| run | 1. one message with N Agent calls | 2. all foreground | 3. main got all tokens before answering | 4. parallel (start spread / wall / sum of durations, s) | main answered (s) | process exited (s) |
|---|---|---|---|---|---|---|
| parallel-cli-5-run1 | PASS (5) | PASS | PASS (5/5) | PASS (1.237 / 48.628 / 239.844) | 53.724 | 54.121 |
| parallel-cli-5-run2 | PASS (5) | PASS | PASS (5/5) | PASS (1.437 / 50.218 / 244.919) | 55.096 | 55.502 |
