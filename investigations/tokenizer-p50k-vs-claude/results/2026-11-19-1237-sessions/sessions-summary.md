> **Run** `results/2026-11-19-1237-sessions` · `sessions.ts` `C:/Users/spesce/Downloads/4b8e5589-47e2-436f-a34b-b9cccbdc49d2 C:/Users/spesce/.claude/projects/c--Users-spesce-Desktop-test-feature-flags-test-token` · started 2026-11-19 12:37
> **Claude Code** not recorded · **git** b81f2de (uncommitted changes)

Model claude-sonnet-5-5 (framing 8). 2310 pieces, 1239 distinct texts, 1240 count_tokens requests (0 retried). Texts are not stored; `sessions.items.jsonl` has counts only.

**ratio = p50k / Claude**: below 1 means p50k underestimates. ×correction = ΣClaude/Σp50k.

## Per session

| set | pieces | Σ p50k | Σ Claude | mean p50k | mean Claude | Σp50k/ΣClaude | ×correction | p50k under | mean abs err |
|---|---|---|---|---|---|---|---|---|---|
| 4b8e5589-47e2-436f-a34b-b9cccbdc49d2 | 995 | 419,203 | 587,408 | 421 | 590 | 0.714 | 1.401 | 100% | 30.5% |
| c--Users-spesce-Desktop-test-feature-flags-test-token | 1315 | 468,001 | 639,475 | 356 | 486 | 0.732 | 1.366 | 97% | 27.0% |
| both | 2310 | 887,204 | 1,226,883 | 384 | 531 | 0.723 | 1.383 | 98% | 28.5% |

## 4b8e5589-47e2-436f-a34b-b9cccbdc49d2 (4 transcripts: main + 3 subagents)

### By kind

| set | pieces | Σ p50k | Σ Claude | mean p50k | mean Claude | Σp50k/ΣClaude | ×correction | p50k under | mean abs err |
|---|---|---|---|---|---|---|---|---|---|
| conversation text (user + assistant) | 46 | 61,774 | 84,246 | 1,343 | 1,831 | 0.733 | 1.364 | 100% | 23.2% |
| preamble (system, tools, attachments) | 671 | 194,852 | 276,318 | 290 | 412 | 0.705 | 1.418 | 100% | 32.2% |
| tool inputs (JSON) | 131 | 34,935 | 51,279 | 267 | 391 | 0.681 | 1.468 | 99% | 29.5% |
| tool results | 147 | 127,642 | 175,565 | 868 | 1,194 | 0.727 | 1.375 | 100% | 25.9% |

### By category

| set | pieces | Σ p50k | Σ Claude | mean p50k | mean Claude | Σp50k/ΣClaude | ×correction | p50k under | mean abs err |
|---|---|---|---|---|---|---|---|---|---|
| assistant-text | 16 | 6,849 | 9,469 | 428 | 592 | 0.723 | 1.383 | 100% | 27.2% |
| attachment:agent-listing | 246 | 27,823 | 41,545 | 113 | 169 | 0.670 | 1.493 | 100% | 35.3% |
| attachment:context | 59 | 17,644 | 25,675 | 299 | 435 | 0.687 | 1.455 | 100% | 32.2% |
| attachment:deferred-tools | 28 | 17,077 | 24,846 | 610 | 887 | 0.687 | 1.455 | 100% | 32.2% |
| attachment:instructions | 31 | 44,124 | 59,766 | 1,423 | 1,928 | 0.738 | 1.355 | 100% | 26.8% |
| attachment:mcp | 1 | 546 | 709 | 546 | 709 | 0.770 | 1.299 | 100% | 23.0% |
| attachment:skill-listing | 256 | 32,396 | 46,485 | 127 | 182 | 0.697 | 1.435 | 100% | 30.7% |
| result:Agent | 3 | 372 | 470 | 124 | 157 | 0.791 | 1.263 | 100% | 20.8% |
| result:Bash | 53 | 55,519 | 76,939 | 1,048 | 1,452 | 0.722 | 1.386 | 100% | 28.5% |
| result:Edit | 9 | 559 | 799 | 62 | 89 | 0.700 | 1.429 | 100% | 30.3% |
| result:Read | 6 | 6,953 | 9,601 | 1,159 | 1,600 | 0.724 | 1.381 | 100% | 26.7% |
| result:Skill | 3 | 36 | 45 | 12 | 15 | 0.800 | 1.250 | 100% | 20.0% |
| result:SubagentHandback | 3 | 42 | 63 | 14 | 21 | 0.667 | 1.500 | 100% | 33.3% |
| result:ToolSearch | 23 | 682 | 979 | 30 | 43 | 0.697 | 1.435 | 100% | 30.4% |
| result:Write | 6 | 432 | 619 | 72 | 103 | 0.698 | 1.433 | 100% | 30.2% |
| result:mcp__caip-c4modeler__caipC4ModelerGetNodesInfo | 1 | 174 | 190 | 174 | 190 | 0.916 | 1.092 | 100% | 8.4% |
| result:mcp__caip-c4modeler__caipC4NodeContextRead | 1 | 2,533 | 3,543 | 2,533 | 3,543 | 0.715 | 1.399 | 100% | 28.5% |
| result:mcp__caip-c4modeler__caipC4NodeContextWrite | 1 | 176 | 212 | 176 | 212 | 0.830 | 1.205 | 100% | 17.0% |
| result:mcp__caip-gherkin__caipGherkinFindForC4Node | 1 | 9 | 12 | 9 | 12 | 0.750 | 1.333 | 100% | 25.0% |
| result:mcp__caip-gherkin__caipGherkinReadC4Links | 1 | 4,844 | 7,016 | 4,844 | 7,016 | 0.690 | 1.448 | 100% | 31.0% |
| result:mcp__caip-gherkin__caipGherkinReadDocuments | 2 | 2,569 | 3,838 | 1,285 | 1,919 | 0.669 | 1.494 | 100% | 33.6% |
| result:mcp__caip-gherkin__caipGherkinSetMetadata | 2 | 368 | 536 | 184 | 268 | 0.687 | 1.457 | 100% | 31.3% |
| result:mcp__caip-graph__caipGraphGetGraphChildren | 1 | 210 | 231 | 210 | 231 | 0.909 | 1.100 | 100% | 9.1% |
| result:mcp__caip-graph__caipGraphGetGraphContext | 1 | 521 | 587 | 521 | 587 | 0.888 | 1.127 | 100% | 11.2% |
| result:mcp__caip-graph__caipGraphGetTaskScope | 2 | 6,874 | 8,876 | 3,437 | 4,438 | 0.774 | 1.291 | 100% | 21.4% |
| result:mcp__caip-vscode__caipPipelineRunBegin | 1 | 169 | 208 | 169 | 208 | 0.813 | 1.231 | 100% | 18.8% |
| result:mcp__caip-vscode__caipPipelineRunEnd | 1 | 64 | 74 | 64 | 74 | 0.865 | 1.156 | 100% | 13.5% |
| result:mcp__caip-vscode__caipPipelineRunStatus | 1 | 2,499 | 3,075 | 2,499 | 3,075 | 0.813 | 1.230 | 100% | 18.7% |
| result:mcp__caip-vscode__caipPipelineStepBegin | 10 | 616 | 671 | 62 | 67 | 0.918 | 1.089 | 100% | 8.2% |
| result:mcp__caip-vscode__caipPipelineStepEnd | 10 | 1,229 | 1,532 | 123 | 153 | 0.802 | 1.247 | 100% | 19.8% |
| result:mcp__caip-vscode__caipVscodeExecuteCommand | 1 | 79 | 92 | 79 | 92 | 0.859 | 1.165 | 100% | 14.1% |
| result:mcp__caip-vscode__caipVscodeRunDotnetTests | 4 | 40,113 | 55,357 | 10,028 | 13,839 | 0.725 | 1.380 | 100% | 27.7% |
| system-prompt | 11 | 29,216 | 40,676 | 2,656 | 3,698 | 0.718 | 1.392 | 100% | 26.8% |
| tool-input-json | 131 | 34,935 | 51,279 | 267 | 391 | 0.681 | 1.468 | 99% | 29.5% |
| tool-schema-json | 39 | 26,026 | 36,616 | 667 | 939 | 0.711 | 1.407 | 100% | 29.0% |
| user-prompt | 30 | 54,925 | 74,777 | 1,831 | 2,493 | 0.735 | 1.361 | 100% | 21.1% |

## c--Users-spesce-Desktop-test-feature-flags-test-token (8 transcripts: main + 7 subagents)

### By kind

| set | pieces | Σ p50k | Σ Claude | mean p50k | mean Claude | Σp50k/ΣClaude | ×correction | p50k under | mean abs err |
|---|---|---|---|---|---|---|---|---|---|
| conversation text (user + assistant) | 93 | 38,766 | 48,870 | 417 | 525 | 0.793 | 1.261 | 100% | 19.5% |
| preamble (system, tools, attachments) | 449 | 191,872 | 264,995 | 427 | 590 | 0.724 | 1.381 | 100% | 30.7% |
| tool inputs (JSON) | 359 | 38,113 | 51,307 | 106 | 143 | 0.743 | 1.346 | 89% | 23.1% |
| tool results | 414 | 199,250 | 274,303 | 481 | 663 | 0.726 | 1.377 | 100% | 27.9% |

### By category

| set | pieces | Σ p50k | Σ Claude | mean p50k | mean Claude | Σp50k/ΣClaude | ×correction | p50k under | mean abs err |
|---|---|---|---|---|---|---|---|---|---|
| assistant-text | 36 | 15,513 | 19,866 | 431 | 552 | 0.781 | 1.281 | 100% | 26.4% |
| attachment:agent-listing | 186 | 22,611 | 33,531 | 122 | 180 | 0.674 | 1.483 | 100% | 35.2% |
| attachment:context | 48 | 8,341 | 10,271 | 174 | 214 | 0.812 | 1.231 | 100% | 26.5% |
| attachment:deferred-tools | 73 | 28,368 | 40,256 | 389 | 551 | 0.705 | 1.419 | 100% | 29.9% |
| attachment:instructions | 48 | 47,856 | 64,392 | 997 | 1,342 | 0.743 | 1.346 | 100% | 26.6% |
| attachment:mcp | 30 | 12,380 | 16,220 | 413 | 541 | 0.763 | 1.310 | 100% | 23.0% |
| result:Agent | 7 | 14,350 | 18,405 | 2,050 | 2,629 | 0.780 | 1.283 | 100% | 22.6% |
| result:Bash | 1 | 2,327 | 2,815 | 2,327 | 2,815 | 0.827 | 1.210 | 100% | 17.3% |
| result:Glob | 4 | 866 | 866 | 217 | 217 | 1.000 | 1.000 | 50% | 14.4% |
| result:Grep | 1 | 1,022 | 1,391 | 1,022 | 1,391 | 0.735 | 1.361 | 100% | 26.5% |
| result:Read | 39 | 69,544 | 91,794 | 1,783 | 2,354 | 0.758 | 1.320 | 100% | 24.5% |
| result:ToolSearch | 67 | 2,046 | 2,965 | 31 | 44 | 0.690 | 1.449 | 100% | 31.2% |
| result:mcp__caip-c4modeler__caipC4ModelerAutoLayout | 10 | 130 | 230 | 13 | 23 | 0.565 | 1.769 | 100% | 43.5% |
| result:mcp__caip-c4modeler__caipC4ModelerCreateEdges | 7 | 2,768 | 3,304 | 395 | 472 | 0.838 | 1.194 | 100% | 15.0% |
| result:mcp__caip-c4modeler__caipC4ModelerCreateMembers | 26 | 2,949 | 4,633 | 113 | 178 | 0.637 | 1.571 | 100% | 36.3% |
| result:mcp__caip-c4modeler__caipC4ModelerCreateNodes | 20 | 3,810 | 5,028 | 191 | 251 | 0.758 | 1.320 | 100% | 22.9% |
| result:mcp__caip-c4modeler__caipC4ModelerDrillDown | 3 | 130 | 170 | 43 | 57 | 0.765 | 1.308 | 100% | 23.5% |
| result:mcp__caip-c4modeler__caipC4ModelerGetActiveLevelDiagram | 5 | 683 | 879 | 137 | 176 | 0.777 | 1.287 | 100% | 26.8% |
| result:mcp__caip-c4modeler__caipC4ModelerGetArtifactProperties | 1 | 59 | 88 | 59 | 88 | 0.670 | 1.492 | 100% | 33.0% |
| result:mcp__caip-c4modeler__caipC4ModelerGetArtifactSlice | 24 | 33,060 | 52,168 | 1,378 | 2,174 | 0.634 | 1.578 | 100% | 36.3% |
| result:mcp__caip-c4modeler__caipC4ModelerGetArtifactTypes | 7 | 181 | 236 | 26 | 34 | 0.767 | 1.304 | 100% | 24.7% |
| result:mcp__caip-c4modeler__caipC4ModelerGetNodesInfo | 17 | 19,393 | 25,886 | 1,141 | 1,523 | 0.749 | 1.335 | 100% | 26.1% |
| result:mcp__caip-c4modeler__caipC4ModelerGetProject | 2 | 386 | 470 | 193 | 235 | 0.821 | 1.218 | 100% | 17.9% |
| result:mcp__caip-c4modeler__caipC4ModelerGetTree | 1 | 2,796 | 3,515 | 2,796 | 3,515 | 0.795 | 1.257 | 100% | 20.5% |
| result:mcp__caip-c4modeler__caipC4ModelerGetValidationIssues | 5 | 8,824 | 12,260 | 1,765 | 2,452 | 0.720 | 1.389 | 100% | 27.8% |
| result:mcp__caip-c4modeler__caipC4ModelerJumpIn | 35 | 1,489 | 1,953 | 43 | 56 | 0.762 | 1.312 | 100% | 23.8% |
| result:mcp__caip-c4modeler__caipC4ModelerListInteractionTypes | 1 | 378 | 593 | 378 | 593 | 0.637 | 1.569 | 100% | 36.3% |
| result:mcp__caip-c4modeler__caipC4ModelerOpen | 4 | 36 | 64 | 9 | 16 | 0.563 | 1.778 | 100% | 43.8% |
| result:mcp__caip-c4modeler__caipC4ModelerResolveConflicts | 1 | 32 | 53 | 32 | 53 | 0.604 | 1.656 | 100% | 39.6% |
| result:mcp__caip-c4modeler__caipC4ModelerSave | 3 | 583 | 787 | 194 | 262 | 0.741 | 1.350 | 100% | 29.5% |
| result:mcp__caip-c4modeler__caipC4ModelerUpdateEdgesDescription | 4 | 44 | 72 | 11 | 18 | 0.611 | 1.636 | 100% | 38.9% |
| result:mcp__caip-c4modeler__caipC4ModelerUpdateNodes | 2 | 22 | 34 | 11 | 17 | 0.647 | 1.545 | 100% | 35.3% |
| result:mcp__caip-c4modeler__caipC4NodeContextLogOutcome | 9 | 988 | 1,222 | 110 | 136 | 0.809 | 1.237 | 100% | 19.1% |
| result:mcp__caip-c4modeler__caipC4NodeContextRead | 8 | 9,005 | 12,772 | 1,126 | 1,597 | 0.705 | 1.418 | 100% | 28.7% |
| result:mcp__caip-c4modeler__caipC4NodeContextWrite | 26 | 2,446 | 3,116 | 94 | 120 | 0.785 | 1.274 | 100% | 21.5% |
| result:mcp__caip-c4modeler__caipC4NodeMemoryPropose | 1 | 188 | 261 | 188 | 261 | 0.720 | 1.388 | 100% | 28.0% |
| result:mcp__caip-gherkin__caipGherkinAddScenarios | 1 | 65 | 91 | 65 | 91 | 0.714 | 1.400 | 100% | 28.6% |
| result:mcp__caip-gherkin__caipGherkinCreateRequirementsFeature | 6 | 2,079 | 3,025 | 347 | 504 | 0.687 | 1.455 | 100% | 31.1% |
| result:mcp__caip-gherkin__caipGherkinListDocuments | 3 | 373 | 585 | 124 | 195 | 0.638 | 1.568 | 100% | 37.1% |
| result:mcp__caip-gherkin__caipGherkinReadC4Links | 1 | 2,236 | 3,540 | 2,236 | 3,540 | 0.632 | 1.583 | 100% | 36.8% |
| result:mcp__caip-gherkin__caipGherkinReadDocuments | 1 | 6,904 | 9,869 | 6,904 | 9,869 | 0.700 | 1.429 | 100% | 30.0% |
| result:mcp__caip-gherkin__caipGherkinSearchScenarios | 1 | 9 | 13 | 9 | 13 | 0.692 | 1.444 | 100% | 30.8% |
| result:mcp__caip-gherkin__caipGherkinSetC4Links | 6 | 5,236 | 6,689 | 873 | 1,115 | 0.783 | 1.278 | 100% | 21.5% |
| result:mcp__caip-gherkin__caipGherkinSetComments | 48 | 1,715 | 2,313 | 36 | 48 | 0.741 | 1.349 | 100% | 25.8% |
| result:mcp__caip-gherkin__caipGherkinValidate | 6 | 98 | 148 | 16 | 25 | 0.662 | 1.510 | 100% | 33.8% |
| system-prompt | 23 | 36,788 | 50,051 | 1,599 | 2,176 | 0.735 | 1.361 | 100% | 25.4% |
| tool-input-json | 359 | 38,113 | 51,307 | 106 | 143 | 0.743 | 1.346 | 89% | 23.1% |
| tool-schema-json | 41 | 35,528 | 50,274 | 867 | 1,226 | 0.707 | 1.415 | 100% | 29.9% |
| user-prompt | 57 | 23,253 | 29,004 | 408 | 509 | 0.802 | 1.247 | 100% | 15.1% |

