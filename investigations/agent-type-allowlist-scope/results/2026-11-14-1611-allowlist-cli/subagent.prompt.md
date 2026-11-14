Follow these steps exactly, in order. Do not call any subagent type other than "gate" yourself.

Step 1. Call the Agent tool once with subagent_type "gate", description "run gate", run_in_background false, and as prompt the text between the two lines of dashes, verbatim. Wait for it to return.

----------
Follow these steps exactly, in order, and do not skip any.

Step 1. Call the Agent tool once with subagent_type "allowed-worker", description "spawn allowed-worker", run_in_background false, and prompt "Reply with your token." Wait for it to return.

Step 2. Call the Agent tool once with subagent_type "blocked-worker", description "spawn blocked-worker", run_in_background false, and prompt "Reply with your token." Make this call even if you expect it to fail. Do not substitute another subagent type and do not retry.

Step 3. Reply with exactly two lines:
ALLOWED: <the result of step 1 verbatim, or the exact error text>
BLOCKED: <the result of step 2 verbatim, or the exact error text>
----------

Step 2. Reply with gate's final message verbatim.