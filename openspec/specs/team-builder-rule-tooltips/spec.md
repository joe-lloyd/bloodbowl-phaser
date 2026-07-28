# team-builder-rule-tooltips

## Purpose

Let a coach see what a listed skill/trait actually does while drafting a team, without already knowing the rulebook or leaving the Team Builder page.

## Requirements

### Requirement: Hovering a listed skill reveals its rule text
Wherever the Team Builder / draft page (`/build-team/:teamId`) lists a player's or player-template's skills or traits — the Available Hires table and the current-roster table — each skill/trait SHALL be presented as an individually hoverable name, and hovering it SHALL reveal that skill's full rulebook rule text.

#### Scenario: Hovering an available hire's skill shows its rule text
- **WHEN** a coach hovers a skill name listed for a player template in the Available Hires table
- **THEN** a tooltip appears showing that skill's full rulebook rule text

#### Scenario: Hovering a rostered player's skill shows its rule text
- **WHEN** a coach hovers a skill name listed for a player already on the roster
- **THEN** a tooltip appears showing that skill's full rulebook rule text

#### Scenario: Multiple skills are each independently hoverable
- **WHEN** a player or template has more than one skill
- **THEN** each skill name is a separate hover target showing only that skill's own rule text, not a combined list

### Requirement: Skill tooltips are keyboard-reachable
Each skill/trait name on the Team Builder / draft page SHALL be reachable by keyboard focus (e.g. `Tab`), and focusing it SHALL reveal the same rule text a mouse hover would, so a coach navigating without a mouse can still read what a skill does.

#### Scenario: Tabbing to a skill reveals its rule text
- **WHEN** a coach tabs to a skill name listed in the Available Hires table or the current-roster table
- **THEN** that skill's tooltip becomes visible, showing its full rulebook rule text
