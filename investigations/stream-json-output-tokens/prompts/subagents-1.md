Follow these steps exactly.

1. In a single response, call the Agent tool twice in parallel, both with subagent_type "worker" and run_in_background false:
   - description "worker A", prompt "Number: 61840273. Topic: the history of the compass."
   - description "worker B", prompt "Number: 29537106. Topic: the history of the sextant."
   Use no other tool.
2. When both return, reply with one short paragraph that names both WORKER_TOKEN values.
