## Why

Setup validates almost nothing. `SetupValidator` checks that a square is inside the team's half (x 0-6 or x 13-19), that no two players share a square, and that at least seven players are placed. None of the Sevens set-up restrictions exist: a coach can stack all seven players in a Wide Zone, leave the Line of Scrimmage completely empty, or set up eight players. The pitch already draws the Wide Zones and the Lines of Scrimmage, so the board tells the coach there are rules that the game does not enforce. There is also no way for a team reduced to three or fewer players to concede before setting up, which the rules explicitly allow.

## What Changes

- **The setup area is enforced.** Each team SHALL set up fully within the area between its own End Zone and its own Line of Scrimmage, and no player SHALL be placed in the area between the two Lines of Scrimmage.
- **Wide Zones are limited to one player each.** A team SHALL set up at most one player in each Wide Zone — at most two players in Wide Zones in total, one per zone.
- **The Line of Scrimmage must be manned.** A team SHALL set up at least three players in Centre Field squares directly adjacent to its own Line of Scrimmage.
- **Seven is the cap, not the target.** A team SHALL set up at most seven players; any available player not chosen for the drive SHALL be placed in the Reserves box until the start of the next drive.
- **The kicking team sets up first.** Setup SHALL run in order — the kicking team places and confirms, then the receiving team — rather than both at once.
- **Refusals name the rule.** An illegal placement or an attempt to confirm an illegal formation SHALL be refused with the specific restriction stated, and the outstanding restrictions SHALL be visible while placing.
- **A short-handed team can concede or play on.** A team reduced to three or fewer available players SHALL be offered a penalty-free concession before setting up; if it plays on, its available players SHALL be set up on the Line of Scrimmage and the restrictions it cannot satisfy SHALL NOT block confirmation.

## Capabilities

### New Capabilities
- `sevens-setup-rules`: the Blood Bowl Sevens set-up restrictions — setup area, the neutral zone between the Lines of Scrimmage, one player per Wide Zone, three adjacent to the Line of Scrimmage, a maximum of seven players — enforced on placement and on confirmation, with reduced-team relaxation and penalty-free concession.

## Impact

- Validation: `src/game/validators/SetupValidator.ts` — the zone check gains Wide Zone, Line of Scrimmage and neutral-zone rules; `validateFormation` returns the specific unmet restrictions; `canConfirmSetup` becomes "all restrictions satisfied, or the team cannot satisfy them".
- Zone geometry: `src/config/GameConfig.ts` — Wide Zone rows (y 0-1 and y 9-10), Line of Scrimmage columns (x 6 and x 13), Centre Field rows (y 2-8) and the neutral zone (x 7-12) become named constants shared by `src/game/elements/Pitch.ts`, which currently hard-codes the same numbers for drawing.
- Setup flow: `src/game/managers/SetupManager.ts` (seven-player cap, kicking-team-first ordering, surplus players to Reserves), `src/game/controllers/handlers/SetupPhaseHandler.ts`, `src/game/controllers/PlayerPlacementController.ts`.
- Formations: `src/game/managers/FormationManager.ts` — the built-in formations must be legal under the new rules.
- UI: `src/ui/components/hud/SetupControls.tsx` — outstanding restrictions listed while placing, refusal messages, the concede option for a reduced team.
- Concession: `src/services/GameService.ts` match-end path, reusing the existing abandon/forfeit route.
- Online and headless: `src/network/NetworkedGameService.ts` mirror, and the headless setup protocol in `src/headless/` must apply the same validation.
- Interacts with `short-handed-setup` from `fix-drive-transition-lifecycle`: that change defines completion as "all available players placed"; this change defines which placements are legal and when restrictions relax.
- Consumed by `implement-kickoff-event-table`: Solid Defence re-places players "following all the usual restrictions".
