## Why

The model contains an inducement name catalog and teams can buy an apothecary, but there is no pre-match inducement flow and no in-match Apothecary decision. Blood Bowl Sevens changes Extra Team Training, bans Star Players, modifies Prayers to Nuffle outside Advanced League play, and gives Apothecaries Sevens-specific KO and casualty patch-up outcomes.

## What Changes

- Add a pre-match inducement budget and selection flow shared by local, competition, online, and headless matches.
- Apply the Sevens catalog restrictions: 0–8 Extra Team Training at 150,000 gold each, no Star Players, and reroll Prayers to Nuffle results 10–13 unless the match uses Advanced League rules.
- Persist purchased and free inducements for their correct duration and expose their use through deterministic decisions.
- Offer an owned Apothecary immediately after an eligible KO or casualty, once per match.
- For an on-pitch KO, let the Apothecary leave the player on the pitch Stunned; for a crowd KO, move the player to Reserves.
- For Badly Hurt, Seriously Hurt, or Dead, roll a D6: 4+ moves the player from Casualties to Reserves, while 1–3 leaves the original result unchanged.
- Keep browser, online, autosave, and headless state deterministic across pending decisions and resumes.

## Capabilities

### New Capabilities
- `sevens-inducements`: pre-match budgeting, catalog limits, temporary inventory, Prayers handling, and deterministic use of Blood Bowl Sevens inducements.
- `sevens-apothecary`: the once-per-match decision and Sevens KO/casualty patch-up outcomes.

### Modified Capabilities

## Impact

- Models: inducement definitions, match settings/state, competition rule profiles, save serialization, and online snapshots.
- Pregame UI/protocol: team-value comparison, inducement selection, validation, lobby settings, and headless commands.
- Match flow: injury/KO operations, decision service, dugout placement, announcements, and match log.
- Rules: Extra Team Training pricing/limit, Star Player exclusion, Prayers rerolls, Apothecary eligibility and consumption.
- Tests: seeded inducement, KO, crowd, casualty, resume, and online ownership cases.
