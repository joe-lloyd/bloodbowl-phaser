# End-to-end scenario testing

The E2E suite answers one question: **does this rule still work, and can I
reproduce it when it does not?**

Everything runs under Playwright, split into three projects:

| project | what it does | cost |
| --- | --- | --- |
| `engine-scenarios` | Drives `HeadlessGame` directly. Owns the large deterministic outcome matrix. Never opens a browser. | ~10s for ~250 cases |
| `browser-gameplay` | Headless Chromium against a built preview. Real canvas clicks, real HUD dialogs. | ~2 min |
| `visual-regression` | A tagged subset of browser checkpoints that also compares screenshots. | ~40s |
| `online-emulator` | **Opt-in.** Host/guest flows against the Firebase emulators. | ~1 min + emulator start |

---

## Setup

```bash
pnpm install
pnpm e2e:install        # one Chromium download (~120MB), pinned to @playwright/test
```

The suite runs offline. `.env.e2e` blanks the Firebase config, which puts the
app in local-play mode — no auth, no Firestore, and the admin-gated sandbox is
reachable without signing in.

## Running

```bash
pnpm e2e                       # engine + browser + visual
pnpm e2e:engine                # the fast matrix; no browser is started at all
pnpm e2e:browser               # UI-boundary behaviour
pnpm e2e:visual                # screenshot comparison
pnpm e2e:online                # opt-in: starts the Firebase emulators first

pnpm e2e:case dodge            # filter by case id, regression id, or any substring
pnpm e2e:headed                # watch it happen
pnpm e2e:debug                 # Playwright inspector, step by step
pnpm e2e:report                # open the last HTML report
pnpm e2e:trace <trace.zip>     # open a trace from a failure
```

`pnpm e2e:engine` deliberately does **not** start the Vite server: the engine
project imports the game directly, and `e2e/support/engineTest.ts` fails any
test that asks for `page`, `context` or `browser`.

---

## The scenario case

A *case* is the unit everything shares — the engine lane, the browser lane,
the coverage report, and the sandbox all consume the same value.

```ts
{
  id: "movement-unopposed-walk",       // stable, kebab, quotable in a bug report
  capability: "movement",
  interactions: ["protocol-command:move"],
  setup: playSetup({ ... }),           // the pitch, as a Scenario setup
  steps: [step({ type: "move", playerId: "team1:0", path: [...] }, "walk east")],
  layers: ["engine", "browser"],       // where it must prove itself
  variants: [                          // one per materially different outcome
    { id: "clear-lane", seed: 1, expectedOutcome: "the mover reaches (8,5)" },
  ],
  checkpoints: [endsAt("team1:0", { x: 8, y: 5 }), noTurnover()],
}
```

Players and teams are addressed by **stable reference** — `team1:3` is index 3
of team 1's roster — never by a runtime id. Runtime ids change every run, so
anything containing one cannot be replayed.

Cases live in `src/testing/cases/`. Three sources feed the registry:

- **authored** cases, written by hand;
- **rule-catalog** cases, generated from every `RuleConfig` × outcome, so
  registering a rule adds it to the matrix automatically;
- **legacy** sandbox scenarios that carry a seed, promoted so they appear in
  the coverage report rather than being invisible.

### Case organization is section-first

Authored cases are organized **per gameplay section**, mirroring the naming
of `__tests__/headless/*.test.ts` — the fast, non-Playwright per-section
regression suite that already exists for every rule and mechanic (122 files:
`push-chain.test.ts`, `handoff.test.ts`, `jump.test.ts`,
`driveReset.test.ts`, `kickoff-events.test.ts`, `sevens-setup.test.ts`, and
so on). That file is unaffected by how e2e cases are organized: it stays the
place to look for direct, fast coverage of a section, and it keeps passing
unchanged regardless of how the e2e case registry is filed.

A case for a section goes in that section's module: `src/testing/cases/
kickoff-events.ts` holds the cases `kickoff-events.test.ts` would also
recognize, `src/testing/cases/drive-reset.ts` holds the drive-reset ones,
and so on. When a case's section has no exact headless counterpart yet
(`movement.ts`, `activation.ts`, `decisions.ts` are the current examples),
it still gets its own module named after the capability it covers, rather
than being dropped into one generic, non-section-aligned file.

**Adding new coverage:** put a new case in the matching section's module
(creating one named after the section if none exists yet), never in a
catch-all file. If the behavior is worth a fast headless regression too,
add it to the matching `__tests__/headless/<section>.test.ts` as well —
the two are separate test styles for the same section, not a single format.

`src/testing/cases/index.ts` assembles every section module into the
`SCENARIO_CASES` registry the runners below consume; `fromRuleConfigs.ts`
(the generated rule-catalog cases) and `scenarioCase/legacy.ts` (promoted
sandbox scenarios) are separate, already-organized sources and are not part
of this per-section split.

## Seeds are committed test data

A variant names a seed. The suite **executes that seed** — it never searches.
That is the whole point: if an RNG-order change makes seed 7 stop producing
"failed pick-up", searching would quietly find seed 9 and pass, and the signal
would be gone.

```bash
pnpm e2e:seeds                 # fill in outcomes that have no seed yet
pnpm e2e:seeds --refresh       # rediscover every seed (a reviewable diff)
pnpm e2e:seeds --config dodge-reroll --limit 500
```

A refresh is a deliberate, reviewed commit to
`src/testing/seeds/committedSeeds.json`. An outcome the finder cannot reach
within its bounded window is **reported, not invented**.

## When something fails

Every failure prints the case, the expected outcome, what actually happened,
the seed, and two ways back in:

```
rule-dodge-reroll/skill-reroll-offered failed checkpoint 'outcome-...'
  expected: Dodge re-roll offered and used
  actual:   the run does not exhibit '...'
  run was:  phase=PLAY rolls=[Dodge:failure] decisions=[]
  seed:     7 (committed — refresh deliberately with 'pnpm e2e:seeds')
  replay:   pnpm e2e:replay rule-dodge-reroll --variant skill-reroll-offered
  bundle:   .../rule-dodge-reroll__skill-reroll-offered__engine.json
```

The **diagnostic bundle** is a JSON file with the setup, the roster fixture,
the seed, every step as executed, the response stream, the events, and the
initial and final snapshots. Browser failures keep a Playwright trace, a
screenshot, console/page errors and a video-on-retry in the same folder.

```bash
pnpm e2e:replay <case-id> --variant <id>            # rerun in the engine
pnpm e2e:replay <case-id> --variant <id> --headed   # watch it in a browser
pnpm e2e:replay BUG-2026-07-xyz                     # by regression id
pnpm e2e:replay <case-id> --seed 42                 # bisect a drifted seed
```

Or open the board by hand: every bundle carries a sandbox URL
(`/sand-box?scenario=<case>&seed=<n>&outcome=<variant>`), and the sandbox's
**E2E Cases** topic lists every case with a filter, its variants, its fixture,
and a live check of its checkpoints.

---

## Coverage

Line coverage says how much code ran. This report says which *rules* are
proved.

```bash
pnpm e2e:coverage              # human report; non-zero on gaps
pnpm e2e:coverage:baseline     # record today's gaps as the baseline
pnpm e2e:coverage:diff         # fail only on gaps that are NEW
```

The inventory is generated from sandbox scenarios, rule configs and outcomes,
protocol commands, decision types and phases — so adding a protocol command
opens a gap rather than widening a blind spot. Coverage is reported **per
layer and never blended**: a case with exhaustive engine variants and no
screenshot is engine-complete and visually absent, and the report says so.

Coverage is also *observed*, not guessed. Runs write fragments recording the
decisions they actually raised and phases they actually reached, because a
case that answers rerolls through its decision policy mentions no reroll in
its script.

Genuinely uncovered entries need a **reviewed exclusion** in
`src/testing/coverage/exclusions.ts` with a reason, an owner and a tracking
reference. An exclusion missing any of those fails validation.

---

## Fixture authenticity

Scenarios field **real roster players**. A Human Lineman with a granted
Chainsaw proves the code path and hides the Secret Weapon send-off; an Ogre
granted to a Human never meets Bone Head.

The policy, in order:

1. **Native** — a roster position that starts with the skill, and that the
   Sevens composition actually fields. Throw Team-mate uses an Ogre Blocker
   and a Gnoblar, not a granted Human.
2. **Rules-valid advancement** — the position could legally develop it (the
   skill's category is in its primary or secondary access). Granting Block to
   a Human Lineman is fine; a real coach could develop exactly that player.
3. **Reasoned grant** — anything else needs a written isolation reason
   explaining why the native fixture could not be used.

`grantLegality()` decides which applies, and the gate rejects an *implausible*
grant (a Mutation on a Human, a trait nobody advances into) unless a reason is
recorded. Where no fielded position owns a skill at all, the grant is recorded
as `forced` and reported — so adding that position to a composition later
shows up as an improvement.

The sandbox shows all of this per placement, so you can see at a glance
whether the players on the pitch could exist.

---

## Visual regression

Screenshots are a **presentation** contract, not a gameplay assertion. Every
visual case asserts the semantic state first and compares pixels second: a
diff that fails after a passing state assertion means the look changed; the
other order means nothing.

Stability comes from pinning, not waiting:

- viewport, locale, timezone and device scale are pinned in
  `playwright.config.ts`;
- CSS animation and transitions are zeroed, then Phaser's tweens are
  **completed** (not merely killed — a killed loop rests wherever it was) and
  the game loop is put to sleep;
- pitch baselines clip to the playing surface, because the dugouts and turn
  indicator below it change with the drive and are their own contract;
- only documented volatile regions are masked.

Baselines live beside the specs in `e2e/visual/__screenshots__/` and are
committed. **A normal run never writes one.** Updating is explicit and
reviewed:

```bash
pnpm e2e:update-snapshots      # the only command that writes baselines
git diff --stat e2e/visual/__screenshots__   # review the images like code
```

CI never passes `--update-snapshots`; a failed visual case uploads its
actual, expected and diff images as artifacts.

---

## The regression policy

**Every confirmed gameplay bug gets a deterministic case that fails before the
fix and passes after it.** A fix without one is a fix that can silently come
undone.

1. Reproduce it as a case *first*, and watch it fail. A case written after the
   fix has never proved anything.
2. Give it a regression id and a one-line summary of the original failure:

   ```ts
   regression: {
     id: "BUG-2026-07-blitz-followup",
     summary: "a Blitz follow-up consumed the whole movement allowance",
     reportedAt: "2026-07-21",
     uiBoundary: false,
   }
   ```

3. Run it at the **lowest sufficient layer**. A rules bug belongs in the
   engine lane, where it costs milliseconds.
4. Set `uiBoundary: true` when the defect involved canvas or DOM input,
   overlays, rendering, scene transitions, or anything else that only exists
   in the browser. The schema then **requires** the `browser` layer, and
   validation fails the case without it — a click-mapping bug cannot be
   guarded by an engine-only test.
5. The id stays attached forever, through fixes and reorganisation, so
   `pnpm e2e:case BUG-…` and `pnpm e2e:replay BUG-…` keep finding it.

---

## Online play

`pnpm e2e:online` starts the Firebase auth and Firestore emulators, builds
the app in `e2e-online` mode, and runs host/guest journeys in two browser
contexts — two genuinely separate coaches whose only shared state is the
emulator, so anything one sees of the other really did travel through the
backend.

Everything runs against `demo-bloodbowl`, a Firebase *demo* project: the
emulators serve it with no credentials and the SDK refuses to reach a real
backend for it. There are no secrets and nothing to configure.

It is opt-in because it costs a second build and the emulators. A plain
`pnpm e2e` never registers the project, so it cannot fail against a server
that was never started. CI runs it on its own schedule, and its coverage
merges into the same report as every other lane.

## CI

`.github/workflows/e2e.yml` runs the engine project as one job, shards the
browser project, and runs the visual project separately. Chromium is cached on
the pinned Playwright version. Blob reports from every shard merge into one
HTML report; coverage fragments merge into one gap report.

The baseline currently records **zero** gaps: every uncovered inventory entry
is a reviewed exclusion instead. `pnpm e2e:coverage:diff` therefore fails on
any new gap at all.

---

## Adding a case

1. Write it in `src/testing/cases/<section>.ts` — the module named after the
   matching `__tests__/headless/<section>.test.ts` (or a new module named
   after the section, if none exists) — using the helpers in `helpers.ts`.
   Export it from that module's array and add the array to
   `src/testing/cases/index.ts`'s `AUTHORED_CASES` list if it is a new module.
2. Prefer a native roster fixture; if you must grant, write the reason.
3. Give each materially different outcome its own variant, and find its seed
   with `pnpm e2e:seeds` (or a short script using `findVariantSeed`).
4. Declare `layers`. Add `browser` only when the UI genuinely adds
   information — canvas input, a HUD dialog, a scene transition.
5. Run `pnpm e2e:engine`, then `pnpm e2e:coverage` to see what it closed.
