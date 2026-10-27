> **Run** `results/2026-10-27-0931-skill-awareness-cli` · `skill-awareness-cli.ts` `main-list main-invoke` · started 2026-10-27 09:31
> **Claude Code** 2.1.311 via installed `claude -p` · **git** 1ed195f

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| main-list | (main answers itself) | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| main-invoke | (main answers itself) | alpha, beta, gamma, nouser | none | none | beta | none |
