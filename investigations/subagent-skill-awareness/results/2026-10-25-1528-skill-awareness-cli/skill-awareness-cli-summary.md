> **Run** `results/2026-10-25-1528-skill-awareness-cli` · `skill-awareness-cli.ts` `inherit-hidden-list skilltool-hidden-list restricted-hidden-list` · started 2026-10-25 15:28
> **Claude Code** 2.1.310 via installed `claude -p` · **git** b65e00c (uncommitted changes)

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| inherit-hidden-list | probe-inherit-hidden | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| skilltool-hidden-list | probe-skilltool-hidden | alpha, beta, gamma | none | alpha, beta, gamma | none | none |
| restricted-hidden-list | probe-restricted-hidden | none | none | none | none | none |
