> **Run** `results/2026-10-25-1530-skill-awareness-sdk` · `skill-awareness-sdk.ts` `inherit-hidden-list skilltool-hidden-list restricted-hidden-list` · started 2026-10-25 15:30
> **Claude Code** 2.1.310 via Agent SDK 0.3.310 · **git** b65e00c (uncommitted changes)

## Skill awareness of subagents: Agent SDK

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| inherit-hidden-list | probe-inherit-hidden | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| skilltool-hidden-list | probe-skilltool-hidden | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| restricted-hidden-list | probe-restricted-hidden | none | none | none | none | none |
