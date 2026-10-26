> **Run** `results/2026-10-26-1716-skill-awareness-cli` · `skill-awareness-cli.ts` `main-list main-invoke inherit-list preload-list` · started 2026-10-26 17:16
> **Claude Code** 2.1.310 via installed `claude -p` · **git** e5f51ff (uncommitted changes)

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| main-list | (main answers itself) | none | none | none | none | none |
| inherit-list | probe-inherit | none | none | none | none | none |
| preload-list | probe-preload | none | alpha | none | alpha | none |
| main-invoke | (main answers itself) | none | none | none | none | none |
