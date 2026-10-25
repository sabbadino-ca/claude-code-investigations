> **Run** `results/2026-10-25-1512-skill-awareness-cli` · `skill-awareness-cli.ts` (no args) · started 2026-10-25 15:12
> **Claude Code** 2.1.310 via installed `claude -p` · **git** 2d68b74 (uncommitted changes)

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| main-list | (main answers itself) | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| inherit-list | probe-inherit | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| restricted-list | probe-restricted | none | none | none | none | none |
| skilltool-list | probe-skilltool | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| preload-list | probe-preload | none | alpha | none | alpha | none |
| inherit-invoke | probe-inherit | alpha, beta, gamma | none | none | beta | none |
| skilltool-invoke | probe-skilltool | alpha, beta, gamma | none | none | beta | none |
| restricted-invoke | probe-restricted | none | none | none | none | none |
