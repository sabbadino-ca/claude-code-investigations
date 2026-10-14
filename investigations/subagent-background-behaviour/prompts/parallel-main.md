This is an automated parallelism experiment. Do exactly the following.
1. In ONE single assistant message, emit {{n}} Agent tool calls at once, all in that same message (do not send them one at a time, do not wait between them). Each call: subagent_type "slow-worker", description "slow worker <k>" with k = 1..{{n}}, prompt "Run your task."
2. When all {{n}} results are back, end your turn with one line: MAIN_TURN_DONE: followed by every WORKER_TOKEN=... line you received, separated by spaces.
3. Do not call any other tool and do not spawn anything else.
