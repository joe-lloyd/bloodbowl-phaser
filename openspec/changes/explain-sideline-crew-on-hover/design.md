## Context

`getVisibleSidelineStaff(team)` is already the pure projection behind the rail: it caps each type (3 coaches, 4 cheerleaders, 1 apothecary, 3 fans) and returns `{ type, index, label, color }`. `Dugout.createStaffRail` turns each member into a two-shape container named `sideline_staff_<type>_<index>` and adds it to the dugout — with no `setInteractive` call anywhere.

The information panel is driven by `UI_ShowPlayerInfo`, typed as `Player` in `src/types/events.ts`, and consumed by `PlayerInfoPanel`. The dugout already emits it (line ~377) for players in the reserve/KO/casualty boxes, so the wiring pattern exists; what is missing is a subject that is not a player.

## Goals / Non-Goals

**Goals:**
- Answer "what is this figure?" in the place the coach already looks.
- Keep the explanation text in the pure staff projection so it is unit-testable and shared by any renderer.

**Non-Goals:**
- A new tooltip widget, hover card, or overlay — this reuses the existing panel.
- Making crew figures clickable, selectable, or draggable; they remain decoration that can be inspected.
- Changing how many figures are drawn or how staff affect rules.

## Decisions

### 1. A sibling info event, not a widened `Player` payload

Add `UI_ShowInfo` carrying a small discriminated subject — `{ kind: "player", player }` or `{ kind: "sidelineCrew", crew }` — and let `PlayerInfoPanel` switch on it, keeping `UI_ShowPlayerInfo` as the player path during migration. Alternative — widening `UI_ShowPlayerInfo`'s payload to `Player | SidelineCrewInfo` — rejected: every existing subscriber and emitter would have to narrow a union whose name says "player", and the panel would start rendering non-player subjects through a player-shaped contract.

`UI_HidePlayerInfo` already means "clear the panel" and needs no change.

### 2. The explanation lives in `sidelineStaff.ts`

`SidelineStaffMember` gains `name` (e.g. "Assistant Coach") and `effect` (e.g. "Adds +1 to your Brilliant Coaching roll on the kickoff table"), and the module exposes the team's true count per type next to the drawn count. That keeps the rules text in one pure, tested module instead of embedded in a Phaser element, and means the same strings can back a future team-management view. Alternative — strings in `Dugout.ts` — rejected: `Dugout` is a renderer, and the capped-count nuance is projection logic, not drawing logic.

### 3. Hover, with the hit area on the container

Each crew container gets a rectangle hit area sized to the drawn figure and `pointerover`/`pointerout` handlers that emit the show/hide info events. The `NO STAFF` label is drawn by the React board-label overlay rather than by Phaser, so its hover is handled on the DOM label with the same events; both paths converge on one payload builder so the two renderers cannot drift.

### 4. Inspection never disturbs selection

The crew hover only writes to the info panel. It does not change the selected player, the action mode, or any pitch highlight — the same contract player hover already follows — so a coach mid-activation can read the rail without losing their place. On `pointerout` the panel clears; it does not attempt to restore a previously inspected player, matching existing panel behaviour.

## Risks / Trade-offs

- [Two info events during migration could leave the panel showing a stale subject] → both events write the single panel subject slot, and the hide event clears it; the migration ends by folding the player emitters onto `UI_ShowInfo`.
- [Adding hit areas to decorative figures could intercept dugout drags] → the crew rail is a dedicated 180×150 region that the existing spec already requires not to overlap the interactive reserve/KO/dead grids, and the handlers are hover-only, taking no pointer-down.
- [Rules text drifting from the actual implementation] → the effect strings sit beside the counts they describe and are asserted by a unit test, and the kickoff-table effects they name are the ones implemented in `implement-kickoff-event-table`.
