> **Run** `results/2026-10-28-1121-reference-files-skill-cli` · `reference-files-skill-cli.ts` (no args) · started 2026-10-28 11:21
> **Claude Code** 2.1.312 via installed `claude -p` · **git** da188be (uncommitted changes)

## Reference files named in a preloaded skill, read by a subagent: headless `claude -p`

| scenario | agent | skill body preloaded | base dir line | listing | subagent tool calls | direct read, no scan | expected read | unexpected read | NONCE preloaded |
|---|---|---|---|---|---|---|---|---|---|
| skill-rel | architect-skill | true | `Base directory for this skill: D:\repos\github-ca\claude-code-investigations\investigations\subagent-reference-files\.claude\skills\arch-rules` | none | `Read {"file_path":"D:\\repos\\github-ca\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\skills\\arch-rules\\references\\naming.md"}` | true | true | none | no |
| skill-rooted | architect-skill-rooted | true | `Base directory for this skill: D:\repos\github-ca\claude-code-investigations\investigations\subagent-reference-files\.claude\skills\arch-rules-rooted` | none | `Read {"file_path":"D:\\repos\\github-ca\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\skills\\arch-rules-rooted\\references\\naming.md"}` | true | true | none | no |
| skill-two | architect-skill | true | `Base directory for this skill: D:\repos\github-ca\claude-code-investigations\investigations\subagent-reference-files\.claude\skills\arch-rules` | none | `Read {"file_path":"D:\\repos\\github-ca\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\skills\\arch-rules\\references\\naming.md"}`<br>`Read {"file_path":"D:\\repos\\github-ca\\claude-code-investigations\\investigations\\subagent-reference-files\\.claude\\skills\\arch-rules\\references\\layering.md"}` | true | true | none | no |
| skill-none | architect-skill | true | `Base directory for this skill: D:\repos\github-ca\claude-code-investigations\investigations\subagent-reference-files\.claude\skills\arch-rules` | none | none | n/a | true | none | no |
