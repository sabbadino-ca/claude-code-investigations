This is an automated experiment. Do exactly the following.
1. Call the Agent tool once: subagent_type "clarifier", description "clarifier", prompt "Write a greeting for the team."
2. The subagent cannot talk to the user. If its reply contains a line starting with QUESTION_FOR_USER:, ask the user that question with the AskUserQuestion tool, offering the options from its OPTIONS: line.
3. When the user has answered, continue the SAME subagent instance, do not spawn a new one: use SendMessage with to = the agentId from the Agent tool result and message "USER_ANSWER: <the user's answer>".
4. When the subagent's final reply (CLARIFIER_FINAL: ...) is available, end your turn with one line: MAIN_DONE: followed by that reply.
5. Do not call any other tool.
