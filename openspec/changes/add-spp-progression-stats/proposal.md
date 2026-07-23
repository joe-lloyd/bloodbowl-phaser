# Proposal: add-spp-progression-stats

## Why

Players already have dormant `spp` and `level` fields, but matches do not record attributable SPP actions, league fixtures do not run an MVP/allocation step, and saved teams cannot spend SPP on 2025 advancements. This change makes progression-enabled matches count while keeping friendlies unchanged.

## What Changes

- Add a match setting that explicitly enables league progression. Disabled/friendly matches never award SPP or persist progression.
- Record player participation and every standard SPP action from engine events: accurate-pass completions, both Throw Team-mate awards, interceptions, block-action casualties, touchdowns, and MVP.
- Add the missing attributable events without scraping notification text. A block casualty is recorded as soon as the casualty result is confirmed, before Regeneration or another recovery can erase the outcome.
- Add an end-of-match workflow where each coach nominates six players who played, maps them to 1-6, rolls a D6, reviews earned SPP, assigns concession-awarded touchdown SPP when applicable, and confirms the award.
- Enforce Star Player/Journeyman eligibility, concession rules, and only-once finalisation.
- Add the complete 2025 advancement system: all six advancement bands, random Primary two-candidate rolls, chosen Primary/Secondary skills, D8 characteristic choices/fallbacks, characteristic caps, Elite Skill surcharge, value increases, forced advancement at the characteristic threshold, and persistence.
- Present both teams' final statistics and the coach's progression actions in a post-match React UI.

## Capabilities

### New Capabilities

- `match-stats`: Headless-safe, attributable per-player match statistics and SPP eligibility.
- `player-progression`: 2025 SPP calculation, advancement rolls/choices, player mutation, value changes, and persistence.
- `post-match-summary`: End-match nomination, roll, assignment, review, confirmation, and advancement UI.

### Modified Capabilities

None.

## Impact

- New progression and match-stat domain modules, events, tests, and post-match UI.
- `Player` gains additive progression/access metadata with migration defaults for existing teams.
- Team selection and online lobby settings gain a progression-enabled option.
- Touchdown events name the scorer; pass resolution names valid completions; Throw Team-mate and casualty resolution emit attributable outcomes.
- The existing team repository persists confirmed progression. No destructive schema migration is required.
- Core turn resolution remains unchanged and headless play remains DOM-free.
