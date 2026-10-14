This is an automated experiment. Do exactly the following.
1. Call the Agent tool once: subagent_type "resumable", description "resumable", prompt "Start.", run_in_background: false.
2. When it has returned, continue that SAME subagent instance, do not spawn a new one: use SendMessage with to = the agentId from the Agent tool result and message "CONTINUE".
3. When you have the subagent's RESUMED_FINAL reply, end your turn with one line: MAIN_DONE: followed by that reply.
4. Do not call any other tool.
