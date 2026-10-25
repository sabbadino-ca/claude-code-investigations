> **Run** `results/2026-10-25-1537-skill-awareness-cli` · `skill-awareness-cli.ts` `main-list inherit-list skilltool-list restricted-list inherit-nouser-list skilltool-nouser-list restricted-nouser-list` · started 2026-10-25 15:37
> **Claude Code** 2.1.310 via installed `claude -p` · **git** 9a3d71f (uncommitted changes)

## Skill awareness of subagents: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| main-list | (main answers itself) | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| inherit-list | probe-inherit | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| restricted-list | probe-restricted | none | none | none | none | none |
| skilltool-list | probe-skilltool | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| inherit-nouser-list | probe-inherit-nouser | alpha, beta, gamma, nouser | nouser | alpha, beta, gamma, nouser | nouser | none |
| skilltool-nouser-list | probe-skilltool-nouser | alpha, beta, gamma, nouser | nouser | alpha, beta, gamma, nouser | nouser | none |
| restricted-nouser-list | probe-restricted-nouser | none | nouser | none | nouser | none |
