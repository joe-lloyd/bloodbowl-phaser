## Why

Team management does not model the one thing that matters most about a Blood Bowl team: whether it has played yet. A brand-new team should be freely editable; a team that has taken the field is a living record with rules attached — re-rolls cost double after creation, Dedicated Fans can no longer be bought, and every change has to be legal for an active team. Today a team is editable in the same way forever, which quietly lets a coach rebuild a team mid-season.

Alongside that, the explicit publish step is friction without value. A coach publishes, then has to remember to re-publish after every match, and the shared copy drifts from the real team. What the coach actually wanted is simply: other people can look at my teams, nobody else can change them. And the page a coach most needs — spend this player's SPP, see their touchdowns and casualties — does not exist outside the post-match screen.

## What Changes

- **Teams have two lifecycle modes.** A team SHALL be in **draft** until it has played its first match, and **active** from then on. Draft teams SHALL be freely editable. Active teams SHALL only accept changes that are legal for a team in play.
- **Active-team purchasing rules apply.** For an active team, re-rolls SHALL cost double their roster price, Dedicated Fans SHALL NOT be purchasable, and players SHALL be hired at roster price up to the roster maximum. Draft-only edits — renaming the roster, changing the roster type, removing players freely, setting Dedicated Fans — SHALL be refused for an active team with the reason stated.
- **BREAKING**: publishing is removed. A coach's teams SHALL be readable by any authenticated coach and writable only by their owner, with no publish step and no shared snapshot. Competition entry SHALL reference the team directly.
- **A player development page.** Team management SHALL offer a per-player page showing that player's characteristics, skills, injuries, SPP, and career statistics, and SHALL let the coach spend available SPP on an advancement there — not only on the post-match screen.
- **Progression is visible in the roster.** The team view SHALL show which players have SPP available to spend and which must advance.

## Capabilities

### New Capabilities
- `team-lifecycle-modes`: a team is draft until its first match and active thereafter, with the edits allowed in each mode enforced.
- `player-development-page`: a per-player view of characteristics, skills, injuries, SPP, and career statistics, with SPP spending available outside the post-match flow.

### Modified Capabilities
- `shared-team-library`: publishing is removed; a coach's own teams are directly readable by other coaches and writable only by their owner, and competitions reference them without a shared copy.

## Impact

- **BREAKING**: the `sharedTeams` collection and the publish/unpublish flow are removed; existing shared documents are migrated to references and deleted.
- Types: `src/types/Team.ts` (lifecycle mode, first-match record), `src/competition/types.ts` (`SharedTeam` removed, `source: "shared" | "local"` collapses).
- Persistence: `src/firebase/sharedTeamRepository.ts` (removed), `src/firebase/cloudTeamRepository.ts` (read access for non-owners), Firestore security rules.
- UI: `src/ui/components/pages/TeamManagement.tsx` (publish controls removed, mode indication, per-player entry point), `src/ui/components/pages/TeamBuilder.tsx` (mode-aware purchasing), `src/ui/components/pages/SharedTeamBrowser.tsx` (becomes a coach/team browser), `CompetitionBuilder.tsx` entrant picking.
- Progression: `src/game/progression/progression.ts` reused by the development page; the advancement UI currently embedded in `PostMatchProgression.tsx` extracted for reuse.
- Depends on `player-career-stats` from `normalize-cloud-data-model` for the career figures shown on the development page.
