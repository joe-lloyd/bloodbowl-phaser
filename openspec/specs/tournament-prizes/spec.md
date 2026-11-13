# tournament-prizes

## Purpose

Let a tournament pay its champion a prize into the team's Treasury. This is
stage 4 of the money system. The rulebook has no tournament rules and no prize
money, so this is the game's own feature. Tournament games pay no winnings
(league-winnings spec): the prize is the only money a tournament pays.

Tournaments are not static. A tournament fixture carries SPP, injuries,
Dedicated Fans and the win, draw or loss onto the saved team as a league
fixture does (`src/competition/resultRecording.ts`), so a Treasury prize
carries onto the team in the same way.

The code is `payTournamentPrize` in `src/competition/resultRecording.ts`, with
`tournamentPrizeKey` and `isValidPrize` in `src/game/rules/winnings.ts`.

## Requirements

### Requirement: The organizer sets the prize when creating a tournament

The tournament builder SHALL let the organizer set a prize for the champion in
gold pieces. The default SHALL be no prize. A prize SHALL be a whole number of
gold pieces from 0 to 10,000,000 (`MAX_PRIZE`); anything else is refused with
a message. The prize SHALL be stored on the tournament document as `prize`,
absent when there is none. A league has no prize. The database rules SHALL hold
an organizer's tournament document to the same bound. A coach who only takes
part cannot change the prize: the database rules let a participant change only
the fixtures and what follows from them.

#### Scenario: No prize by default

- **WHEN** an organizer creates a tournament without setting a prize
- **THEN** the tournament has no prize and pays nothing

#### Scenario: A prize that is not whole gold pieces

- **WHEN** an organizer sets a prize of -10,000, 1.5 or 10,000,001 gold pieces
- **THEN** the tournament is not created and the organizer is told why

#### Scenario: An invalid prize stored on the document

- **WHEN** a completed tournament's stored `prize` is not whole gold pieces from
  0 to 10,000,000, such as the string "1e309"
- **THEN** no Treasury takes anything

### Requirement: The champion's Treasury takes the prize once

When a tournament completes, its champion's Treasury SHALL be credited with
the prize, through the same save as league winnings (`payWinnings`). The
champion is the one the tournament already picks: the winner of the final in
single elimination, and the top of the table once every game is played in a
round robin. The payment SHALL be recorded on the team as
`<competitionId>:prize` in `Team.recordedFixtureIds`, so recording the last
result again, the other coach's report, reopening the tournament page, or the
results screen saving its kick-off copy of the team SHALL NOT pay again. As
with league winnings, only a team in a league mode keeps a Treasury: a Matched
Play champion is paid nothing. The prize is a Treasury credit and nothing else.

#### Scenario: Single elimination

- **WHEN** a four-team single-elimination tournament with a 100,000 gp prize
  completes and its champion's Treasury held 30,000 gp
- **THEN** the champion's Treasury holds 130,000 gp and the other Treasuries
  are unchanged

#### Scenario: Round robin

- **WHEN** a three-team round-robin tournament with a 50,000 gp prize
  completes and the top team's Treasury held 20,000 gp
- **THEN** that team's Treasury holds 70,000 gp

#### Scenario: Recorded again or reloaded

- **WHEN** the last result is recorded again, or the tournament page is opened
  again
- **THEN** the champion's Treasury still holds one payment of the prize

#### Scenario: Not yet complete

- **WHEN** a tournament with a prize still has games to play
- **THEN** no Treasury has taken the prize

### Requirement: Only the champion's own coach pays the prize

The prize SHALL be paid only into a team this coach's session can save, as
league winnings are: a team in the coach's own library, which includes the
computer's teams for the organizer. A champion owned by another coach SHALL be
paid when that coach records a result in the tournament or opens its page. When
a signed-in coach's team library arrives after the tournament page has loaded,
the page SHALL check the prize again, still paying it once. No coach SHALL
write another coach's team.

#### Scenario: The champion belongs to another coach

- **WHEN** the organizer records the last result and the champion is another
  coach's team
- **THEN** the organizer's session writes no team, and the champion's Treasury
  takes the prize when its coach opens the tournament

### Requirement: The prize is shown

The tournament page SHALL show the champion's prize in gold pieces when there
is one. Once the tournament completes, the champion panel SHALL say the prize
was paid into the Treasury, or that a Matched Play champion keeps no Treasury.

#### Scenario: Completed tournament page

- **WHEN** a tournament with a 100,000 gp prize completes and the coach opens
  its page
- **THEN** the page shows the champion and "+100,000 gp prize paid into the
  Treasury"
