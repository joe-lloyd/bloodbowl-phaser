# Testing

Choose checks for the behaviour you change. Vitest covers unit and headless
behaviour. Playwright runs engine scenarios, browser interactions and visual
comparisons. Simulations exercise rules together across full matches.

## Fast local checks

```bash
pnpm exec vitest run path/to/test.ts
pnpm exec vitest run __tests__/unit/skill-catalog.test.ts
pnpm exec vitest run __tests__/headless/rules/gate.test.ts
pnpm exec vitest run                         # full Vitest suite
pnpm docs:check                              # links and private references
```

Use literal expected outcomes through public entry points. Avoid tests that
only mirror an implementation helper or confirm which internal function ran.

## Scenario and browser checks

```bash
pnpm e2e:install       # install the pinned Chromium build once
pnpm e2e:engine        # scenario matrix without a browser
pnpm e2e:browser       # real board interactions and HUD decisions
pnpm e2e:visual        # compare reviewed screenshots
pnpm e2e:case dodge    # filter by case name or id
pnpm e2e:report        # open the previous run's report
```

See [E2E testing](../E2E_TESTING.md) for case definitions, artifacts, emulator
setup and baseline updates. The tests live in `e2e/`. Browser tests use a
production bundle in CI and deterministic fixtures rather than a live cloud account.

For online transport and reload checks, use the opt-in emulator project or the
[two-browser match harness](../../e2e/online-match/README.md).

## Reproduce dice outcomes

Use a fixed seed and reproduce the actual action sequence. A seed depends on
all dice consumed before the result, so an isolated roll is not always a valid
seed for the whole operation.

[`__tests__/utils/seed-finder.ts`](../../__tests__/utils/seed-finder.ts) provides
`findSeedForDiceSequence`, `findSeedForBlockOutcome` and injury-chain helpers.
The shared rule-case tooling also finds and records outcome seeds; see the
[E2E seed workflow](../E2E_TESTING.md). Commit stable reproductions rather than
searching large seed ranges in every test run.

## Whole matches and performance

```bash
pnpm sim --games 10
pnpm perf
```

[Simulations](../SIMULATION.md) record blocking findings and support replay.
The [performance log](../../perf-results/LOG.md) records measured changes.
Compare performance on the same hardware and workload. Keep sprite animation
smooth while testing any reduction in rendering work.

## Type and build checks

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm build:netlify
```

The TypeScript check currently reports existing errors. Compare diagnostics
with the base revision and fix new errors introduced by your change. Vite
transpilation does not replace this check. See [development](../DEVELOPMENT.md).
