# Tasks: add-spp-progression-stats

## 1. Rules contract and player migration

- [x] 1.1 Add progression-enabled match settings for local and online matches, defaulting to disabled for friendly safety.
- [x] 1.2 Add Primary/Secondary access, player kind (roster/Journeyman/Star), advancement records, and characteristic-increase counters to `Player`.
- [x] 1.3 Copy access on player creation and hydrate safe defaults/access from roster templates when older saved teams load.

## 2. Attributable engine outcomes

- [x] 2.1 Add scorer attribution to `Touchdown`.
- [x] 2.2 Emit `PassCompleted` only after an Accurate Pass is directly caught by a team-mate.
- [x] 2.3 Emit a safe Throw Team-mate landing outcome with Superb Throw attribution.
- [x] 2.4 Emit `PlayerCasualtyInflicted` when an Injury roll confirms a casualty, retaining block/special/dodge/crowd provenance through recovery.
- [x] 2.5 Track participation and preserve the existing attributed interception event.

## 3. Match stats and SPP finalisation

- [x] 3.1 Implement headless-safe `MatchStats` for completions, Throw Team-mate awards, interceptions, eligible casualties, touchdowns, MVPs, participation, blocks, yards, and injuries.
- [x] 3.2 Mount one tracker in browser and headless engine bootstraps and expose immutable summaries.
- [x] 3.3 Implement SPP calculation and Star Player/Journeyman eligibility.
- [x] 3.4 Implement valid six-player MVP nomination + seeded D6 award, awarded-touchdown assignment, and only-once confirmation.
- [x] 3.5 Test exact award values, block-only casualty credit, recovery-independent credit, no-friendly awards, and finalisation idempotency.
- [ ] 3.6 Carry an actual concession result into finalisation so the conceding side loses match SPP/MVP and the opponent receives a second MVP.

## 4. Advancement rules

- [x] 4.1 Add the exact six-row 2025 advancement cost table and forced-advancement threshold.
- [x] 4.2 Add the exact 12-skill category roll table, two-candidate random Primary flow, duplicate/incompatible rerolls, and mandatory identical result.
- [x] 4.3 Add chosen Primary/Secondary validation and the four Elite Skills' +10k surcharge.
- [x] 4.4 Add D8 characteristic choices, skill fallback at spent characteristic cost, twice-only/max caps, and exact value increases.
- [x] 4.5 Apply advancements once, deduct SPP, update level/history/stats/player value, and test all bands and failure cases.

## 5. Post-match UI and persistence

- [x] 5.1 Show the end-match summary only for progression-enabled matches, with both teams' player lines and team totals.
- [x] 5.2 Add MVP nomination/roll and awarded-touchdown assignment UI, then confirm SPP to the roster.
- [x] 5.3 Add advancement UI for random Primary, chosen Primary/Secondary, and characteristic improvement/fallback.
- [x] 5.4 Persist confirmed changes through `TeamRepository`; online clients persist only their owned team and render the host tally.

## 6. Verification

- [x] 6.1 Run focused progression/stat tests, the full test suite, typecheck/build, and lint.
- [ ] 6.2 Verify a browser fixture from enabled match selection through MVP, SPP confirmation, advancement, and reload.
