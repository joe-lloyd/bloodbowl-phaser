## Context

`TeamBuilder` gates saving on `team.players.length >= 7` and otherwise allows any edit at any time. `TeamManagement` carries publish/unpublish buttons backed by `sharedTeamRepository`, which writes a full `Team` copy into a `sharedTeams` collection with a `publishedAt` timestamp; `SharedTeamBrowser` lists those copies, and `CompetitionBuilder` picks entrants from them with `source: "shared" | "local"`.

Two separate problems live here. The first is that nothing in the model knows a team has played, so no rule can depend on it. The second is that publish exists to solve a visibility problem — "let other coaches see my team" — by copying, when the real requirement is read access. Firestore rules can express "any authenticated coach may read `users/{uid}/teams/{teamId}`, only the owner may write" directly. Deleting the publish path removes a collection, a repository, a browser page, two buttons, a drift problem, and the `"shared" | "local"` branch in competition entry. That is the ruthless simplification: the same capability with substantially less code.

The advancement UI already exists as `AdvancementForm` and `SkillSelectors` inside `PostMatchProgression.tsx`, coupled to that screen's state. Extracting it is what makes a development page cheap.

## Goals / Non-Goals

**Goals:**
- The model knows whether a team has played, and the rules follow from it.
- Other coaches can see a team without anyone publishing anything.
- A coach can spend SPP and read a player's record whenever they like.
- Less code than before, with no capability lost.

**Non-Goals:**
- Full inducement, journeyman hiring, and treasury flows for league play. Those are a separate body of rules; this change covers the purchasing constraints named in the report (double re-rolls, no Dedicated Fans) and the framework to add the rest.
- Redesigning the team builder's visual layout.
- Changing advancement rules — `player-progression` owns those and is unchanged.

## Decisions

**1. Lifecycle is derived from a recorded fact, not a manual toggle.**
`Team.firstMatchPlayedAt?: number` is stamped when the team completes its first match. `mode` is derived: absent means draft, present means active. A derived mode cannot be set inconsistently, and it answers "when did this team become active" for free. Alternative considered: an explicit `status: "draft" | "active"` the coach or the code sets. Rejected — two sources of truth for the same fact, and it invites a "reset to draft" affordance that should not exist.

**2. Edit legality is one predicate table, consulted by both the builder and the manager.**
A single `canEdit(team, operation)` returns allowed/refused-with-reason for each operation: rename team, change roster type, add player, remove player, buy re-roll, buy Dedicated Fans, buy apothecary, buy coaching staff. Both UIs consult it and render refusals from the same reasons. Alternative considered: scattering `if (team.mode === "draft")` through the builder. Rejected — the rules would drift between the two screens, which is how the current code got here.

**3. Pricing is a function of mode, expressed once.**
`priceOf(team, item)` returns the roster price in draft and the active-team price in active mode — double for re-rolls, unavailable for Dedicated Fans. The UI shows the price it will actually charge, so a coach never sees one number and pays another.

**4. Publish is deleted, not deprecated.**
`sharedTeamRepository`, the `sharedTeams` collection, `SharedTeam`, and the publish/unpublish UI are removed. Firestore rules grant authenticated read on any coach's teams and owner-only write. `SharedTeamBrowser` becomes a browser over coaches and their teams, reading the real documents. Competition entry stores a team reference (which `normalize-cloud-data-model` introduces), so `source: "shared" | "local"` collapses to one path.

Existing `sharedTeams` documents are migrated by pointing any competition entrant that references one at the underlying owner/team pair, then deleting the collection. A shared document whose underlying team no longer exists keeps its cached display data on the entrant so historical fixtures still render.

**5. The development page reuses the extracted advancement form.**
`AdvancementForm`/`SkillSelectors` move to a shared component consumed by both the post-match screen and the development page. The page shows characteristics with their advances marked, skills split into starting and gained, injuries, SPP available and spent, and career statistics.

**6. Spending SPP outside a match writes through the normal team save.**
An advancement applied on the development page goes through `applyAdvancement` and `saveTeam`, exactly as the post-match screen does. No second write path, and an active team's advancement is legal by construction because advancement is not a purchase.

## Risks / Trade-offs

- **[Locking teams after their first match will surprise coaches mid-experiment]** → Draft mode covers the whole pre-first-match period, and the first match is an explicit act. The refusal messages name the rule and the mode, so the constraint is legible rather than mysterious.
- **[Making all teams readable by any authenticated coach is a visibility change]** → It is the stated intent, and it matches what publishing was being used for. Teams contain no private data beyond names the coach chose. Worth confirming with the user before the rules change ships, since it cannot be quietly undone once other coaches have linked to teams.
- **[Deleting `sharedTeams` is irreversible]** → Migration runs first and is verified against every competition that references a shared team; the collection is deleted only after entrants have been repointed.
- **[Partial purchasing rules could read as complete]** → The page states which active-team rules are enforced, so a coach is not led to believe inducements and treasury are modelled when they are not.
- **[Overlap with `normalize-cloud-data-model`]** → That change introduces team references and career statistics; this one consumes both. Sequence it after, or stub the reference type and the career figures if it lands first.

## Migration Plan

1. Add `firstMatchPlayedAt` and stamp it at post-match confirmation; existing teams with recorded matches are stamped by a backfill, and teams with no history stay draft.
2. Add the `canEdit` table and `priceOf`, and route both UIs through them.
3. Extract the advancement form; add the development page.
4. Add Firestore read rules for other coaches' teams.
5. Repoint competition entrants from shared documents to owner/team references.
6. Remove the publish UI, `sharedTeamRepository`, and `SharedTeam`; delete the `sharedTeams` collection.

Rollback is available through step 4; from step 5 onward the shared collection is being dismantled, so steps 5–6 ship together after the migration is verified.

## Open Questions

- Should a team ever be returnable to draft — for instance a team whose only match was abandoned? Proposed: no, and abandoned matches simply never stamp `firstMatchPlayedAt`.
- Which further active-team rules should be enforced now versus deferred: apothecary purchase, coaching staff, treasury and gate income, journeyman hiring? The report names re-rolls and Dedicated Fans explicitly; the rest need the user's call.
