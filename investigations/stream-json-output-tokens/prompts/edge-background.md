Follow these steps exactly.

1. In a single response, call the Agent tool twice in parallel, both with subagent_type "worker-haiku" and run_in_background true:
   - description "bg worker A", prompt "Number: 15938264. Topic: the history of the abacus."
   - description "bg worker B", prompt "Number: 82614039. Topic: the history of the slide rule."
   Use no other tool.
2. Wait until both workers have reported back, then reply with one short paragraph that names both WORKER_TOKEN values.
