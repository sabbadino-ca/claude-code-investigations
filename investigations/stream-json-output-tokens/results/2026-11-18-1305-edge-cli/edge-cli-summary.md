> **Run** `results/2026-11-18-1305-edge-cli` · `edge-cli.ts` (no args) · started 2026-11-18 13:05
> **Claude Code** 2.1.327 via installed `claude -p` · **git** 6f8e06f (uncommitted changes)

## Edge cases: claude-haiku-5-5, effort medium

Truth = stream_event message_start + message_delta per API message (main and, when forwarded, subagents). Files = every .jsonl of the session, dedup by message.id.

| run | processes (killed / exit, results) | session files | file = truth (messages with message_delta) | unfinished messages (no message_delta): in files? outputs | file messages not in stream | file msgs with null stop_reason | cost-state entries | last cost-state = files per model | Σ result.usage = truth main |
|---|---|---|---|---|---|---|---|---|---|
| background-r1 | exit 0, 3 results (success/end_turn, success/end_turn, success/end_turn) | …4e9d-b1bb-3d4b86c27c2e.jsonl: 4<br>…gent-a68b513cfa84c5d37.jsonl: 2<br>…gent-aab86e208555afbd4.jsonl: 2 | 4/4 | none | 4 | 0 | 1 | ✅ | ✅ |
| background-r2 | exit 0, 3 results (success/end_turn, success/end_turn, success/end_turn) | …4c8c-ae54-dd7efcc38d72.jsonl: 4<br>…gent-aa750a6428eb41d19.jsonl: 2<br>…gent-abef86f10348edafe.jsonl: 2 | 4/4 | none | 4 | 0 | 1 | ✅ | ✅ |
| flags-subagents-r1 | exit 0, 1 result (success/end_turn) | …414b-810c-cd046f16c08f.jsonl: 2<br>…gent-a8c6e4adf60daa80a.jsonl: 2<br>…gent-afe96d0f9fffb090b.jsonl: 2 | 2/2 | none | 4 | 0 | 1 | ✅ | ✅ |
| flags-subagents-r2 | exit 0, 1 result (success/end_turn) | …4bb7-8ca8-d47a9492c90c.jsonl: 2<br>…gent-a3fedf4347ac71868.jsonl: 2<br>…gent-aeb5021c97208fbb4.jsonl: 2 | 2/2 | none | 4 | 0 | 1 | ✅ | ✅ |
| flags-text-r1 | exit 0, 1 result (success/end_turn) | …4eb4-9d5d-c49301a76183.jsonl: 1 | 1/1 | none | 0 | 0 | 1 | ✅ | ✅ |
| flags-text-r2 | exit 0, 1 result (success/end_turn) | …4f25-bc9e-66b0f4d8d3f6.jsonl: 1 | 1/1 | none | 0 | 0 | 1 | ✅ | ✅ |
| kill-mid-text-r1 | KILLED, 0 results<br>exit 0, 1 result (success/end_turn) | …433b-a980-bf8b437ce52f.jsonl: 2 | 1/1 | p1: no (start 0) | 1 | 0 | 1 | ❌ | ✅ |
| kill-mid-text-r2 | KILLED, 0 results<br>exit 0, 1 result (success/end_turn) | …4967-9a49-1b249e33261c.jsonl: 2 | 1/1 | p1: no (start 0) | 1 | 0 | 1 | ❌ | ✅ |
| kill-tool-use-r1 | KILLED, 0 results<br>exit 0, 1 result (success/end_turn) | …43b8-8817-ee6c528fadb6.jsonl: 3 | 2/2 | p1: no (start 0) | 1 | 0 | 1 | ❌ | ✅ |
| kill-tool-use-r2 | KILLED, 0 results<br>exit 0, 1 result (success/end_turn) | …434f-9087-6ad7c325efb9.jsonl: 3 | 2/2 | p1: no (start 0) | 1 | 0 | 1 | ❌ | ✅ |
| max-tokens-r1 | exit 1, 1 result (success/stop_sequence) | …4c10-87d6-b49d10f7c79d.jsonl: 5 | 4/4 | none | 1 | 0 | 1 | ❌ | ✅ |
| max-tokens-r2 | exit 1, 1 result (success/stop_sequence) | …469f-9a13-574c95662517.jsonl: 5 | 4/4 | none | 1 | 0 | 1 | ❌ | ✅ |
| nested-r1 | exit 0, 1 result (success/end_turn) | …4bf6-9265-62ace8e4992c.jsonl: 2<br>…gent-a189210852bcd9040.jsonl: 2<br>…gent-a673252ed54253aa6.jsonl: 2 | 2/2 | none | 4 | 0 | 1 | ✅ | ✅ |
| nested-r2 | exit 0, 1 result (success/end_turn) | …4d3f-8d1f-42e39c2ca463.jsonl: 2<br>…gent-a4a7796c8a9cedd94.jsonl: 2<br>…gent-acc17fe59c9825b1c.jsonl: 2 | 2/2 | none | 4 | 0 | 1 | ✅ | ✅ |

### Per run: stream details

| run | process | args / env | stream msgs (with delta) | delta stop_reasons | subagent stream_events | subagent assistant events (text blocks, ids) | results usage |
|---|---|---|---|---|---|---|---|
| background-r1 | 1 | – | 4 (4) | tool_use, end_turn, end_turn, end_turn | 0 | 6 (2, 4) | 4 / 9419 / 44380 / **453**<br>4 / 1228 / 29340 / **129**<br>4 / 1144 / 30568 / **59** |
| background-r2 | 1 | – | 4 (4) | tool_use, end_turn, end_turn, end_turn | 0 | 6 (2, 4) | 4 / 4864 / 48918 / **476**<br>4 / 1237 / 29323 / **84**<br>4 / 1124 / 30560 / **67** |
| flags-subagents-r1 | 1 | --thinking-display summarized --forward-subagent-text | 2 (2) | tool_use, end_turn | 0 | 6 (2, 4) | 4 / 9285 / 45195 / **485** |
| flags-subagents-r2 | 1 | --thinking-display summarized --forward-subagent-text | 2 (2) | tool_use, end_turn | 0 | 6 (2, 4) | 4 / 5717 / 48888 / **434** |
| flags-text-r1 | 1 | --thinking-display summarized --forward-subagent-text | 1 (1) | end_turn | 0 | 0 (0, 0) | 2 / 3693 / 20647 / **4012** |
| flags-text-r2 | 1 | --thinking-display summarized --forward-subagent-text | 1 (1) | end_turn | 0 | 0 (0, 0) | 2 / 0 / 24340 / **3792** |
| kill-mid-text-r1 | 1 | – | 1 (0) |  | 0 | 0 (0, 0) | – |
| kill-mid-text-r1 | 2 | – | 1 (1) | end_turn | 0 | 0 (0, 0) | 2 / 3755 / 20647 / **3124** |
| kill-mid-text-r2 | 1 | – | 1 (0) |  | 0 | 0 (0, 0) | – |
| kill-mid-text-r2 | 2 | – | 1 (1) | end_turn | 0 | 0 (0, 0) | 2 / 0 / 24402 / **4130** |
| kill-tool-use-r1 | 1 | – | 1 (0) |  | 0 | 0 (0, 0) | – |
| kill-tool-use-r1 | 2 | – | 2 (2) | tool_use, end_turn | 0 | 0 (0, 0) | 4 / 7708 / 45083 / **183** |
| kill-tool-use-r2 | 1 | – | 1 (0) |  | 0 | 0 (0, 0) | – |
| kill-tool-use-r2 | 2 | – | 2 (2) | tool_use, end_turn | 0 | 0 (0, 0) | 4 / 3862 / 48838 / **92** |
| max-tokens-r1 | 1 | CLAUDE_CODE_MAX_OUTPUT_TOKENS=300 | 4 (4) | max_tokens, max_tokens, max_tokens, max_tokens | 0 | 0 (0, 0) | 8 / 13629 / 84103 / **1200** |
| max-tokens-r2 | 1 | CLAUDE_CODE_MAX_OUTPUT_TOKENS=300 | 4 (4) | max_tokens, max_tokens, max_tokens, max_tokens | 0 | 0 (0, 0) | 8 / 0 / 97732 / **1200** |
| nested-r1 | 1 | – | 2 (2) | tool_use, end_turn | 0 | 1 (0, 1) | 4 / 8639 / 44304 / **142** |
| nested-r2 | 1 | – | 2 (2) | tool_use, end_turn | 0 | 1 (0, 1) | 4 / 4185 / 48766 / **245** |
