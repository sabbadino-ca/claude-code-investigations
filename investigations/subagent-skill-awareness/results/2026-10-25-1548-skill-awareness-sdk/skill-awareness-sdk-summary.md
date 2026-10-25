> **Run** `results/2026-10-25-1548-skill-awareness-sdk` · `skill-awareness-sdk.ts` `filter-main-list filter-inherit-list filter-skilltool-list filter-restricted-list filter-preload-list filter-hidden-preload-list` · started 2026-10-25 15:48
> **Claude Code** 2.1.310 via Agent SDK 0.3.310 · **git** 2d296bb (uncommitted changes)

## Skill awareness of subagents: Agent SDK

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| filter-main-list | (main answers itself) | beta | none | beta | none | none |
| filter-inherit-list | probe-inherit | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| filter-skilltool-list | probe-skilltool | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| filter-restricted-list | probe-restricted | none | none | none | none | none |
| filter-preload-list | probe-preload | none | alpha | none | alpha | none |
| filter-hidden-preload-list | probe-restricted-nouser | none | nouser | none | nouser | none |
