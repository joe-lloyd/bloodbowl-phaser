## Context

`src/data/scenarios.ts`'s `chain-push` scenario sets no `team1Roster`/`team2Roster`, relying on whatever caller defaults to. `createHeadlessGame` (`src/headless/createHeadlessGame.ts`) defaults unset rosters to `RosterName.HUMAN`, so the headless test suite has always exercised plain chain-push correctly. `SandboxScene.loadScenario` (`src/scenes/SandboxScene.ts`) behaves differently: it only swaps a side's roster when the scenario's `setup.team1Roster`/`team2Roster` is set and differs from the sandbox's *current* team roster — otherwise it leaves whatever team is already loaded in the scene untouched. Combined with `SandboxScene.init()`'s no-args default of two Black Orc teams (Grab by default), a coach who opens the sandbox fresh (or has previously loaded any Black Orc scenario) and then loads the plain `chain-push` scenario keeps seeing Black Orcs with Grab, because nothing tells the scene to swap back.

Separately, that same no-args default — Black Orc vs. Black Orc — is an identical mirror-match, which the user flagged as making it hard to tell the two sides apart without hovering over individual players, and is the wrong pairing regardless (Human vs. Orc was requested).

## Goals / Non-Goals

**Goals:**
- Make the `chain-push` scenario deterministically Human-vs-Human (no Grab, no skill modifiers) regardless of the sandbox's current roster state, by pinning its roster explicitly — the same convention already used for the Grab-specific scenarios.
- Make the sandbox's fallback default (no scenario, no explicit teams passed) Human vs. Orc, never a mirror-match, so the two sides read at a glance.

**Non-Goals:**
- Changing `SandboxScene.loadScenario`'s roster-swap logic (only swap when the scenario specifies a roster) — the fix is to have `chain-push` specify one, not to change when swaps happen. Other unpinned scenarios are out of scope for this change; if they surface the same complaint later, they can be pinned individually following this same pattern.
- Changing `createHeadlessGame`'s default roster (already Human, already correct).
- Changing Black Orc, Human, or Orc roster templates.

## Decisions

- **Pin `chain-push`'s roster instead of changing swap logic.** Pinning is a one-line, scenario-local fix consistent with how the three Grab scenarios already pin `RosterName.BLACK_ORC` — it makes `chain-push` self-describing and immune to whatever roster the sandbox happened to have loaded before, without touching shared scene logic that other scenarios rely on.
- **Sandbox no-args default becomes Human (team1) vs. Orc (team2), not Black Orc.** Orc (not Black Orc) has no default Grab, matches the user's explicit request, and — being a different roster than Human — guarantees the default is never a mirror-match.

## Risks / Trade-offs

- [Other unpinned scenarios in `src/data/scenarios.ts` could exhibit the same stale-roster symptom in the sandbox] → out of scope here; this change fixes the one scenario the user reported and documents the pinning pattern so it's easy to repeat.
