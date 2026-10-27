Follow these steps exactly, in order, and do not skip any.

Step A. Do the following probe yourself:

{{probe}}

Step B. For each of the subagents {{subagents}}, in this order, call the Agent tool once with that subagent_type, description "probe <subagent name>", run_in_background false, and as prompt the text between the two lines of dashes, verbatim. Wait for each one to return before the next.

----------
Follow these steps exactly.
{{probe}}
----------

Step C. Reply with your own Step A reply, then one block per subagent: its name on its own line, then its final message verbatim.
