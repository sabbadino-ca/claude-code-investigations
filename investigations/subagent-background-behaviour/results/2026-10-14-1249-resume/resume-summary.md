> **Run** `results/2026-10-14-1249-resume` · `resume.ts` `both both 1` · started 2026-10-14 12:49
> **Claude Code** 2.1.296 via Agent SDK 0.3.296; 2.1.299 via installed `claude -p` · **git** 3004f73 (uncommitted changes)

## Resume a completed sync subagent with SendMessage: sync or async for main?

| run | env | tool sequence | 1. first spawn sync | 2. SendMessage to same id | 3. same instance (nonce) | **resume for main** | SendMessage blocked (s) | resumed is_backgrounded flag | notification turns | results (origin@s) | 4. final has nonce |
|---|---|---|---|---|---|---|---|---|---|---|---|
| resume-default-cli-run1 | default | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **ASYNC** | 0.22 | true | 1 | prompt@37.445, task-notification@37.445 | PASS |
| resume-default-sdk-run1 | default | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **ASYNC** | 0.03 | true | 1 | prompt@16.035, task-notification@37.317 | PASS |
| resume-forced-cli-run1 | forced | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **SYNC** | 22.69 | true | 0 | prompt@37.415 | PASS |
| resume-forced-sdk-run1 | forced | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **SYNC** | 22.35 | true | 0 | prompt@37.274 | PASS |
