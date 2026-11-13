# league-treasury

## Purpose

Spend the Treasury after a league game, keep a team that has lost players in
the league with Journeymen, and end the post-game sequence with Expensive
Mistakes. This is stage 2 of the money system, after the winnings in
`league-winnings`. Teams with no human coach managing their own money and
tournament prizes are later stages.

The rules are pure functions the screens call:
`src/game/rules/teamPricing.ts` (hiring, re-rolls, roster limits),
`src/game/rules/leagueRoster.ts` (taking on Journeymen),
`src/game/rules/journeymen.ts` (hiring them after the game) and
`src/game/rules/expensiveMistakes.ts`. Dice come from the caller's dice
source, so tests fix them. The Team Builder and `AvailableHires` spend the
Treasury; Manage Team's pending development answers Journeyman offers and
rolls Expensive Mistakes.

### Rule sources

The Blood Bowl Second Season rulebook, as read on rulespal.com
(`blood-bowl-second-season-edition/rulebook`):

- Post-game sequence: "1. Record Outcome and Winnings", "2. Update Dedicated
  Fans", "3. Player Advancement", "4. Hiring, Firing and Temporarily
  Retiring", "5. Expensive Mistakes", "6. Prepare for Next Fixture".
- Hiring: "Spend any amount of gold from the Treasury to buy new players
  from your team roster and/or Sideline Staff and increase Team Value
  accordingly." "Fire any players and/or Sideline Staff who are no longer
  required [...]" "Purchase additional team re-rolls, but must pay double
  to do so."
- Journeymen: "If, during the pre-game sequence of a league fixture or cross
  division friendly, a team is unable to field 11 players it will make use
  of temporary players known as 'Journeymen'" and "A Journeyman is always a
  normal player of their type, with the exception that they gain the Loner
  (4+) trait". "Note that a team drafted for exhibition play must contain at
  least 11 players. This step can be skipped during exhibition play."
- Hiring them: "Permanently hire any Journeymen that played for the team
  during this game: A team must have fewer than 16 players on its Team
  Draft list to permanently hire Journeymen. If permanently hired, a
  Journeyman loses the Loner (X+) trait but retains any SPP earned during
  this game or advancements gained during Step 3. If not permanently hired,
  Journeymen will leave and not return. Any SPP earned or advancements
  gained are lost."
- Expensive Mistakes: "If you have 100,000 gold pieces or more stored in
  your Treasury during this step of the post-game sequence, roll a D6 on the
  following table, applying the result from the column that corresponds to
  the number of gold pieces in your Treasury." "MINOR INCIDENT: [...] you
  lose D3 x 10,000 gold pieces from your Treasury." "MAJOR INCIDENT: Half
  the gold in your Treasury (rounding down to the nearest 5,000 gold pieces)
  is lost to an unfortunate mishap." "CATASTROPHE: Your Treasury is emptied,
  except for 2D6 x 10,000 gold pieces which you sensibly squirreled away for
  just such an occurrence." The page shows rolls 1 to 3 of the table; rolls
  4 to 6 are in the same page's data.

The 2025 rulebook, as read on rulespal.com (`blood-bowl-third-season/rulebook`),
which the Sevens rules build on:

- "Hire any Journeymen that played for your team during the game. To hire a
  Journeyman, they will cost their Hiring Fee, plus any Value Increase they
  gained from advancements, in gold pieces. A hired Journeyman will lose the
  Loner (X+) Trait and will retain any SPP gained during the game. From then
  on they will simply become another player. Any Journeymen not hired are
  permanently lost."
- "Coaches may also purchase additional Team Re-rolls at double their normal
  cost, though they may not remove them from their Team Draft List."
- The same Expensive Mistakes table, from "100,000-195,000 Gold Pieces". Its
  Major Incident reads "You immediately half the amount of gold pieces in
  your Treasury, rounding down to the nearest 5,000 gold pieces." This game
  follows the Second Season wording above, as league-winnings does: the
  half that is lost rounds down. The two differ by 5,000 gp only when half
  the Treasury is not a multiple of 5,000 (305,000 leaves 155,000 here,
  150,000 under the 2025 wording).

Sevens, Spike! Journal 22 (`docs/SEVENS_RULES.md`, transcribed at
bloodbowlbase.ru `bb2025/spike_journal/issue_22`):

- Re-rolls (D4): "When drafting a Sevens team roster, or later during the
  course of a league, Coaches may purchase Team Re-rolls. Each Team Re-roll
  costs 100,000 gold pieces rather than the cost given on the Team Roster."
  So a league re-roll costs 100,000, the draft price, not double.
- Roster (D2): "No Blood Bowl Sevens team may ever have more than 11
  permanently hired players on their Team Draft List."
- Journeymen (L2): "they may do so if their team is unable to field 7
  players rather than the usual 11. This may not take the number of
  available players on a team above 7." and "any Journeymen hired will
  replace the Loner (4+) Trait with the Loner (5+) Trait."
- Firing (L6): "During this step of the Post-game Sequence, Coaches may not
  choose to fire any players or Sideline Staff. Additionally, as there are
  no Lasting Injuries in Blood Bowl Sevens, players can never choose to be
  Temporarily Retired."
- League play otherwise "will function in mostly the same way as a standard
  Blood Bowl league", so Expensive Mistakes keeps its 100,000 threshold and
  table.

### Expensive Mistakes table

| D6 | 100,000 to 195,000 | 200,000 to 295,000 | 300,000 to 395,000 | 400,000 to 495,000 | 500,000 to 595,000 | 600,000+ |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Minor Incident | Minor Incident | Major Incident | Major Incident | Catastrophe | Catastrophe |
| 2 | Crisis Averted | Minor Incident | Minor Incident | Major Incident | Major Incident | Catastrophe |
| 3 | Crisis Averted | Crisis Averted | Minor Incident | Minor Incident | Major Incident | Major Incident |
| 4 | Crisis Averted | Crisis Averted | Crisis Averted | Minor Incident | Minor Incident | Major Incident |
| 5 | Crisis Averted | Crisis Averted | Crisis Averted | Crisis Averted | Minor Incident | Minor Incident |
| 6 | Crisis Averted | Crisis Averted | Crisis Averted | Crisis Averted | Crisis Averted | Minor Incident |

## Requirements

### Requirement: A league team spends its Treasury between fixtures

After its first game a team SHALL hire players from its roster at their
Hiring Fee, and buy team re-rolls and Sideline Staff at their Sevens prices,
from the Treasury, using the same Team Builder and `AvailableHires` as the
draft. A team re-roll SHALL cost 100,000 gp between fixtures, as at the
draft. Every purchase SHALL lower the Treasury by exactly its price, and the
Treasury SHALL never go below zero. Draft-only allowances SHALL be off:
firing players, selling back staff, changing roster type, the starting
Treasury, choosing a Veteran and Matched Play inducements.

#### Scenario: Buying a player

- **WHEN** a Human league team with 200,000 gp hires a Blitzer between
  fixtures
- **THEN** the Treasury holds 115,000 gp

#### Scenario: Buying a re-roll

- **WHEN** a league team with 250,000 gp buys a team re-roll between
  fixtures
- **THEN** it has one more re-roll and 150,000 gp

### Requirement: Purchases beyond the Treasury or the roster limits are refused

A hire or purchase the Treasury cannot pay SHALL be refused with a reason and
leave the team unchanged. A hire SHALL be refused when the Team Draft List
already holds 11 permanently hired players. Between fixtures a hire SHALL
also be refused when it would take a position over its QTY or the team over
4 players without the Lineman keyword. A dead player has left the list, and
a Journeyman or raised Lineman waiting on a hiring decision is not on it.

#### Scenario: Not enough gold

- **WHEN** a league team with 80,000 gp tries to hire an 85,000 gp Blitzer
- **THEN** the hire is refused and the Treasury stays 80,000 gp

#### Scenario: Roster full

- **WHEN** a league team with 11 hired players tries to hire another
- **THEN** the hire is refused

### Requirement: Dead players leave the roster

A league player with a Dead result SHALL leave the Team Draft List when the
team is next loaded (`staysOnRoster`), and SHALL not count toward the
roster limit or team value.

### Requirement: Journeymen make up a short team in a league fixture

At the start of a league fixture (`fixturePaysWinnings`, carried as
`GameState.paysWinnings`), a league team with fewer than 7 players able to
play SHALL take on Journeymen from its roster's first Lineman position, with
Loner (5+), until 7 can play. They SHALL cost nothing for that game.
Friendlies, play against the computer outside a competition, online
friendlies, the sandbox and tournament fixtures SHALL take on none: a short
team plays short.

#### Scenario: Five players left

- **WHEN** a league team with 5 available players kicks off a league fixture
- **THEN** 2 Lineman Journeymen with Loner (5+) join it and the Treasury is
  unchanged

#### Scenario: A friendly

- **WHEN** the same team kicks off a friendly or a tournament game
- **THEN** no Journeyman joins it

### Requirement: A Journeyman who played may be hired for good

After a league fixture each Journeyman who took part in the game
(MatchStats participation) and did not die SHALL wait on the coach's
decision in Manage Team, and SHALL block the team's next fixture until
answered. Hiring SHALL cost their Hiring Fee plus any Value Increase, from
the Treasury, and needs room under 11 permanently hired players. A hired
Journeyman SHALL lose Loner and keep their SPP and advancements. One let
go, or one who did not play, SHALL leave with them. Nothing is offered after
any other game. A computer team keeps a Journeyman only to get back to 7
players when it can pay, and lets the rest go.

#### Scenario: Hiring a Journeyman

- **WHEN** a league team with 120,000 gp hires a Human Lineman Journeyman
  who earned 3 SPP
- **THEN** the Treasury holds 70,000 gp and the player stays with 3 SPP and
  no Loner

### Requirement: Expensive Mistakes ends the post-game money steps

When a league fixture is recorded (played or by score only, once per
fixture) and a league team's Treasury then holds 100,000 gp or more, an
Expensive Mistakes step SHALL wait in Manage Team. The coach SHALL roll it
after every other post-game choice, and MAY spend in the Team Builder first.
The roll SHALL use the table above on the Treasury at that moment, and a
Treasury under 100,000 gp rolls nothing. It blocks the next fixture until
rolled. A computer team rolls it after its own hiring. A tournament fixture,
a walkover and any game outside a competition SHALL never queue it.

#### Scenario: Crisis Averted

- **WHEN** a Treasury of 150,000 gp rolls a 4
- **THEN** it stays 150,000 gp

#### Scenario: Minor Incident

- **WHEN** a Treasury of 150,000 gp rolls a 1 and a D3 of 2
- **THEN** it holds 130,000 gp

#### Scenario: Major Incident

- **WHEN** a Treasury of 350,000 gp rolls a 1
- **THEN** it holds 175,000 gp

#### Scenario: Catastrophe

- **WHEN** a Treasury of 520,000 gp rolls a 1, then 3 and 4 on 2D6
- **THEN** it holds 70,000 gp

#### Scenario: Under the threshold

- **WHEN** a Treasury of 95,000 gp reaches this step
- **THEN** nothing is rolled and it stays 95,000 gp
