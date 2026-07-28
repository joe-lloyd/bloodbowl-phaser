## Why

The `add-comprehensive-e2e-scenario-testing` change (archived, PR #10) added a genuinely separate, layer-organized test structure — `e2e/{engine,browser,visual,online}/*.e2e.ts` plus a flat, generic case registry in `src/testing/cases/` — rather than extending the pre-existing per-section files in `__tests__/headless/*.test.ts` (e.g. `push-chain.test.ts`, `handoff.test.ts`, `jump.test.ts`, one file per rule/section). Its own design doc said the plan was to "migrate representative scenarios" and "convert existing seeded sandbox and rule scenarios" into the new format. The old per-section files were never deleted and still work, but new coverage since then has gone into the separate `e2e/`/`src/testing/cases/` matrix instead of the matching per-section file, which is exactly what the user is asking to stop: they want to keep opening (say) `push-chain.test.ts` and find the tests for that rule there, with new cases added alongside the old ones, not hunt through a differently-organized parallel suite.

## What Changes

- New scenario-case coverage SHALL be organized to mirror the existing per-section `__tests__/headless/*.test.ts` files: `src/testing/cases/` SHALL be split into modules named after their matching section (e.g. a `push-chain` case module for cases exercised by `push-chain.test.ts`'s subject matter), so a person working on a section finds its cases in one predictable place.
- No existing test in `__tests__/headless/`, `__tests__/unit/`, or `__tests__/integration/` SHALL be removed or replaced by this change — this is purely additive reorganization of where new/duplicated case data lives, not a deletion of prior coverage.
- The `e2e-scenario-testing` capability SHALL gain a requirement stating that new scenario-case coverage is added to the section-matching case module (or, for a section with no existing case module yet, a new one named after it), not to a generically-organized catch-all file.
- This does not undo the Playwright engine/browser/visual/online project architecture itself (headless-first execution, shared case contract, seeded determinism, visual checkpoints) — only how case *data* is filed for discoverability.

## Capabilities

### Modified Capabilities
- `e2e-scenario-testing`: add a requirement that scenario cases are organized and extended per gameplay section (mirroring `__tests__/headless/*.test.ts` naming) rather than filed into a generic, non-section-aligned structure.

## Impact

- `src/testing/cases/` — reorganized into section-named modules; `e2e/engine/scenario-cases.e2e.ts` and `e2e/browser/sandbox-cases.e2e.ts` (the generic matrix runners) keep working by importing from the reorganized modules.
- `__tests__/headless/*.test.ts` — untouched; kept as the section-first home the user already relies on.
- `docs/E2E_TESTING.md` — update to document the section-first case-organization rule alongside the existing per-project (engine/browser/visual/online) description.
