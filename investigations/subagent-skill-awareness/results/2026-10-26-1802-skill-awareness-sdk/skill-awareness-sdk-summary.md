> **Run** `results/2026-10-26-1802-skill-awareness-sdk` · `skill-awareness-sdk.ts` `sdk2-main-list sdk2-main-invoke-beta sdk2-main-invoke-gamma sdk3-main-list sdk2-inherit-list sdk2-inherit-invoke-gamma` · started 2026-10-26 18:02
> **Claude Code** 2.1.310 via Agent SDK 0.3.310 · **git** 7079455 (uncommitted changes)

## Skill awareness of subagents: Agent SDK

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| sdk2-main-list | (main answers itself) | alpha, beta | none | alpha, beta | none | none |
| sdk2-main-invoke-beta | (main answers itself) | alpha, beta | none | none | beta | none |
| sdk2-main-invoke-gamma | (main answers itself) | alpha, beta | none | none | none | none |
| sdk2-inherit-list | probe-inherit | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| sdk2-inherit-invoke-gamma | probe-inherit | alpha, beta, gamma, nouser | none | none | gamma | none |
| sdk3-main-list | (main answers itself) | alpha, gamma, nouser | none | alpha, gamma, nouser | none | none |
