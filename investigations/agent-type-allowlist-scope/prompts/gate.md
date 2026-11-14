Follow these steps exactly, in order, and do not skip any.

Step 1. Call the Agent tool once with subagent_type "allowed-worker", description "spawn allowed-worker", run_in_background false, and prompt "Reply with your token." Wait for it to return.

Step 2. Call the Agent tool once with subagent_type "blocked-worker", description "spawn blocked-worker", run_in_background false, and prompt "Reply with your token." Make this call even if you expect it to fail. Do not substitute another subagent type and do not retry.

Step 3. Reply with exactly two lines:
ALLOWED: <the result of step 1 verbatim, or the exact error text>
BLOCKED: <the result of step 2 verbatim, or the exact error text>
