# gpt-tokenizer (vendored)

Vendored, not installed: [report](../../report.mjs) must run with no `npm install` and no network.

- **Package**: `gpt-tokenizer` v4.0.0 — MIT, zero runtime dependencies
- **Source**: <https://unpkg.com/gpt-tokenizer@4.0.0/esm/encoding/p50k_base.js> plus its transitive
  relative imports (21 ESM modules, ~0.6 MB), fetched verbatim
- **Encoding**: `p50k_base`
- **Entry point**: `esm/encoding/p50k_base.js` — exports `countTokens`, `encode`, `decode`,
  `isWithinTokenLimit`, `vocabularySize`

Generated, not hand-edited. To refresh, re-fetch the same entry point and follow every relative
`import` (including side-effect `import "…";` forms, which have no `from` clause).

Do NOT import `esm/main.js` — it re-exports **o200k_base**, not p50k_base.

These files are not flattened into one bundle on purpose: the graph contains a genuine circular
dependency (`modelParams.js` <-> `encodingParams/*`) that plain concatenation cannot resolve.
