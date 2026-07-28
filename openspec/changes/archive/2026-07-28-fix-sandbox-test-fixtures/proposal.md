## Why

Two sandbox/test-fixture reports from the user:

1. The base `chain-push` headless scenario (`src/data/scenarios.ts`) doesn't pin a roster, so in `createHeadlessGame` it happens to default to Human (no Grab) — but when the same scenario is loaded through the sandbox UI, `SandboxScene.loadScenario` only swaps a team's roster when the scenario explicitly sets `team1Roster`/`team2Roster`. Since `SandboxScene.init()`'s own no-args default is two Black Orc teams (Grab by default), loading the unpinned `chain-push` scenario after the sandbox has defaulted (or after loading any Black-Orc scenario) leaves the coach staring at Black Orcs with Grab, unable to see plain three-square chain-push behavior in isolation.
2. `SandboxScene.init()`'s no-args default pits `RosterName.BLACK_ORC` against `RosterName.BLACK_ORC` — an identical mirror-match, and the wrong pairing besides (the user wants a *distinguishable* default: Human vs. Orc, not Black Orc). A same-team-vs-itself default makes it hard to tell who's on which side without hovering over individual players, and defeats the stated purpose of visually reviewing sandbox presentation.

## What Changes

- Pin `team1Roster: RosterName.HUMAN` / `team2Roster: RosterName.HUMAN` explicitly on the `chain-push` scenario in `src/data/scenarios.ts`, so it deterministically exercises plain (no-Grab, no-skill-modifier) chain-push resolution regardless of whatever rosters the sandbox currently has loaded. The existing Grab-specific scenarios (`chain-push-grab-open`, `chain-push-grab-boxed`, `chain-push-grab-second-link`) and their tests are unchanged.
- Change `SandboxScene.init()`'s no-args default teams from Black Orc vs. Black Orc to Human (team1) vs. Orc (team2, not Black Orc), so the sandbox's default matchup is never a mirror-match and the two sides are visually distinguishable without hovering.

## Capabilities

### Modified Capabilities
- `sandbox-rule-explorer`: add a requirement that the sandbox's default (no scenario loaded) matchup uses two different rosters — Human vs. Orc — so mirror-matches are never the default and sides are visually distinguishable.

## Impact

- `src/data/scenarios.ts` — `chain-push` scenario gains explicit `team1Roster`/`team2Roster: RosterName.HUMAN`.
- `src/scenes/SandboxScene.ts` — `init()`'s no-args default team construction changes from Black Orc/Black Orc to Human/Orc.
- `__tests__/headless/push-chain.test.ts` — no behavior change expected (Human was already the effective default there), but the scenario fixture assertion becomes explicit rather than incidental.
- `openspec/specs/sandbox-rule-explorer/spec.md` — new requirement documenting the no-mirror-match, Human-vs-Orc default.
