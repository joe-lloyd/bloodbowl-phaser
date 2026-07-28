## Context

`src/testing/cases/` is a flat, generic registry consumed by `e2e/engine/scenario-cases.e2e.ts` (89 lines) and `e2e/browser/sandbox-cases.e2e.ts` (192 lines) as a matrix runner. `__tests__/headless/` has 122 files, one per rule/section (`push-chain.test.ts`, `handoff.test.ts`, `jump.test.ts`, `foul-and-jump-actions.test.ts`, etc.) — the structure the user thinks in and wants to keep extending. The two structures aren't unified: a new rule interaction case today gets added to the generic registry, invisible to someone opening the matching `__tests__/headless/<section>.test.ts` file.

## Goals / Non-Goals

**Goals:**
- Make new scenario-case coverage discoverable from the same per-section mental model the user already uses.
- Do this without deleting or weakening any existing test (headless, unit, integration, or the new e2e matrix).

**Non-Goals:**
- Rewriting the Playwright engine/browser/visual/online project architecture — it stays.
- Merging `__tests__/headless/*.test.ts` and the e2e case registry into one file format; they can remain two different test styles (Vitest unit-ish scenario assertions vs. Playwright-driven E2E), as long as case *data* for a given section lives in one predictable, section-named place.

## Decisions

- **Split `src/testing/cases/` by section name, matching `__tests__/headless/`'s naming**, rather than inventing a new taxonomy. A case for push-chain/Grab interactions goes in a `push-chain` case module; a case for hand-off goes in a `handoff` case module. The generic matrix runners (`scenario-cases.e2e.ts`, `sandbox-cases.e2e.ts`) import from all section modules the same way they'd import from one flat file today — no runner logic changes.
- **Leave `__tests__/headless/*.test.ts` untouched.** They are not merged into or replaced by the e2e case modules; they remain the fast, no-Playwright regression home they already are. The new rule for future work is: when a section's behavior gets new coverage, add it to both the matching `__tests__/headless/<section>.test.ts` (direct, fast) and, only if the coverage specifically needs Playwright/browser/visual verification, the matching section-named e2e case module — not a generic catch-all.

## Risks / Trade-offs

- [Splitting the existing flat case registry into per-section modules is a refactor with some risk of missing a case in the move] → mitigated by running the full e2e suite (all four projects) before and after the split and diffing the count/ids of registered cases.
