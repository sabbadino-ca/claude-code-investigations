> **Run** `results/2026-10-23-1712-reference-files-cli` · `reference-files-cli.ts` `anchor-dir-naming anchor-nodir-naming` · started 2026-10-23 17:12
> **Claude Code** 2.1.309 via installed `claude -p` · **git** b35cc40 (uncommitted changes)

## Reference files read on demand by a subagent: headless `claude -p`

| scenario | agent | subagent tool calls | direct read, no scan | expected read | unexpected read | preloaded |
|---|---|---|---|---|---|---|
| anchor-dir-naming | architect-anchor-dir | `Glob {"pattern":"**/architect-anchor-dir/references/naming.md"}`<br>`Read {"file_path":"C:\\Users\\spesce\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\agents\\architect-anchor-dir\\references\\naming.md"}` | false | true | none | no |
| anchor-nodir-naming | architect-anchor-nodir | `Glob {"pattern":"**/references/naming.md"}`<br>`Read {"file_path":"C:\\Users\\spesce\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\agents\\architect-anchor-nodir\\references\\naming.md"}` | false | true | none | no |
