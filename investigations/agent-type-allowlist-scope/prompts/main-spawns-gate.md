Follow these steps exactly, in order. Do not call any subagent type other than "gate" yourself.

Step 1. Call the Agent tool once with subagent_type "gate", description "run gate", run_in_background false, and as prompt the text between the two lines of dashes, verbatim. Wait for it to return.

----------
{{gate}}
----------

Step 2. Reply with gate's final message verbatim.
