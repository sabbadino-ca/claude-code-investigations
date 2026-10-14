# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo is a lab for empirically testing Claude Code behaviour claims (usually sentences from the docs at code.claude.com) in three run modes:

- **Agent SDK**: drivers that call `query()` from `@anthropic-ai/claude-agent-sdk`. The SDK runs the Claude Code version it bundles, not the installed one.
- **Headless**: drivers that spawn the installed `~/.local/bin/claude.exe -p --output-format stream-json --verbose`.
- **Interactive terminal**: the user runs `node lib/claude-home.mjs investigations/<folder>`. There is no driver for this mode, so the evidence is the session `.jsonl` plus what the user reports.

Before designing a new investigation, read the `REPORT.html` of the existing ones under `investigations/`.

## Layout: one self-contained folder per investigation, a shared harness

- **`investigations/<slug>/`**: one investigation. The folder name has no date. It holds:
  - **Fixture**:
    - `.claude/`: agents, skills and settings.
    - An optional `CLAUDE.md`.
    - `prompts/<name>.md`: the drivers' main-prompt templates.
  - **Drivers** (`*.ts`) and their helper scripts, for example the fake user's hook and MCP server.
  - **`results/<YYYY-MM-DD>-<HHMM>-<driver>/`**: one folder per driver run.
    - Driver output, all keyed by run name: `<name>.jsonl` timeline (ms from start), `<name>.hooks.jsonl` (CLI hook log), `<name>.verdict.json` (computed checks).
    - The driver's `*summary.md`, headed by the run's driver, args, start time, the Claude Code versions that actually ran, and the git commit.
    - `run.json`: the args, the versions, the git commit with a dirty flag, and sha256 hashes of every `lib/` and investigation file. `versions.claude_code` holds only what actually ran, taken from each session's `system:init`: `sdk` for the version the Agent SDK bundles (then `agent_sdk` too), `cli` for the installed `claude`.
  - **`.claude-home/`**: the `CLAUDE_CONFIG_DIR` of every run in the folder. Session logs land in `.claude-home/projects/sessions/<sessionId>.jsonl`, with subagent transcripts in `<sessionId>/subagents/agent-<id>.jsonl`. Only `projects/` (the session logs) is committed. Everything else Claude Code writes there is gitignored: the copied login (`.credentials.json`), account and machine state (`.claude.json` and its `backups/`), and caches. It is recreated on every run.
  - **`REPORT.html`**: the report.
- **`lib/`**: only the harness that every investigation shares: `claude-home.mjs` and `hook-log.mjs`. Fixes to it should reach every investigation.
- **Root `package.json`**: pins the Agent SDK and `tsx` versions.
- **`investigations/_template/`**: the `REPORT.html` skeleton.

Each investigation keeps its own full copy of every fixture file and driver it needs, even when another investigation has an identical one. Never reference files across investigation folders. To start from an existing driver, copy it and adapt the copy, so the older investigation still reruns unchanged.

Never put agents, skills, rules or settings in the repo root's `.claude/`. Project subagents are discovered by walking up from the cwd to the repository root, so anything there would leak into every investigation.

## `lib/claude-home.mjs`

Every driver imports it (`../../lib/claude-home.mjs`) before anything else. The investigation folder is the driver's own folder, so a driver must sit directly in `investigations/<slug>/`. On import, the harness changes the working directory to that folder. As a result, `process.cwd()` and `settingSources: ["project"]` / `--setting-sources project` resolve to the investigation's fixture.

It exports:

- **`beginRun()`**: the first call in every driver's `main()`.
  - It syncs credentials: whichever of `~/.claude/.credentials.json` and `.claude-home/.credentials.json` has the later `claudeAiOauth.expiresAt` is copied over the other, at start and again at exit (Ctrl+C included). A token refreshed during a run is therefore copied back home.
  - It creates `RESULTS_DIR` and writes its `run.json`.
- **`recordClaudeVersion(via, version)`**: call it with each session's `system:init` `claude_code_version`, with `via` set to `"sdk"` or `"cli"`.
- **`writeSummary(file, markdown)`**: writes a summary into `RESULTS_DIR` under the run header.
- **`loadPrompt(name, vars)`** renders `prompts/<name>.md`.
  - `{{var}}` is replaced by its value.
  - `{{#var}}…{{/var}}` is kept only when `var` is truthy, and `{{^var}}…{{/var}}` only when it is falsy.
  - A missing template or value throws.
- **`ISOLATION_ENV`**: `CLAUDE_CONFIG_DIR` plus `CLAUDE_CODE_PROJECT_DIR_NAME=sessions`. Spread it into the env of every run. Drivers' `cleanEnv()` strips inherited `CLAUDE*` vars, so it has to be added back explicitly.
- **`ISOLATION_SETTINGS`**: pass it as the SDK `settings` option, or merge it into the CLI `--settings` JSON.
  - `claudeMdExcludes` covers the `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` and `.claude/rules` files of every ancestor directory. Without it, this file loads into every run; that was verified.
  - `cleanupPeriodDays: 36500` keeps the 30-day retention sweep from deleting session logs.
- **Paths**: `RESULTS_DIR`, `SESSIONS_DIR`, `INVESTIGATION_DIR`, and `LIB_DIR` (for `hook-log.mjs`).
- **`latestRunDir(driver)`**: the newest run folder of another driver in the same investigation.

Bundled skills, built-in plugins and claude.ai MCP connectors still appear in every run. They come from the account and the CLI version, not from the config dir.

## Commands

From the repo root:

```bash
npm install
node lib/claude-home.mjs investigations/<slug> --check        # isolation smoke test: one cheap Haiku -p run
npx tsx investigations/<slug>/<driver>.ts [args]              # each REPORT.html lists its drivers and args
node lib/claude-home.mjs investigations/<slug> [claude args]  # interactive session, isolated
```

`--check` prints the cwd, the transcript path, and the instruction files and agents loaded. It exits 1 if an instruction file came from outside the folder.

There is no build, lint or test suite. Each run makes real model calls, takes minutes and costs money.

## Driver conventions

- **Deterministic fixture agents**: each has a minimal tool set and emits an unguessable marker (`WORKER_TOKEN=<n>`, `NONCE=<n>`). Behaviour you observe then comes from the harness, not from the model's choices, and if a marker appears somewhere, data really flowed there.
- **The main prompt** is a strict step-by-step script, read from `prompts/`. Drivers observe and never steer.
- **SDK drivers** record with in-process hooks and stream events.
- **CLI drivers** write `<name>.settings.json` into the run folder, whose command hooks call `lib/hook-log.mjs`, and parse the stdout stream-json.
- **Permissions**: `allowedTools: Agent, Bash` (plus whatever the test needs) with `permissionMode: dontAsk`.
- **Fake user** (for `AskUserQuestion`): in the SDK, a `canUseTool` callback. In `-p`, a PreToolUse hook plus a `--permission-prompt-tool` MCP server.

## Workflow

Every investigation ends with a human-readable `REPORT.html` in its folder root: what was investigated, how, and what came out. The `*summary.md` files in `results/` are the raw per-run output that the report is built from; they don't replace it.

1. **Frame the question.** The user asks to investigate something.
   - Restate it as a testable claim: the doc sentence and its URL, if there is one.
   - Say what outcome would confirm or refute it, and which run modes are needed (Agent SDK, `claude -p`, interactive).
   - Agree on this with the user before building anything.
2. **Look for an existing investigation.** Search `investigations/*/REPORT.html` for the same or an overlapping question, then tell the user what you found: the question it answered, its latest runs, and the Claude Code / SDK versions they ran on. The user decides:
   - **Rerun as is**, for example to check a new Claude Code or SDK version.
     - The installed CLI is whatever is installed.
     - The SDK version is pinned in the root `package.json`, which every investigation shares. Bumping it affects all investigations, so say so.
   - **Extend it**, with new scenarios or fixture changes. If a fixture file or driver that already produced results has to change, say so first. Then either record in `REPORT.html` which runs used which version (the `run.json` hashes show it), or propose a new folder.
   - **Start a new investigation.**
3. **New investigation:**
   - Create `investigations/<slug>/` and copy `investigations/_template/REPORT.html` into it. Fill in the question and the setup now, before any run.
   - Build the whole fixture and its drivers there: `.claude/` agents and skills, `CLAUDE.md`, settings, `prompts/` and `*.ts`. Copy files from other investigations even if they are identical.
   - Run `--check`.
4. **Run.**
   - Before a long or costly batch, say roughly how long it will take and what it will cost.
   - Interactive mode can't be driven: give the user the exact `node lib/claude-home.mjs investigations/<slug>` command and the steps to perform, then read the session logs it produces.
5. **Report.**
   - Read the run folders' `verdict.json` and summaries, not your memory, and present the outcome to the user.
   - Then write or update `REPORT.html` in the investigation root, never in `results/`.
   - On a rerun:
     - Add the new run folders to the runs table.
     - Say whether each result was confirmed or changed.
     - If something changed, explain the change and update the conclusion, naming the versions before and after.

Write `REPORT.html` directly as HTML, starting from `investigations/_template/REPORT.html`:
- Keep its inline `<style>`, which has light and dark themes, so every report looks the same.
- Keep the file self-contained: no scripts and no external CSS, fonts or images.
- Links are relative, to the fixture files, drivers and run folders' summaries.
- Wrap each table in `<div class="table">` so it scrolls on narrow screens.

Its sections:
- **Question**: the claim and its doc URL.
- **Setup**: the topology, each fixture file and what it proves, the drivers, and the env vars.
- **Run**: the exact commands.
- **Runs**: one row per run folder, with driver, Claude Code / SDK versions (from `run.json`) and outcome.
- **Result**: per scenario, with key timings and anything surprising.
- **Conclusion**: the answer to the question.
- **Not tested**: what the runs don't cover.
