> **Run** `results/2026-10-25-1614-skill-awareness-cli-overrides` · `skill-awareness-cli-overrides.ts` (no args) · started 2026-10-25 16:14
> **Claude Code** 2.1.310 via installed `claude -p` · **git** f1e6271 (uncommitted changes)

## skillOverrides on skill-gamma: headless `claude -p`

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| off-main-list | (main answers itself) | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| off-inherit-list | probe-inherit | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| off-inherit-gamma-list | probe-inherit-gamma | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| off-restricted-gamma-list | probe-restricted-gamma | none | none | none | none | none |
| uio-main-list | (main answers itself) | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| uio-inherit-list | probe-inherit | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| uio-inherit-gamma-list | probe-inherit-gamma | alpha, beta, nouser | none | alpha, beta, nouser | none | none |
| uio-restricted-gamma-list | probe-restricted-gamma | none | none | none | none | none |
