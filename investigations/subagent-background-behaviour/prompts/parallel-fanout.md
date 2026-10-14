# Parallel fan-out instruction (reusable)

## Standing rule (for CLAUDE.md or any agent's instructions)

A conditional rule that sits next to the task- or workspace-specific instructions and only applies when the
agent decides to delegate. It works for the main agent and for any subagent that has the Agent tool.

```text
## Spawning subagents
If you need more than one subagent and their subtasks do not depend on each other's results:
- Spawn them all in the same response: one Agent tool call per subagent, all in that single response.
  Do not spawn them one response at a time.
- Run them in the foreground (run_in_background: false, when the option exists) if you need their results
  before you continue. Calls made in the same response still run in parallel.
- Give each subagent a self-contained prompt: it cannot see this conversation.
- Wait for all of their results before you continue, then combine them.
If a subtask needs another subtask's output, spawn those one after the other instead.
```

## Explicit fan-out block

Drop this block into any agent's instructions: the main prompt, a system prompt, or the body of a
`.claude/agents/*.md` subagent that is allowed to spawn its own subagents. Replace the `{{…}}` placeholders.

```text
## Parallel delegation
When you delegate the subtasks below, run them in parallel and wait for all of them:
1. Spawn all {{N}} subagents in ONE single response: that one response contains {{N}} Agent tool calls and
   nothing else. Do not send them one per response, and do not wait for one to finish before calling the next.
2. Run every call in the foreground: if the Agent tool offers run_in_background, set it to false.
   You need every result before you continue.
3. One call per subtask:
{{SUBTASKS}}
   Give each call its own short description (for example "<task name> <k>"), and put everything the
   subagent needs into its prompt: it does not see this conversation.
4. Continue only after all {{N}} results are back. If a call fails, say which one and why; do not retry it
   unless told to.
5. Then {{WHAT_TO_DO_WITH_THE_RESULTS}}.
```

## Filled-in example (what the 5-worker test does)

```text
## Parallel delegation
When you delegate the subtasks below, run them in parallel and wait for all of them:
1. Spawn all 5 subagents in ONE single response: that one response contains 5 Agent tool calls and
   nothing else. Do not send them one per response, and do not wait for one to finish before calling the next.
2. Run every call in the foreground: if the Agent tool offers run_in_background, set it to false.
   You need every result before you continue.
3. One call per subtask:
   - k = 1..5: subagent_type "slow-worker", prompt "Run your task."
   Give each call its own short description (for example "slow worker <k>"), and put everything the
   subagent needs into its prompt: it does not see this conversation.
4. Continue only after all 5 results are back. If a call fails, say which one and why; do not retry it
   unless told to.
5. Then end your turn with one line: MAIN_TURN_DONE: followed by every WORKER_TOKEN=... line you received.
```

## Using it in a subagent that spawns its own subagents

- The subagent needs the `Agent` tool: list it in `tools`, or omit `tools` to inherit everything.
- It must be above the depth limit. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` defaults to 3 layers; at the limit
  Claude Code removes `Agent` and the subagent does the work itself.
- Foreground is the default only when Claude asks for it. To guarantee it for the whole session, set
  `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (and `CLAUDE_CODE_FORK_SUBAGENT=0`). In that case step 2 is
  redundant but harmless.
- The total number of subagents running at once counts against `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
  (default 20) across every layer.
