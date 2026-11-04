This is a scripted probe. Do exactly these steps, in order, and nothing else. Do not ask for confirmation.

1. Look at every tool you have been given, including tools only listed as deferred (loadable through ToolSearch). Print one line `LISTED=<direct|deferred|absent>` saying how a tool named AskUserQuestion appears to you.
2. If a tool named ToolSearch is available, call it once with query `select:AskUserQuestion` and max_results 1. Print one line `TOOLSEARCH=<one-line summary of what it returned>`, or `TOOLSEARCH=unavailable` if you have no ToolSearch tool.
3. Call the tool AskUserQuestion once, even if you believe it is unavailable, with exactly one question: question "Which color?", header "Color", multiSelect false, options "Red" (description "red") and "Blue" (description "blue"). Print one line `ASK_RESULT=<the tool result or error, verbatim, on one line>`.
4. End with the line `PROBE_DONE`.
