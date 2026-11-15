# league-builder

## Purpose

Provide organizers a way to create leagues from member teams, generate a season schedule, and maintain standings from recorded results with cross-season persistence.

## Requirements

### Requirement: Create a league

The system SHALL provide a page to create a league with a name and member teams (from shared teams or ad-hoc for local play), and SHALL generate a season schedule (round-robin at minimum).

#### Scenario: Build a league season

- **WHEN** an organizer names a league, adds member teams, and generates the schedule
- **THEN** a round-robin season of fixtures is created

### Requirement: Standings from recorded results

The system SHALL maintain a standings table computed from recorded fixture results (wins/draws/losses and the league's chosen points/tiebreakers).

#### Scenario: Standings update on a result

- **WHEN** a league fixture result is recorded
- **THEN** the standings table updates to reflect it

### Requirement: The league page leads with the round to play next

Beneath the standings, the league page SHALL show the next round to play first and in full: the earliest round with a game still to play, kept there while it is only partly played. Its games SHALL keep their schedule order, round number, recorded scores and match actions, and each team SHALL show a crest beside its name: the team's kit colours when this browser can read the team, otherwise a neutral crest of the same shape. The remaining rounds with games to play SHALL follow in round order in the compact layout. Rounds whose games are all complete SHALL be listed as history in round order, each folded away by default behind a control that opens it by click, tap or keyboard and states whether it is open. A finished league SHALL show its history and no next round.

#### Scenario: A partly played round stays first

- **WHEN** a league's earliest round has one game recorded and one still to play
- **THEN** that round is shown first, with the recorded score and the remaining game's match actions

#### Scenario: Completing a round promotes the next one

- **WHEN** the last game of the round shown first is recorded
- **THEN** the following round with games to play is shown first, and the completed round is listed as folded history that opens to show its results

#### Scenario: A finished league names no next round

- **WHEN** every game in a league is complete
- **THEN** the page shows the standings and every round as folded history, and no next round

### Requirement: Cross-season persistence

League state — schedule, results, standings — and the participating teams' progression SHALL persist across sessions for the duration of the season.

#### Scenario: League resumes after reload

- **WHEN** an organizer reopens a league after reloading
- **THEN** the schedule, recorded results, and standings are intact

#### Scenario: Team progression carries through the season

- **WHEN** teams play league fixtures with progression enabled
- **THEN** each team's persisted progression reflects its league matches

### Requirement: League entrants reference a team rather than embedding it

A league entrant SHALL identify its team by owner uid and team id. The league document SHALL NOT contain a copy of the roster. It MAY cache display fields — team name, roster name, coach name, seed — for rendering fixtures without fetching every roster, and those cached fields SHALL be refreshed when the league is loaded by someone able to read the team.

#### Scenario: A league document holds no roster copy

- **WHEN** a league is created with four entrants
- **THEN** the stored league contains four team references and no player records

#### Scenario: A fixture launch fetches the live roster

- **WHEN** a league fixture is launched
- **THEN** the teams are fetched by reference and the match uses their current rosters

#### Scenario: Cached display names refresh

- **WHEN** a coach renames a team that is entered in a league and the league is reloaded
- **THEN** the fixture list shows the new name

### Requirement: Player development carries across league fixtures

Because entrants reference live teams, advancement gained in one league fixture SHALL be present in the next fixture that team plays in the same league.

#### Scenario: A skill gained in round one is present in round two

- **WHEN** a player gains a skill after a round-one fixture
- **THEN** that player has the skill when their team plays its round-two fixture

### Requirement: The league page links the coach's teams to their progression

A league page SHALL list, near its top under Your teams, each team in the league that is in the viewing coach's library and has not withdrawn, with the team's crest, name and where its development stands: development to finish (saying when the league requires it finished before the team's next game), players who can advance, or up to date. Each team a person coaches SHALL offer a Progress team action whose accessible name includes the team's name. It SHALL open that team's existing page with the league as the place to return to: the page's leave button SHALL read Back to the league, and leaving or saving SHALL return to that league. A computer-coached team SHALL be listed without the action and SHALL say the computer makes its development choices. A league with none of the coach's teams SHALL show no Your teams section.

#### Scenario: After a game the coach finds their team on the league page

- **WHEN** a coach finishes post-match for a league game and returns to the league
- **THEN** Your teams lists their teams in that league, each with where its development stands

#### Scenario: Several teams in one league

- **WHEN** a coach with two teams in a league chooses Progress team for the second team
- **THEN** the second team's page opens, not the first's, and Back to the league returns to that league

#### Scenario: A computer team in the coach's library

- **WHEN** the organizer views a league with a computer-coached team from their library
- **THEN** that team is listed as making its own development choices, with no Progress team action

### Requirement: A team belongs to at most one active competition

A team SHALL record the single active league or tournament it is entered in. Entering a team into a competition SHALL be refused when it is already entered in an active one, and the reason SHALL be stated. The association SHALL be cleared when the competition completes or the team is withdrawn.

#### Scenario: Double entry is refused

- **WHEN** a coach tries to enter a team into a second active competition
- **THEN** the entry is refused and the coach is told which competition the team is already in

#### Scenario: Completing a competition frees the team

- **WHEN** a league completes
- **THEN** its entrants' active-competition association is cleared and they can be entered elsewhere

#### Scenario: Withdrawing frees the team

- **WHEN** a team is withdrawn from an active league
- **THEN** its active-competition association is cleared

### Requirement: A withdrawn team's games close as walkovers

When a team withdraws from a league, its games already played SHALL stand, and each of its unplayed games SHALL close as a walkover won by the other side. A walkover SHALL NOT count in the standings or in either team's record. A league whose remaining games are all walkovers SHALL be able to complete.

#### Scenario: Withdrawing mid-season

- **WHEN** a team that has played one game withdraws
- **THEN** that game stays in the standings, and its other games show as walkovers that the standings leave out

#### Scenario: A league finishes after a withdrawal

- **WHEN** every game not involving the withdrawn team has been played
- **THEN** the league is complete

### Requirement: Coaches are referenced by uid

Coach identity on entrants and fixtures SHALL be stored as a uid with a cached display name. No coach record SHALL be copied into the league document.

#### Scenario: League stores a coach reference

- **WHEN** a league is created
- **THEN** each entrant records its coach's uid and a cached display name, and no further coach data

### Requirement: Existing embedded leagues are read and converted

The reader SHALL accept league documents that embed roster snapshots, converting them to references on read, and SHALL write the reference shape on the next save.

#### Scenario: An old league opens

- **WHEN** a league saved with embedded rosters is opened
- **THEN** it displays correctly and is stored in the reference shape the next time it is saved
