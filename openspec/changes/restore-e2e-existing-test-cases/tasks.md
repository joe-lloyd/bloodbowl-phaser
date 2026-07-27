## 1. Inventory

- [ ] 1.1 List every case currently registered in `src/testing/cases/` with its id and the gameplay section it belongs to
- [ ] 1.2 Map each case to its matching (or nearest) `__tests__/headless/*.test.ts` section name; note any case with no obvious section match

## 2. Reorganize case modules by section

- [ ] 2.1 Split `src/testing/cases/` into section-named modules matching `__tests__/headless/` naming (e.g. `push-chain`, `handoff`, `jump`)
- [ ] 2.2 Update `e2e/engine/scenario-cases.e2e.ts` and `e2e/browser/sandbox-cases.e2e.ts` to import from the reorganized section modules
- [ ] 2.3 Confirm the total registered case count and ids are unchanged after the split (no case lost or duplicated)

## 3. Documentation

- [ ] 3.1 Update `docs/E2E_TESTING.md` to document the section-first case-organization rule: new coverage goes into the matching section's case module, not a generic file
- [ ] 3.2 Note in the same doc that `__tests__/headless/*.test.ts` remains the fast, non-Playwright per-section regression home and is unaffected

## 4. Verification

- [ ] 4.1 Run the full `__tests__/headless/` suite and confirm every file still passes unchanged
- [ ] 4.2 Run the full e2e suite (engine, browser, visual, online projects) and confirm the same cases pass as before the reorganization
- [ ] 4.3 Spot-check: open `push-chain.test.ts` and its matching e2e case module side by side and confirm both are now easy to find and extend together
