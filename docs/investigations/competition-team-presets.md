# Competition team presets, copies and variants

Investigation, November 2026. Nothing here is decided. It sets out what the app
does today, the options, and the questions Joe has to answer before any of
this becomes an OpenSpec change.

The ask: a "Build a team" link from league or tournament setup (or from a
competition's team entry) that opens the Team Builder with that competition's
rules already applied, such as starting cash and progression type. Separately,
should a coach own one base team with league, tournament and exhibition
variants, or make independent copies and edit each one?

## Summary

- **Presets can ship on their own.** A preset only fills in a new team. It does
  not change how an existing team is identified, so it does not depend on the
  copies-or-variants choice.
- **The current model already has one team record per competition.** A team
  may be in only one active league or tournament at a time
  (`Team.activeCompetitionId`). A coach who wants the "same" team in two events
  already needs two team records. What's missing is a quick way to make the
  second record, and protection for a league team from exhibition play.
- **Recommendation: presets first, then independent copies that remember their
  source** (a "copied from" label, no sync). Linked variants would cost far more
  and need propagation rules nobody has asked for yet. Revisit them only if
  coaches ask for changes to flow between versions.
- **Two isolation gaps exist on `main` today**, whatever Joe decides (see
  [Isolation](#how-competitions-stay-isolated)).
- **"Starting cash" is ambiguous in the current model.** Competitions store a
  team-value cap (`draftBudget`, default 1,200,000), not starting cash. Teams
  store `startingTreasury` (default 600,000). Joe has to choose what a preset
  sets (decision 3).

## Kinds of evidence

Each claim below is tagged:

- **[App]** checked in the code or specs at `main` 436bdaf, with a file reference.
- **[Workflow]** evidence about how coaches actually work. **This repo has none.**
  There is no user research, analytics or feedback log. The only workflow
  statement is the ticket itself: Joe wants a "Build a team" link that inherits
  competition rules.
- **[Domain]** general tabletop Blood Bowl practice, not research on this app's
  users: league teams usually persist and develop over a season, and
  tournament rosters are usually drafted fresh under each event's rules pack.
  This is background only and **does not show that coaches prefer copies or
  variants**.
- **[Assumption]** a reasoned guess that has not been verified.

## What exists today

### Teams

- **[App]** One `Team` record per team
  ([`src/types/Team.ts`](../../src/types/Team.ts)). It holds the roster, staff,
  treasury, record, advancement mode, pending development, match history and
  the single active competition.
- **[App]** It is stored in the owner's library, in localStorage and Firestore
  `users/{uid}/teams/{teamId}`. Any signed-in coach can read it and only the
  owner can write it ([`firestore.rules`](../../firestore.rules),
  `openspec/specs/shared-team-library`). Stored players keep only data that
  can't be derived (`openspec/specs/normalized-team-persistence`,
  [`teamPersistence.ts`](../../src/data/persistence/teamPersistence.ts)).
- **[App]** Draft or active state comes from `firstMatchPlayedAt`
  ([`teamLifecycle.ts`](../../src/game/rules/teamLifecycle.ts)). Draft teams
  allow free edits and double-price re-rolls. Active teams can't change roster
  type, buy re-rolls or buy Dedicated Fans.
- **[App]** Advancement mode (Matched Play, Advanced League, Sevens Skill
  Selection) is chosen in the builder. It is locked on first save and on
  competition entry, and **cannot change afterwards** (`setAdvancementMode`,
  `lockAdvancementMode`). So the only way to take a team into a competition with
  a different mode is a new team record.
- **[App]** Starting cash is `Team.startingTreasury`, default 600,000
  (`createTeam`). It can be edited in the builder until the first player is
  hired
  ([`TeamDetailsSection.tsx`](../../src/ui/components/TeamBuilder/TeamDetailsSection.tsx)).
  The rules checklist says the draft budget is 600,000 and that Matched Play
  events may raise it ([SEVENS_RULES.md](../SEVENS_RULES.md), D1 and MP1).
- **[App]** Players have identity (id, name, number, position), progression,
  injuries and career stats. **There is no per-player appearance field.** The
  only stored appearance is the team colours (`Team.colors`).
- **[App]** No copy or duplicate feature exists anywhere in `src/`.

### Competitions and where their rules live

- **[App]** League and tournament documents
  ([`src/competition/types.ts`](../../src/competition/types.ts)) store entrants
  as **references** (`ownerUid` + `teamId`) with cached display names, never a
  roster copy. A fixture launch fetches the live team, so development carries
  from one fixture to the next (`openspec/specs/league-builder`,
  `tournament-builder`).
- **[App]** Rules live in two fields on the competition:
  - `ruleset`: GW 2025 or the dated NAF rulings. It is fixed at creation and
    both local code and Firestore refuse changes (`competitionRulesKept`).
  - `rosterProfile`: optional, versioned
    `{ advancementMode, draftBudget, requireDevelopmentComplete }`
    ([`rosterRules.ts`](../../src/competition/rosterRules.ts)), snapshotted at
    creation. In the builder it is **off by default** behind a "Require an
    advancement mode…" checkbox
    ([`CompetitionBuilder.tsx`](../../src/ui/components/pages/CompetitionBuilder.tsx)).
- **[App]** `draftBudget` is compared against **team value**, not cash
  (`profileReasons`). Its default is 1,200,000.
- **[App]** The profile has no edit UI. Its `version` field says it is "bumped
  whenever an organizer edits the profile", but no code bumps it. Firestore
  rules protect `ruleset` but not `rosterProfile`, so an organizer's client
  could rewrite it.
- **[App]** One validator, `checkTeamCompatibility`, checks mode, team-value
  cap, roster legality, Insignificant, the Matched Play package and pending
  development. The entry UI and `createCompetition` both use it.

### How teams enter competitions

- **[App]** The organizer chooses every entrant on the create page, from their
  own library and other coaches' libraries. The competition is saved straight
  away as `status: "active"` with its fixtures
  ([`create.ts`](../../src/competition/create.ts)). **Coaches have no later
  registration or entry step.** A comment in `rosterRules.ts` mentions
  `addEntrantToCompetition`, which does not exist. The `draft` competition
  status exists in types and Firestore rules but only seeds use it.
- **[App]** The create page keeps its form in React state. Leaving the page or
  refreshing it loses the name, selected entrants and profile.

### Team Builder entry and return

- **[App]** Routes are `/build-team/new-team` and `/build-team/:teamId`
  ([`App.tsx`](../../src/ui/App.tsx)). A new team exists only in memory until it
  is saved, so refreshing `/build-team/new-team` starts again from scratch.
- **[App]** The builder reads only `postMatch`, `nextTeam`, `winnings-*` and
  `returnTo` from the query string. `returnTo` is accepted only when it matches
  `/leagues/<id>`, and only after a match
  ([`TeamBuilder.tsx`](../../src/ui/components/pages/TeamBuilder.tsx),
  `readSearch`). An ordinary save goes back to `/build-team`. Tournament pages
  and the create pages are never return targets.

### Exhibition play and progression

- **[App]** Local team selection lists every human-coached team in the library,
  including teams in an active competition, with no warning
  ([`TeamSelect.tsx`](../../src/ui/components/pages/TeamSelect.tsx)).
- **[App]** Progression for a non-fixture match is an opt-in checkbox labelled
  "League fixture — award SPP and enable player advancement", off by default.
  The online lobby has the same setting. Fixture launches always turn it on
  ([`CompetitionView.tsx`](../../src/ui/components/pages/CompetitionView.tsx),
  [`lobby.ts`](../../src/firebase/lobby.ts)).
- **[App]** With progression **off**, the results screen only adds a
  match-history entry to the stored team (`recordPlayedGames` in
  [`MatchResultsScreen.tsx`](../../src/ui/components/hud/MatchResultsScreen.tsx)).
  With it **on**, SPP, injuries, pending development and the active-team stamp
  are written to **the same record the league uses** (`confirmSpp` →
  `recordDevelopment` → `saveTeam`).

## How competitions stay isolated

What already keeps them apart:

1. A team is in at most one active competition (`activeCompetitionId`), and
   creating a competition refuses a team that already has one.
2. Each coach writes only their own teams, so an organizer can't edit an
   entrant's team.

Gaps on `main` (each is a candidate follow-up whatever Joe decides):

- **G1 [App]** `createCompetition` stamps `activeCompetitionId` only on the
  **organizer's own** teams (`if (ownerUid !== input.organizerUid) continue;`),
  because Firestore lets only the owner write a team. No other code path stamps
  another coach's team. So another coach's team **can** be entered in two active
  competitions, and both would develop the same record.
- **G2 [App]** An exhibition with the progression checkbox on writes
  development to a team that is mid-league. Even with it off, the league team
  gets an exhibition entry in its match history.

How a coach tells versions apart today **[App]**: by team name, the
advancement-mode pill and the draft/active pill on the Team Management card.
Nothing shows which competition a team is in, or where it came from.

## Journeys

### J1. New team for a competition

_Today_: the organizer sets up the league, finds the coach has no compatible
team, cancels (losing the form), opens Team Builder, picks the advancement mode
and starting cash by hand, saves, then starts the league setup again. A coach
who isn't the organizer has no entry step at all.

_With presets_: on league setup, "Build a team for this league" opens
`/build-team/new-team?…` with mode, cash and ruleset filled in and locked, and
a banner naming the competition. Saving returns to the setup page with the form
restored and the new team selectable.

### J2. Enter an existing team

_Today and with presets_: the team appears in the entrant list, marked
compatible or incompatible with every reason shown. This already works when a
profile is set. With no profile only legality is checked, so a mismatch in mode
or cash isn't caught.

### J3. Adapt a familiar team for another event

_Today_: impossible without retyping. The mode is immutable, and the team is
locked to its current competition until that competition completes.

_With copies_: "Copy for another event…" on the team card. Choose the target
(a competition preset, or "blank"). A new draft team opens in the builder with
the carry-over in the table below, named "Reavers (Spring Cup)" and labelled
"Copied from Reavers". The original is untouched.

_With linked variants_: "Add variant…" makes a variant under the Reavers base.
Editing shared identity (names, numbers, colours) on the base would show up in
every variant.

### J4. Exhibition without touching the league team

_Today_: safe only if the coach leaves the progression checkbox off and accepts
a match-history entry on the league team. Nothing warns them.

_With an exhibition guard (works under either model)_: selecting a team with an
active competition shows "In Autumn League: this game won't award SPP or
injuries", and the checkbox is disabled. Alternatively, offer "Play a copy
instead" (needs copies).

## Options compared

|                             | A. Presets only                                     | B. Independent copies (+ "copied from")                                                        | C. Linked variants of a base team                                                                                                                    |
| --------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| What it adds                | Competition context passed into the builder         | `copyTeam(source, target)` creating a new team id, plus an optional `copiedFrom` display field | A base team record and variant records with `baseTeamId`, plus rules for what each owns and what propagates                                          |
| Fits current model          | Fully: new teams are already separate records       | Fully: a copy is just another team, and competitions keep referencing team ids                 | Partly: competitions can reference a variant id, but every library, list, share view, validator and Firestore rule must learn the base/variant split |
| Isolation                   | Unchanged                                           | Strong: no shared state after the copy                                                         | Weaker by design: base edits reach every variant, so propagation rules decide what one competition can change in another                             |
| Recognition                 | Banner in the builder; competition pill on the card | Name suffix, "copied from" line, competition pill                                              | Variant tabs under a base: the clearest grouping, but a new concept                                                                                  |
| Rules link                  | Read from the competition at build time             | Same, applied to the copy                                                                      | Same, per variant                                                                                                                                    |
| Divergence                  | n/a                                                 | Allowed, expected                                                                              | Has to be handled: deaths, the Sevens Draft, hires and Expensive Mistakes change a variant's roster straight away                                    |
| Rough cost **[Assumption]** | 2–4 days                                            | 3–5 days                                                                                       | 2–3 weeks or more, plus migration and Firestore rules                                                                                                |
| Reversible later            | Yes                                                 | Yes: `copiedFrom` could seed variants later                                                    | Hard to unwind once coaches hold variant structures                                                                                                  |

**Does the existing model already allow something simpler?** Mostly, yes. Once
one-team-per-active-competition and immutable mode are in place, a coach
already needs one record per event. Copies make that cheap and keep the current
isolation. Variants add value only if coaches want changes to flow between
versions, and there is no evidence yet that they do **[Workflow: none]**.

### What a copy carries over or resets

Two copy purposes behave differently. Which ones to offer is decision 5.

- **Fresh draft for a new event**: same players as a starting point, then
  re-drafted under the target rules.
- **Exhibition snapshot**: the team as it stands, to play friendlies without
  touching the original.

| Field                                                                                       | Fresh draft                                                            | Exhibition snapshot         | Notes                                                                                                   |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Team name                                                                                   | Copied + event suffix                                                  | Copied + "(exhibition)"     | Editable                                                                                                |
| Colours, roster type, League / Favoured of                                                  | Carry                                                                  | Carry                       | Roster type has to match the target profile, if it limits that                                          |
| Player name, number, position                                                               | Carry                                                                  | Carry                       | **New player ids** **[Assumption]**: safer if any store keys data by player id; formations get remapped |
| Player appearance                                                                           | n/a                                                                    | n/a                         | No per-player appearance exists **[App]**                                                               |
| Roster list                                                                                 | Carry, re-priced and re-validated against the target                   | Carry                       | The fresh draft may go over budget, which the builder shows                                             |
| Treasury                                                                                    | Reset to target starting cash minus roster cost                        | Carry                       |                                                                                                         |
| Advancement mode                                                                            | Set by the target                                                      | Carry                       | The copy is a new record, so the immutable rule holds                                                   |
| SPP, level, advancements, characteristic increases                                          | Reset (decision 6)                                                     | Carry                       |                                                                                                         |
| Matched Play allocations, draft inducements                                                 | Only if the target is Matched Play with the same tier, otherwise reset | Carry                       |                                                                                                         |
| Injuries (incl. niggling, stat losses)                                                      | Reset (decision 6)                                                     | Carry                       |                                                                                                         |
| Pending development                                                                         | Never copied                                                           | Never copied                | It belongs to the source's match; resolve it on the source                                              |
| Re-rolls, Apothecary, staff, Dedicated Fans                                                 | Reset (draft purchase rules)                                           | Carry                       |                                                                                                         |
| W/D/L, touchdowns, casualties, career stats, played games, recorded fixtures, Draft history | Reset                                                                  | Reset                       | History stays with the source; `copiedFrom` links back to it                                            |
| `firstMatchPlayedAt`                                                                        | Reset, so the copy is a draft                                          | Reset or carry (decision 5) | Reset means draft rules, e.g. double-price re-rolls                                                     |
| `activeCompetitionId`                                                                       | Never copied                                                           | Never copied                |                                                                                                         |
| `computerCoached`, `seedMetadata`                                                           | Not copyable                                                           | Not copyable                |                                                                                                         |

Under linked variants the same table splits fields into base-owned (name,
colours, roster type, player identity) and variant-owned (everything else).
That leaves one open question variants can't avoid: **what happens to a base
player who has died or been drafted in one variant but is alive in another?**

## Rules: snapshot or live link

- **[App]** Today the competition's rules are snapshotted when it is created.
  The ruleset can't change. The profile has no edit path, though Firestore
  wouldn't stop one.
- **Proposal**: a preset reads the competition's stored rules each time the
  builder loads, so they are never copied into the URL as values when a
  competition id exists. The team keeps what it was built with (mode,
  `draftRuleset`, starting cash) plus a display-only
  `builtFor: { competitionType, competitionId, profileVersion }`.
  Entry validation is always run against the competition's **current** stored
  profile, which is the existing `checkTeamCompatibility` behaviour.
- **If organizers may later edit the profile** (decision 7): bump `version`,
  re-check every entrant at the next fixture launch, and show "Rules changed
  since this team was built (v1 → v2)" in the builder. Firestore should then
  protect `rosterProfile` the same way it protects `ruleset`.
- **Conflicting requirements**: a team can't satisfy two competitions with
  different modes, and the mode can't change. One-competition-at-a-time makes
  this moot for a single record; the answer is a second team (copy or preset).

## Builder context: cash, progression, refresh, return

Proposal for the Team Builder:

- **Receiving**: `/build-team/new-team?for=league:<id>` (or `tournament:<id>`).
  The builder loads the competition by id and applies `ruleset` →
  `draftRuleset`, `rosterProfile.advancementMode` → mode (locked), and the
  starting cash (decision 3) → `startingTreasury` (locked).
- **Organizer setup, before the competition exists**: there is no id yet. Carry
  the profile values in the query
  (`?mode=advanced-league&cash=600000&ruleset=gw-2025&returnTo=/leagues/new`),
  and have the create page save its form in `sessionStorage` and restore it on
  return. The alternative is to create the competition first in a `draft`
  (registration) status, which turns into the registration feature (decision 8).
- **Displaying**: a banner above the builder: "Building for **Autumn League** ·
  GW 2025 · Advanced League · Starting cash 600,000 · Team value cap
  1,200,000", with the locked fields marked "set by the competition".
- **Refresh**: everything comes from the URL plus the competition document, so
  a refresh rebuilds the preset. The unsaved roster is still lost, as it is
  today. An optional follow-up could save drafts automatically.
- **Return**: widen `readSearch` to accept `/leagues/<id>`, `/tournaments/<id>`,
  `/leagues/new` and `/tournaments/new`, and use `returnTo` after an ordinary
  save as well, not only after a match. Pass the new team id back
  (`?added=<teamId>`) so the setup page can pre-select it.

## Rough UX sketches

Organizer setup with a build link:

```
┌ Create league ─────────────────────────────────────────────┐
│ Name  [Autumn League        ]                              │
│ Rules (•) GW 2025  ( ) NAF 26 Sep 2026                     │
│ Roster rule profile [x]                                    │
│   Advancement mode [Advanced League ▾]  Starting cash [600,000] │
│ Entrants                                                   │
│   [x] Reavers (Human)        compatible                    │
│   [ ] Old Bones (Undead)     ✗ mode: Matched Play          │
│   [+ Build a team for this league]                         │
└────────────────────────────────────────────────────────────┘
```

Builder opened from a competition:

```
┌ Building for Autumn League ────────────────── [Back to league] ┐
│ GW 2025 · Advanced League (set by league) · Cash 600,000 (set) │
└────────────────────────────────────────────────────────────────┘
  Name [New Team]   Roster [Human ▾]   Mode [Advanced League 🔒]
  Treasury 600,000  ...                         [Save and return]
```

Copy (option B):

```
┌ Copy "Reavers" ────────────────────────────────────┐
│ For:  (•) Spring Cup (Matched Play, 600,000)       │
│       ( ) Exhibition snapshot                      │
│       ( ) Blank, I'll set the rules                │
│ Keeps: names, numbers, positions, colours          │
│ Resets: SPP, skills, injuries, treasury, record    │
│ New name [Reavers (Spring Cup)]                    │
│                          [Cancel]  [Copy and edit] │
└────────────────────────────────────────────────────┘
Team card: Reavers (Spring Cup) · Matched Play · Draft
           Copied from Reavers · In: Spring Cup
```

Variant chooser (option C, for comparison):

```
Reavers ▸ [Base] [Autumn League ●] [Spring Cup] [Exhibition] [+ Variant]
           Editing: Autumn League variant. Name changes apply to all variants.
```

## Recommendation

1. **Ship presets now (option A).** They don't depend on the copy decision.
2. **Close G1 and G2** separately. Both are isolation bugs on `main` today.
3. **Then independent copies with a `copiedFrom` label (option B).** They are
   cheap and reversible, and they keep today's guarantee that one competition
   can't change another's team.
4. **Defer linked variants (option C)** until coaches ask for changes to
   propagate between versions. `copiedFrom` keeps the lineage, so variants
   could be built from it later.

## Proposed acceptance criteria (presets + copies)

Presets:

- From league or tournament setup, "Build a team for this competition" opens
  the builder with the competition's ruleset, advancement mode and starting
  cash applied and locked, and a banner names the competition and those values.
- Refreshing the builder keeps the preset. Saving returns to the competition
  page (or the setup page with its form restored), with the new team listed as
  compatible and pre-selected.
- A preset team that breaks the profile can still be saved as a draft, shows
  the same reasons `checkTeamCompatibility` gives, and can't be entered.
- With no profile, the link applies only the ruleset, and the banner says the
  competition has no roster rules.

Copies:

- Copying a team makes a new team id. The source is unchanged, and nothing
  saved to the copy afterwards changes the source, or the other way round.
- Carry-over and reset follow the agreed table. Pending development and
  competition membership are never copied.
- The copy shows "Copied from <name>". The team card shows any active
  competition.

Isolation:

- An entrant owned by another coach can't be in two active competitions (G1).
- A team in an active competition can't gain SPP, injuries or development from
  a non-fixture match (G2, subject to decision 4).

## Follow-up tickets (bounded)

1. **Presets: builder receives competition context.** `?for=` query, banner,
   locked mode and cash, `returnTo` for leagues, tournaments and the create
   pages. Unit tests plus one browser test. _Depends on decision 3._
2. **Presets: setup pages link to the builder and restore their form.**
   sessionStorage restore and pre-selection of the returned team.
3. **G2: guard exhibitions for competition teams.** Warn and disable
   progression when `activeCompetitionId` is set (decision 4).
4. **G1: enforce one active competition for other coaches' entrants.**
   Design needed: the owner can't be written by the organizer, so either check
   by querying competitions that reference the team at entry, or have the owner
   stamp it on their next load.
5. **Team card shows the active competition.** Small display change.
6. **Copy team (option B).** `copyTeam` with the agreed table, new player ids
   and formation remap, `copiedFrom`, and UI from the team card. _Depends on
   decisions 2, 5 and 6._
7. _(Only if decision 7 is yes)_ **Editable competition profile.** Version
   bump, Firestore protection, re-validation at launch.
8. _(Only if decision 8 is yes)_ **Competition registration phase.** Coaches
   enter their own teams before fixtures are generated. This is the "team-entry
   flow" the ticket mentions; it doesn't exist today.

## Decisions for Joe

1. **Can presets ship before the copies-or-variants decision?** Recommended:
   yes.
2. **Copies or variants?** Recommended: independent copies with a "copied
   from" label, with variants deferred.
3. **What does "starting cash" mean for a preset?** Recommended: add a
   `startingCash` to the profile (default 600,000) that sets
   `Team.startingTreasury`, and keep `draftBudget` as the team-value cap.
   Alternatively, reuse `draftBudget` and change its default.
4. **May a team in an active competition gain progression from an exhibition?**
   Options: refuse, warn, or allow.
5. **Which copy purposes to offer** (fresh draft, exhibition snapshot, or
   both), and is an exhibition snapshot a draft or an active team?
6. **Does a fresh-draft copy reset skills, SPP and injuries?** Recommended:
   yes, in line with drafting fresh for an event **[Domain]**.
7. **May organizers edit a competition's roster profile after creation?**
8. **Is a coach-side registration phase in scope**, or does the organizer keep
   choosing every entrant?
