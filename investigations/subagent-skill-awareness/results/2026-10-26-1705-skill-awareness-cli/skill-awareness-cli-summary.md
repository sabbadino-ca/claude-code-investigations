> **Run** `results/2026-10-26-1705-skill-awareness-cli` · `skill-awareness-cli.ts` `preload-list preload-invoke disallow-list disallow-invoke disallow-preload-list disallow-preload-invoke` · started 2026-10-26 17:05
> **Claude Code** 2.1.310 via installed `claude -p` · **git** 6135130 (uncommitted changes)

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| preload-list | probe-preload | none | alpha | none | alpha | none |
| preload-invoke | probe-preload | none | alpha | none | alpha | none |
| disallow-list | probe-disallow | none | none | none | none | none |
| disallow-invoke | probe-disallow | none | none | none | none | none |
| disallow-preload-list | probe-disallow-preload | none | alpha | none | alpha | none |
| disallow-preload-invoke | probe-disallow-preload | none | alpha | none | none | none |
