> **Run** `results/2026-10-13-1751-resume` · `resume.ts` (args not recorded) · started 2026-10-13 17:51 (approx.)
> **Claude Code** 2.1.296 via Agent SDK 0.3.296; 2.1.296 via installed `claude -p` · **git** not recorded

## Resume a completed sync subagent with SendMessage: sync or async for main?

| run | env | tool sequence | 1. first spawn sync | 2. SendMessage to same id | 3. same instance (nonce) | **resume for main** | SendMessage blocked (s) | resumed is_backgrounded flag | notification turns | results (origin@s) | 4. final has nonce |
|---|---|---|---|---|---|---|---|---|---|---|---|
| resume-default-cli-run1 | default | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **ASYNC** | 0.21 | true | 1 | prompt@37.48, task-notification@37.481 | PASS |
| resume-default-sdk-run1 | default | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **ASYNC** | 0.03 | true | 1 | prompt@15.647, task-notification@37.331 | PASS |
| resume-forced-cli-run1 | forced | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **SYNC** | 23.24 | true | 0 | prompt@38.046 | PASS |
| resume-forced-sdk-run1 | forced | Agent → ToolSearch → SendMessage | PASS | PASS | PASS | **SYNC** | 22.65 | true | 0 | prompt@36.228 | PASS |
