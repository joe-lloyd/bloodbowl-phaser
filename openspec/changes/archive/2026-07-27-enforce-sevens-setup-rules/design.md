# Design: enforce-sevens-setup-rules

## Context

`SetupValidator` takes `SetupConfig { minPlayers: 7, pitchWidth: 20, pitchHeight: 11 }` and enforces three things: inside the team's x-range (0-6 or 13-19), no duplicate squares, and at least seven placed. `canConfirmSetup(placedCount, availableCount)` returns true at seven placed or zero remaining.

The geometry the rules need already exists, but only as literals in the renderer. `Pitch.drawWideZones` shades rows y 0-1 and y 9-10; `FormationManager` uses `losX = isTeam1 ? 6 : 13`. So Wide Zones are y 0-1 and y 9-10, Centre Field is y 2-8, the Lines of Scrimmage are columns x 6 and x 13, and the neutral zone between them is x 7-12. Those numbers need to become shared constants rather than being restated in a validator.

## Goals / Non-Goals

**Goals:**

- One rule set, applied on placement and on confirm, shared by browser, online and headless.
- Refusals that say which restriction was broken.
- Correct behaviour for a team that cannot field enough players to satisfy the rules.
- Kicking-team-first ordering.

**Non-Goals:**

- Formation presets beyond making the existing ones legal.
- Drag-and-drop or setup UI redesign (`setup-player-inspection` in `overhaul-match-announcements` covers the info panel).
- Anything about what happens after the kick.

## Decisions

### 1. Zone geometry becomes shared constants

Add to `GameConfig`: `WIDE_ZONE_ROWS` (top y 0-1, bottom y 9-10), `CENTRE_FIELD_ROWS` (y 2-8), `LINE_OF_SCRIMMAGE_X` (`{ team1: 6, team2: 13 }`), and derive the neutral zone and each team's setup range from them. `Pitch.ts` draws from these instead of its own literals, so the shading and the rules can never disagree. Alternative — keep the validator's own numbers — rejected: the pitch already lies to the coach today, and duplicating the numbers guarantees it again.

### 2. Restrictions are a list of named predicates, not a boolean

`validateFormation` returns `SetupRestriction[]` where each entry is `{ id, satisfied, message, satisfiable }`:

- `setup-area` — every player within own End Zone through own Line of Scrimmage
- `neutral-zone` — no player between the Lines of Scrimmage
- `wide-zone-limit` — at most one player per Wide Zone
- `line-of-scrimmage` — at least three in Centre Field adjacent to own Line of Scrimmage
- `max-seven` — at most seven placed

The UI renders the unsatisfied ones as a live checklist; a refused placement reports the first predicate the candidate square would break. This is what makes "refusals name the rule" one implementation rather than a message per call site.

### 3. `satisfiable` drives the short-handed relaxation, computed from available players

A restriction is unsatisfiable when no legal arrangement of the team's available players could satisfy it — in practice, `line-of-scrimmage` with fewer than three available players. `canConfirmSetup` becomes "every satisfiable restriction is satisfied and every available player up to seven is placed". This keeps the relaxation a property of the rules rather than a special case bolted onto the confirm button, and composes cleanly with `short-handed-setup` from `fix-drive-transition-lifecycle`, which owns the "all available placed" half of the condition.

`max-seven` and `wide-zone-limit` are always satisfiable, so a short-handed team is still bound by them — which is the behaviour the rulebook describes.

### 4. Sequential setup driven by the existing setup phase, not a new phase

`SetupManager` gains a `currentSetupTeam`, initialised to the kicking team and advanced on confirm; the phase ends when both have confirmed. Placement is refused for the team that is not current. Alternative — a `SETUP_KICKING` / `SETUP_RECEIVING` phase pair — rejected: it doubles the phase handling and the online mirror for what is a single field.

### 5. Concession reuses the abandon path

The reduced-team concession offer is presented at the start of that team's setup and routes into the existing forfeit/abandon match-end path with a concession reason, rather than introducing a second way for a match to end.

## Risks / Trade-offs

- [Existing built-in formations become illegal] → `FormationManager`'s presets are corrected as part of this change and covered by a unit test asserting each preset passes `validateFormation`.
- [Saved in-progress matches were set up under the old rules] → validation runs on placement and confirm, not on load; a resumed match is never re-validated, so no saved match breaks.
- [Sequential setup lengthens a local hot-seat drive] → the kicking team's formation stays visible while the receiving team places, which is also what the rules intend.
- [Headless scenarios seeded with now-illegal formations] → seeded scenarios place players directly rather than through setup validation, so they are unaffected; any that do go through setup are fixed in this change.

## Migration Plan

1. Constants into `GameConfig`; `Pitch.ts` reads them. No behaviour change.
2. `SetupRestriction[]` from `validateFormation`, with only the existing rules expressed as predicates. No behaviour change.
3. Add the new predicates one at a time, each with unit tests, then wire the live checklist and refusal messages.
4. Sequential setup ordering.
5. Reduced-team relaxation and the concession offer.

No persisted-data migration.

## Open Questions

- Whether a player placed in a Wide Zone square adjacent to the Line of Scrimmage should be highlighted as "not counting" toward the three (lean: yes, it is the most common way to build an illegal formation by accident).
- Whether the receiving coach should be able to see the kicking formation before deciding to concede (lean: yes, the concession is offered at the start of their setup).
