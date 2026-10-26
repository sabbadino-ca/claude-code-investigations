> **Run** `results/2026-10-26-1754-skill-awareness-cli-stream` · `skill-awareness-cli-stream.ts` `list2-main-list list2-main-invoke-beta list2-main-invoke-gamma list2-inherit-list` · started 2026-10-26 17:54
> **Claude Code** 2.1.310 via installed `claude -p` · **git** 30c2a39 (uncommitted changes)

## Skill filter, headless streaming input (`claude -p --input-format stream-json`)

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| list2-main-list | (main answers itself) | alpha, beta | none | alpha, beta | none | none |
| list2-main-invoke-beta | (main answers itself) | alpha, beta | none | none | beta | none |
| list2-main-invoke-gamma | (main answers itself) | alpha, beta | none | none | none | none |
| list2-inherit-list | probe-inherit | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
