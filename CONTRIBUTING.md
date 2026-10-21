# Contributing to jsonfold

Small tool, small rules:

1. **Zero dependencies, forever.** If a change needs an npm package, it
   doesn't belong here. Node ≥ 18 built-ins only.
2. **Lossless or it doesn't ship.** Every change to `fold` must keep the
   internal round-trip check passing. If `unfold(fold(x))` ever differs
   from `x`, that's a release-blocking bug.
3. **Receipts stay honest.** Byte counts are measured, token counts are a
   labeled ~4 chars/token heuristic. Don't present estimates as measurements.
4. **Tests with `node:test`.** Add a test for every behavior change;
   run `npm test` before opening a PR.
5. **Deterministic output.** Same input, same bytes out — the demo diff in
   CI depends on it. Sort ties by key name, never by hash or insertion
   order of a `Set`.

Bug reports: include the smallest JSON input that reproduces the problem
(scrub secrets first — jsonfold never needs your real data).
