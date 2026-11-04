> **Run** `results/2026-11-04-1117-colon-cli` · `colon-cli.ts` (no args) · started 2026-11-04 11:17
> **Claude Code** 2.1.318 via installed `claude -p` · **git** 76679ce (uncommitted changes)

## Unquoted `: ` inside a frontmatter description: headless `claude -p`

| item | in system:init | HEAD (before colon) | TAIL (after colon) | tools suffix | listing line(s) |
|---|---|---|---|---|---|
| colon-agent | true | true | true | (Tools: Read) | `- colon-agent: Test-harness agent colon-agent HEAD=48213907 never needed note: TAIL=73950264 for real work. (Tools: Read)` |
| control-agent | true | true | true | (Tools: Read) | `- control-agent: Test-harness agent control-agent HEAD=20571836 never needed note TAIL=95316408 for real work. (Tools: Read)` |
| colon-skill | true | true | true | n/a | `- colon-skill: Test-harness skill colon-skill HEAD=82694150 never needed note: TAIL=14063972 for real work.` |
| control-skill | true | true | true | n/a | `- control-skill: Test-harness skill control-skill HEAD=69305284 never needed note TAIL=28457916 for real work.` |

### Debug-log lines matching the fixture or frontmatter/yaml (12)

```
2026-11-04T10:17:37.754Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.json
2026-11-04T10:17:37.939Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\settings.json
2026-11-04T10:17:37.953Z [DEBUG] Loading skills from: managed=C:\Program Files\ClaudeCode\.claude\skills, user=D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\skills, project=[D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\skills]
2026-11-04T10:17:38.016Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.local.json
2026-11-04T10:17:38.274Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.json
2026-11-04T10:17:38.276Z [DEBUG] Remote settings: Saved to D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\remote-settings.json
2026-11-04T10:17:38.279Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.json
2026-11-04T10:17:38.281Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\settings.json
2026-11-04T10:17:38.430Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.json
2026-11-04T10:17:38.436Z [DEBUG] Broken symlink or missing file encountered for settings.json at path: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\settings.json
2026-11-04T10:17:38.531Z [DEBUG] Watching for changes in skill/command directories: D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\skills, D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\agents...
2026-11-04T10:17:38.536Z [DEBUG] Watching for changes in setting files D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude-home\settings.json, D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.json, D:\repos\github-ca\claude-code-investigations\investigations\frontmatter-colon-in-description\.claude\settings.local.json...
```
