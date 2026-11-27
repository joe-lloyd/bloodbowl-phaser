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
pnpm typecheck
pnpm lint
pnpm build:netlify
```

`pnpm typecheck` runs tsrs, the Rust port of the TypeScript 7 checker, over the
app and over `functions/`. It reports no errors, and CI fails a pull request
that adds one. Vite transpilation does not replace this check. See
[development](../DEVELOPMENT.md).

## Lint, size, complexity and duplication

`pnpm lint` runs three tools, all native binaries:

- **oxlint** runs every lint rule, configured in `.oxlintrc.json`. It gets type
  information from tsrs. Rules oxlint has natively run natively. The rest run
  from the original ESLint plugins (unicorn, sonarjs, eslint-plugin-n) in
  oxlint's JS plugin host, under the names `unicorn-js/`, `n-js/` and
  `sonarjs/`. The comment rule is in `house-rules.mjs`.
- **fallow** finds unused files, exports and dependencies, import cycles,
  copied code and cognitive complexity over 12, configured in `.fallowrc.json`.
- **`pnpm lint:directives`** fails on file-wide or same-line `eslint-` and
  `oxlint-` directives, because an oxlint directive could switch the comment
  rule off.

oxlint enforces these limits on every function and file outside the tests:

| Rule | Limit |
| --- | --- |
| `complexity` | 10 paths through a function |
| `max-lines` | 800 lines per file |
| `max-lines-per-function` | 60 lines |
| `max-params`, `max-depth` | 3 |
| `sonarjs/no-identical-functions` | no two functions with the same body |

Tests, `e2e/`, `src/testing/` and `src/data/ruleScenarios/` are exempt from the
size limits, from fallow's complexity check and from its copy check. Split a
test file that passes 800 lines by `describe` block, and put the setup the parts
share in a helper module beside them.

JS plugins get no type information. A few unicorn rules that skipped `Map` and
`Set` code under typed ESLint, such as `no-for-each`, now flag it; write
`for…of` instead.

Code written before these rules is recorded as a baseline: oxlint's in
`oxlint-suppressions.json`, as a count per file and rule, and fallow's in
`fallow-baselines/`. New problems fail. When you split a long file, simplify a
complex function or remove a cycle, lint fails until you shrink the baseline:

```bash
pnpm exec oxlint --prune-suppressions
pnpm exec fallow dead-code --save-baseline fallow-baselines/dead-code.json
pnpm exec fallow dupes --save-baseline fallow-baselines/dupes.json
pnpm exec fallow health --complexity --save-baseline fallow-baselines/health.json
```

Commit the smaller files with the change. Do not add entries by hand.
