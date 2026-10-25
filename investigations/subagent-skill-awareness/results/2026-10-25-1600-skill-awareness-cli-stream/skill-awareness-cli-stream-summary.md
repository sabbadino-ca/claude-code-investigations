> **Run** `results/2026-10-25-1600-skill-awareness-cli-stream` · `skill-awareness-cli-stream.ts` (no args) · started 2026-10-25 16:00
> **Claude Code** 2.1.310 via installed `claude -p` · **git** 5268a59 (uncommitted changes)

## Skill filter, headless streaming input (`claude -p --input-format stream-json`)

Marks: alpha, beta, gamma = model-invocable skills; hidden = `disable-model-invocation: true`.

| scenario | agent | descriptions in context (before 1st assistant entry) | bodies in context | descriptions in answer | bodies in answer | Skill tool calls (body marks returned) |
|---|---|---|---|---|---|---|
| nofilter-main-list | (main answers itself) | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| filter-main-list | (main answers itself) | beta | none | beta | none | none |
| filter-inherit-list | probe-inherit | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| filter-skilltool-list | probe-skilltool | alpha, beta, gamma, nouser | none | alpha, beta, gamma, nouser | none | none |
| filter-restricted-list | probe-restricted | none | none | none | none | none |
| filter-preload-list | probe-preload | none | alpha | none | alpha | none |
| filter-hidden-preload-list | probe-restricted-nouser | none | nouser | none | nouser | none |
