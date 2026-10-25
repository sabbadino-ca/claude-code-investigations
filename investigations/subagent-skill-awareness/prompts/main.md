Follow these steps exactly.
{{#direct}}
1. Do not use any tool. Answer the following yourself.

{{question}}
2. Reply with your answer verbatim and nothing else.
{{/direct}}
{{^direct}}
1. Call the Agent tool exactly once with subagent_type "{{agent}}", description "probe" and prompt "{{question}}". Use no other tool.
2. When it returns, reply with its final message verbatim and nothing else.
{{/direct}}
