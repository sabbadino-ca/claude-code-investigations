> **Run** `results/2026-11-03-1433-availability` · `availability.ts` `all 2` · started 2026-11-03 14:33
> **Claude Code** 2.1.317 via installed `claude -p` · **git** 76679ce (uncommitted changes)

## AskUserQuestion availability in `claude -p`

| run | flags | exit | init permissionMode | init tools has AskUserQuestion | ToolSearch select:AskUserQuestion → | AskUserQuestion call → | hook events (AskUserQuestion) | permission_denials | other session mentions | model LISTED= |
|---|---|---|---|---|---|---|---|---|---|---|
| base-1 | `(none)` | 0 | default | false | No matching deferred tools found | ERROR: <tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion is disabled for this session, in subagents as well as here.</tool_use_err | none | [] | 2 | - |
| base-2 | `(none)` | 0 | default | false | No matching deferred tools found | not called | none | [] | 2 | deferred`, but the tool was not in my tool list at all, and ToolSearch confirmed that. The correct value is `LISTED=absent`. |
| mode-dontAsk-1 | `--permission-mode dontAsk` | 0 | dontAsk | false | No matching deferred tools found | ERROR: <tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion is disabled for this session, in subagents as well as here.</tool_use_err | none | [] | 2 | - |
| mode-dontAsk-2 | `--permission-mode dontAsk` | 0 | dontAsk | false | No matching deferred tools found | not called | none | [] | 2 | deferred, was wrong. Neither the direct list nor the deferred list contains AskUserQuestion, so the correct value is LISTED=absent. |
| mode-none-1 | `--permission-mode none` | 1 | - | - | not called | not called | none | null | 0 | - |
| mode-none-2 | `--permission-mode none` | 1 | - | - | not called | not called | none | null | 0 | - |
| prompts-none-1 | `--permission-prompts none` | 0 | default | false | No matching deferred tools found | ERROR: <tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion is disabled for this session, in subagents as well as here.</tool_use_err | none | [] | 2 | - |
| prompts-none-2 | `--permission-prompts none` | 0 | default | false | No matching deferred tools found | ERROR: <tool_use_error>Error: No such tool available: AskUserQuestion. AskUserQuestion is disabled for this session, in subagents as well as here.</tool_use_err | none | [] | 2 | - |

- mode-none-1 stderr: `error: option '--permission-mode <mode>' argument 'none' is invalid. Allowed choices are acceptEdits, auto, bypassPermissions, manual, dontAsk, plan.`
- mode-none-2 stderr: `error: option '--permission-mode <mode>' argument 'none' is invalid. Allowed choices are acceptEdits, auto, bypassPermissions, manual, dontAsk, plan.`
