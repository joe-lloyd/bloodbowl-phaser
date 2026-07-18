# Design: add-spp-progression-stats

## Context

The engine is event-driven (a Phaser-free EventBus) and already exposes most of what SPP needs as domain events — `Touchdown`, `PassCompleted`, plus the pass/catch and injury paths. Two gaps: casualties surface only as a `UI_Notification` string, and interceptions/MVP have no attributed event. `Player` has dormant `spp: number` and `level: number` fields. Saved teams round-trip as JSON through `TeamRepository` (memory cache + background Firestore write at `users/{uid}/teams/{teamId}`, or a local repository when signed out). Headless play must keep working, so stat tracking cannot depend on the DOM.

## Goals / Non-Goals

**Goals:**

- Capture every SPP-earning action per player during a match, from domain events only.
- Compute SPP and apply advancement per the 2025 rulebook, mutating the player and persisting to the saved team.
- A clear post-match summary for both teams, with the advancement step reachable from it.
- Keep tracking engine-side and headless-safe; keep the summary/advancement UI in the React layer.

**Non-Goals:**

- League tables, schedules, or inducements — those belong to `add-leagues-and-tournaments`. This change persists per-player growth only.
- Star Players / mercenaries / special-rule SPP quirks beyond the core earning table (can extend the catalog later).
- Automatic advancement AI — the coach chooses/confirms; only the random-skill roll is automated.

## Decisions

### 1. A `MatchStats` accumulator that only subscribes to events

One class holds `Map<playerId, PlayerMatchStats>` and subscribes to the EventBus, mirroring the `add-sound-effects-suite` SoundSuite pattern (observe events, never touch engine internals). It lives engine-adjacent so headless runs accumulate stats without a UI. Alternative — incrementing counters inside operations/managers — rejected: it scatters bookkeeping through the rules code and re-couples concerns the codebase keeps separate.

### 2. Add attributable domain events rather than scrape notifications

`InjuryOperation`/`CrowdInjuryOperation`/`FoulOperation` emit a new `PlayerCasualtyInflicted { attackerId, victimId, cause }`; the pass/catch path emits interception attribution; an end-of-match step rolls and emits `MvpAwarded`. The stats layer binds to these. This is the **BREAKING** part (casualties become a real event, not just a toast), but it is the only way to attribute SPP correctly (the caser, foul assist, or crowd all award differently).

### 3. SPP + advancement as a pure module

`progression.ts` is pure functions: `sppFromStats(stats) → number`, `advancementOptions(player) → Option[]`, `applyAdvancement(player, choice) → Player`. No events, no DOM — unit-testable headless, and reusable by the UI. The 2025 SPP values and the advancement cost table (random primary / chosen primary / random secondary / chosen secondary / characteristic) are data constants here.

### 4. Advancement is an explicit, confirmed post-match step

Advancement mutates a player permanently, so it never auto-applies. The summary page surfaces who can advance; the coach opens each and confirms a spend. Random-skill rolls use the same seeded RNG service for reproducibility. Only after confirmation is the player written back.

### 5. Persist through the existing repository, additive fields only

Write-back reuses `TeamRepository.save` (sync cache + background Firestore). New per-player fields (career/match sub-stats) default to zero/empty so existing saved teams load unchanged — no migration. Progression is written per owning coach: in online play each side persists only its own team.

## Risks / Trade-offs

- [Casualty event is breaking for existing listeners] → grep shows casualties are notification-only today; the new event is additive and the notification stays, so no current consumer breaks in practice.
- [SPP mis-attribution in chains (foul assists, crowd surf, chain-push casualties)] → attribution rides `cause` on the event, decided at the point of resolution where the actor is known; covered by headless scenario tests.
- [Double-award across a snapshot/reconnect in online play] → stats accumulate on the host from authoritative events only; the guest renders the summary from the host's final tally, never its own count.
- [Advancement applied twice if the summary is revisited] → advancement is idempotent per player per match via a `advancedThisMatch` guard and only-once write.

## Migration Plan

Land the new events first (with the notifications retained), then the `MatchStats` accumulator, then the pure `progression` module with tests, then the summary UI, then persistence write-back. Each step keeps the suite green. No stored-data migration; new fields are optional with zero defaults.

## Open Questions

- Exact 2025 SPP values / advancement costs to hard-code (verify against the current rulebook during task 3).
- Whether career totals live on `Player` or a parallel `users/{uid}/teams/{teamId}` sub-collection (start on `Player`; revisit if docs get large).
- Whether MVP is a single random award or the 2025 three-nominations variant (start single; the event shape allows either).
