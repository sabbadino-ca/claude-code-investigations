> **Run** `results/2026-11-19-1242-explain` · `explain.ts` `C:/Users/spesce/Downloads/4b8e5589-47e2-436f-a34b-b9cccbdc49d2 C:/Users/spesce/.claude/projects/c--Users-spesce-Desktop-test-feature-flags-test-token` · started 2026-11-19 12:42
> **Claude Code** not recorded · **git** b81f2de (uncommitted changes)

Corpus: 369 texts from `2026-11-19-1219-compare` (fixture filler excluded), ×1.274. Sessions: 2310 pieces from `2026-11-19-1237-sessions` (0 not matched), ×1.383. ×correction = ΣClaude/Σp50k.

## 0. Same category in both datasets

Session categories mapped to the corpus ones (CLAUDE.md instructions → markdown). Categories in brackets have no counterpart in the corpus.

| category | corpus × | sessions × | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| (MCP tool results) | – | 1.406 (336) | – | 19.7% |
| markdown | 1.394 (23) | 1.350 (79) | 2.8% | 10.1% |
| user-prompt | 1.570 (17) | 1.327 (87) | 0.9% | 8.5% |
| tool-input-json | 1.373 (12) | 1.404 (490) | 0.1% | 8.4% |
| result-read | 1.223 (30) | 1.325 (45) | 14.9% | 8.3% |
| system-prompt | 1.313 (16) | 1.375 (34) | 1.9% | 7.4% |
| tool-schema-json | 1.409 (20) | 1.412 (80) | 3.3% | 7.1% |
| result-bash | 1.212 (19) | 1.379 (54) | 10.2% | 6.5% |
| (attachment:agent-listing) | – | 1.489 (432) | – | 6.1% |
| (attachment:deferred-tools) | – | 1.433 (101) | – | 5.3% |
| (attachment:skill-listing) | – | 1.435 (256) | – | 3.8% |
| (attachment:context) | – | 1.383 (107) | – | 2.9% |
| assistant-text | 1.523 (30) | 1.312 (52) | 10.4% | 2.4% |
| result-agent | 1.346 (12) | 1.282 (10) | 0.6% | 1.5% |
| (attachment:mcp) | – | 1.310 (31) | – | 1.4% |
| result-other | 1.326 (11) | 1.441 (111) | 0.2% | 0.4% |
| result-grep-glob | 1.207 (20) | 1.195 (5) | 2.2% | 0.2% |

On the matched categories only: corpus ×1.309, sessions ×1.360; corpus ratios re-weighted with the sessions' category mix ×1.358. Unmatched categories hold 39.3% of the session tokens at ×1.419.

## 1. Feature means (weighted by Claude tokens)

| feature | corpus | sessions |
|---|---|---|
| nonAscii | 0.001 | 0.002 |
| accented | 0.000 | 0.000 |
| digits | 0.052 | 0.034 |
| hexRuns | 0.023 | 0.037 |
| whitespace | 0.154 | 0.128 |
| indent | 0.047 | 0.015 |
| symbols | 0.121 | 0.093 |
| upper | 0.023 | 0.045 |
| itWords | 0.002 | 0.005 |
| enWords | 0.091 | 0.159 |
| wordLen | 5.036 | 5.301 |
| lineLen | 82.157 | 18.301 |

## 2. log(Claude/p50k) regressed on the features (WLS, weight = Claude tokens, both datasets, R² 0.527)

Gap to explain: mean log ratio sessions 0.327 − corpus 0.246 = 0.080 (×1.387 vs ×1.280). Explained by feature differences: 0.070 (87.6%); unexplained: 0.010.

| feature | β | sessions − corpus | contribution to the gap | share of the gap |
|---|---|---|---|---|
| enWords | 0.470 | 0.068 | 0.032 | 39.8% |
| wordLen | 0.053 | 0.265 | 0.014 | 17.6% |
| indent | -0.411 | -0.032 | 0.013 | 16.4% |
| upper | 0.502 | 0.022 | 0.011 | 13.8% |
| symbols | 0.193 | -0.029 | -0.006 | -6.9% |
| digits | -0.285 | -0.018 | 0.005 | 6.5% |
| hexRuns | 0.287 | 0.014 | 0.004 | 5.0% |
| nonAscii | -3.021 | 0.001 | -0.003 | -4.1% |
| whitespace | 0.099 | -0.026 | -0.003 | -3.2% |
| lineLen | -0.000 | -63.856 | 0.002 | 2.5% |
| accented | -11.033 | -0.000 | 0.000 | 0.3% |
| itWords | 0.001 | 0.002 | 0.000 | 0.0% |

## 3. ×correction by feature bin (Σ Claude / Σ p50k; pieces in brackets)

**nonAscii**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.001 | 1.269 (297) | 1.407 (1782) | 82.3% | 52.4% |
| 0.001 – 0.005 | 1.288 (55) | 1.355 (401) | 16.3% | 40.2% |
| 0.005 – 0.020 | 1.365 (14) | 1.372 (126) | 0.8% | 7.4% |
| 0.020 – max | 1.405 (3) | 1.313 (1) | 0.5% | 0.0% |

**accented**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.001 | 1.275 (349) | 1.384 (2283) | 98.2% | 98.1% |
| 0.001 – 0.003 | 1.177 (7) | 1.336 (6) | 1.4% | 1.6% |
| 0.003 – 0.010 | 1.291 (10) | 1.286 (21) | 0.4% | 0.3% |
| 0.010 – max | 1.158 (3) | – | 0.0% | 0.0% |

**hexRuns**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.001 | 1.339 (261) | 1.396 (1913) | 42.9% | 73.3% |
| 0.001 – 0.020 | 1.236 (24) | 1.396 (28) | 36.6% | 9.4% |
| 0.020 – 0.100 | 1.227 (53) | 1.364 (65) | 10.6% | 6.3% |
| 0.100 – max | 1.204 (31) | 1.300 (304) | 9.9% | 11.0% |

**itWords**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.010 | 1.278 (344) | 1.385 (2149) | 97.9% | 95.8% |
| 0.010 – 0.050 | 1.116 (11) | 1.375 (83) | 1.9% | 2.7% |
| 0.050 – 0.120 | – | 1.341 (39) | 0.0% | 0.3% |
| 0.120 – max | 1.169 (14) | 1.267 (39) | 0.2% | 1.2% |

**enWords**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.020 | 1.246 (119) | 1.341 (765) | 37.1% | 14.9% |
| 0.020 – 0.080 | 1.209 (61) | 1.396 (317) | 24.0% | 12.3% |
| 0.080 – 0.150 | 1.238 (41) | 1.402 (339) | 14.3% | 12.1% |
| 0.150 – max | 1.420 (148) | 1.387 (889) | 24.6% | 60.7% |

**indent**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.010 | 1.312 (316) | 1.389 (2202) | 66.0% | 76.6% |
| 0.010 – 0.050 | 1.229 (28) | 1.361 (56) | 18.2% | 14.4% |
| 0.050 – 0.150 | 1.169 (16) | 1.374 (47) | 3.2% | 8.3% |
| 0.150 – max | 1.185 (9) | 1.263 (5) | 12.6% | 0.7% |

**upper**

| bin | corpus | sessions | share of corpus tokens | share of session tokens |
|---|---|---|---|---|
| 0 – 0.030 | 1.276 (199) | 1.356 (1205) | 76.4% | 39.9% |
| 0.030 – 0.060 | 1.262 (92) | 1.383 (627) | 18.1% | 35.1% |
| 0.060 – 0.100 | 1.264 (38) | 1.435 (296) | 4.2% | 20.5% |
| 0.100 – max | 1.328 (40) | 1.398 (182) | 1.3% | 4.5% |

## 4. Probes (claude-sonnet-5-5, framing 8)

| probe | chars | p50k | Claude | ×correction | chars/p50k tok | chars/Claude tok |
|---|---|---|---|---|---|---|
| camelCase identifiers | 2022 | 475 | 915 | 1.926 | 4.26 | 2.21 |
| JSON minified | 1903 | 555 | 914 | 1.647 | 3.43 | 2.08 |
| emoji | 899 | 399 | 639 | 1.602 | 2.25 | 1.41 |
| Windows paths | 2226 | 838 | 1294 | 1.544 | 2.66 | 1.72 |
| markdown table | 1752 | 595 | 882 | 1.482 | 2.94 | 1.99 |
| Gherkin (English) | 1672 | 359 | 523 | 1.457 | 4.66 | 3.20 |
| English prose | 3748 | 844 | 1192 | 1.412 | 4.44 | 3.14 |
| box drawing and arrows (├ └ ─ → ✓) | 1310 | 479 | 666 | 1.390 | 2.73 | 1.97 |
| C# code | 2206 | 738 | 1009 | 1.367 | 2.99 | 2.19 |
| snake_case identifiers | 1844 | 424 | 571 | 1.347 | 4.35 | 3.23 |
| markdown bullets '- name: description' | 2695 | 585 | 779 | 1.332 | 4.61 | 3.46 |
| POSIX paths | 1832 | 744 | 891 | 1.198 | 2.46 | 2.06 |
| integers and decimals | 824 | 356 | 419 | 1.177 | 2.31 | 1.97 |
| Gherkin (Italian) | 1856 | 593 | 697 | 1.175 | 3.13 | 2.66 |
| JSON pretty, 2 spaces | 5516 | 1323 | 1545 | 1.168 | 4.17 | 3.57 |
| Italian prose | 3965 | 1447 | 1675 | 1.158 | 2.74 | 2.37 |
| JSON pretty, 4 spaces | 8780 | 1515 | 1725 | 1.139 | 5.80 | 5.09 |
| hex hashes (40 chars) | 1229 | 757 | 815 | 1.077 | 1.62 | 1.51 |
| UUIDs | 1479 | 992 | 1062 | 1.071 | 1.49 | 1.39 |
| Italian words with accents (è, più, perché, già, così) | 1119 | 599 | 320 | 0.534 | 1.87 | 3.50 |
| JSON pretty, tabs | 3884 | 2727 | 1443 | 0.529 | 1.42 | 2.69 |

