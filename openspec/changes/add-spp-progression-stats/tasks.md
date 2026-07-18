# Tasks: add-spp-progression-stats

## 1. Attributable domain events

- [ ] 1.1 Add `PlayerCasualtyInflicted { attackerId, victimId, cause: "block" | "foul" | "crowd" }` to `src/types/events.ts` and emit it from `InjuryOperation`, `FoulOperation`, and `CrowdInjuryOperation` at the point the casualty is confirmed (keep the existing `UI_Notification`)
- [ ] 1.2 Add interception attribution to the pass/catch path (event or field on the existing interception result) so the intercepting player is identifiable
- [ ] 1.3 Add an end-of-match MVP step that rolls with the seeded RNG and emits `MvpAwarded { playerId, teamId }`
- [ ] 1.4 Headless test: a scripted block-casualty, an interception, and match end each emit the new events with correct attribution

## 2. Match stats accumulator

- [ ] 2.1 Define `PlayerMatchStats` (completions, deflections, touchdowns, casualties, interceptions, blocks, yards, injuries suffered) and a `MatchStats` accumulator holding `Map<playerId, PlayerMatchStats>`
- [ ] 2.2 Subscribe `MatchStats` to `Touchdown`, `PassCompleted`, `PlayerCasualtyInflicted`, interception, `PlayerMoved`, `MvpAwarded` (and any others needed) and increment the right player's counters
- [ ] 2.3 Mount the accumulator so it runs in both browser play and headless (engine-adjacent, no DOM); headless test: a full match yields a complete tally

## 3. SPP + advancement module

- [ ] 3.1 `progression.ts` constants: 2025 SPP award values and the advancement cost table (random/chosen primary & secondary, characteristic), verified against the rulebook
- [ ] 3.2 `sppFromStats(stats)` → SPP; apply to each player's `spp` at match end and record SPP earned this match
- [ ] 3.3 `advancementOptions(player)` (gated by unspent SPP) and `applyAdvancement(player, choice)` → updated `skills`/`stats`, recomputed `level`/`teamValue`/`cost`, SPP deducted; random-skill roll uses the seeded RNG
- [ ] 3.4 Idempotency guard so an advancement applies at most once per player per match
- [ ] 3.5 Unit tests (headless): SPP totals from a sample stat line, affordable/unaffordable option gating, a skill and a characteristic advancement, no double-apply

## 4. Post-match summary UI

- [ ] 4.1 Summary page: per-player stat lines + SPP earned for both teams, team totals (score, casualties, completions), MVP
- [ ] 4.2 Mark the coach's advanceable players and wire the advancement flow (open, choose, confirm) from the summary
- [ ] 4.3 Online: render the summary from the host's authoritative final tally so both coaches match

## 5. Persistence

- [ ] 5.1 Write confirmed progression back through `TeamRepository` (cloud + local); new player fields default so existing saved teams load unchanged
- [ ] 5.2 Online: each coach persists only their own team
- [ ] 5.3 Verify: play a match, confirm advancements, reload the saved team — added SPP, skills, and stat changes are present

## 6. Verification

- [ ] 6.1 Full test suite green; headless CLI still runs a match to completion in plain Node with stats accumulating
- [ ] 6.2 Manual browser pass: play to a touchdown + a casualty, reach the summary, advance a player, confirm persistence
