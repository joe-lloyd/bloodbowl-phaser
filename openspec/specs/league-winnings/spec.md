# league-winnings

## Purpose

Pay winnings into a team's Treasury after a league game, as step 1 of the
post-game sequence ("Record Outcome and Winnings"). This is stage 1 of the money
system. Spending the Treasury, Journeymen and Expensive Mistakes are stage 2
(`league-treasury`). Teams with no human coach managing their own money and
tournament prizes build on it in later stages.

The code is `src/game/rules/winnings.ts`. The engine rolls Fan Factors in
`GameService`, and `src/competition/resultRecording.ts` records and pays the
winnings.

### Rule sources

The Blood Bowl Second Season rulebook, as read on rulespal.com
(`blood-bowl-second-season-edition/rulebook`):

- Pre-game sequence: "THE FANS: Both coaches roll a D3 and add their Dedicated
  Fans characteristic. This determines each team's 'Fan Factor'."
- Post-game, League and Exhibition Play: "After a league fixture, both coaches
  should run through the full post-game sequence step by step. In exhibition
  play, the post-game sequence need not be completed."
- Winnings: "Divide the Fan Attendance for the game by two. Add the number of
  touchdowns your team scored to this figure. Multiply the total by 10,000. The
  result is how many gold pieces your team has won for this game. [...] added
  immediately to the team's Treasury."
- "Note that, if one team conceded, Fan Attendance is not divided by two.
  Instead, the full amount is awarded to the winning team."
- Fan Attendance: "This is worked out by simply adding together the Fan Factor
  of both teams to determine the total number of fans present."
- Conceding: "You may concede at the start of any of your team turns. However,
  doing so means that: [...] You do not generate any winnings. Your Dedicated
  Fans characteristic is reduced by D3 (to a minimum of 1)."
- Set-up: "should a team find itself reduced to only three players or fewer, it
  may concede without penalty before setting-up."
- Update Dedicated Fans: "If your team won the game, roll a D6. If the result is
  equal to or higher than your current Dedicated Fans characteristic, increase
  your Dedicated Fans characteristic by 1. If your team lost the game, roll a
  D6. If the result is lower than your current Dedicated Fans characteristic,
  reduce your Dedicated Fans characteristic by 1. If the game was a draw,
  neither team's Dedicated Fans characteristic will increase or decrease."

The rulebook does not round the half. The 2025 rulebook's worked example keeps
it: a Fan Attendance of 7 "divides this by two, to give 3.5", and the winnings
come to 65,000 gold pieces. The 2025 rulebook also adds 1 when no player on the
team was Stalling. This game does not apply that, because it follows the Second
Season formula.

Sevens: the Spike! Journal 22 summary in `docs/SEVENS_RULES.md` changes nothing
here (L1: the league runs as in the rulebook). A fan-made Sevens rules summary
sheet gives the same formula: "each team W = 10K x (FA / 2 + team TD)". Sevens
keeps league Dedicated Fans between 1 and 5 (D7).

## Requirements

### Requirement: Fan Factor is Dedicated Fans plus a D3

Each team's Fan Factor SHALL be its Dedicated Fans plus a D3, rolled on the
game's dice source. A D3 is a D6 halved, rounding up. The engine SHALL roll it
at full time from the Dedicated Fans the team kicked off with, before the
post-game Dedicated Fans update. It SHALL roll only in a fixture that pays
winnings (`fixturePaysWinnings`: a league fixture, carried into the game as
`GameState.paysWinnings`) with at least one team in a league mode. A tournament
fixture or any other game SHALL roll no Fan Factor, so its dice are the same
as before winnings existed. Nothing earlier in a Sevens game reads Fan
Factor (Pitch Invasion adds Dedicated Fans, K12), so this gives the same result
as a pre-game roll. The Fan Factors SHALL be kept in the game state
(`GameState.fanFactors`) so a save or an online snapshot carries them.

#### Scenario: Worked example Fan Factors

- **WHEN** Team A has 2 Dedicated Fans and rolls a 2, and Team B has 1
  Dedicated Fan and rolls a 3
- **THEN** both Fan Factors are 4

#### Scenario: No league team

- **WHEN** a game between two Matched Play teams ends
- **THEN** no Fan Factor is rolled

#### Scenario: Tournament fixture between league teams

- **WHEN** a tournament fixture between two league-mode teams ends, played or
  simulated
- **THEN** no Fan Factor is rolled and the Dedicated Fans update uses the
  first dice of full time

### Requirement: Each team wins half the Fan Attendance plus its touchdowns

Fan Attendance SHALL be the two Fan Factors added together. Each team SHALL win
(Fan Attendance / 2 + its own touchdowns) x 10,000 gold pieces. The half SHALL
NOT be rounded, so an odd Fan Attendance pays a 5,000 gp half. Winner, loser
and draw SHALL use the same formula.

#### Scenario: Worked example winnings

- **WHEN** both Fan Factors are 4 and the score is 2-1
- **THEN** Fan Attendance is 8, Team A wins 60,000 gp and Team B wins 50,000 gp

#### Scenario: Odd Fan Attendance

- **WHEN** Fan Attendance is 7 and a team scored no touchdowns
- **THEN** the team wins 35,000 gp

### Requirement: Only league fixtures pay, into league teams' Treasuries

Winnings SHALL be paid only for a played league fixture, and only into the
Treasury of a team in a league mode (Advanced League or Sevens Skill
Selection). A Matched Play team has no post-game sequence and keeps no
Treasury (D1, MP1). A tournament fixture, a walkover, a bye, and every game
outside a competition SHALL leave both Treasuries unchanged. These games pay
nothing: hot-seat play (`/play`), play against the computer (`/play/computer`),
online friendlies (`/online/host`, `/online/join`), the sandbox, and the
headless and simulation runners. A tournament can instead pay its champion a
prize (tournament-prizes spec).

#### Scenario: Tournament fixture

- **WHEN** a tournament fixture result is recorded, played or by score only
- **THEN** neither team's Treasury changes and no Fan Factor is rolled for it

#### Scenario: Friendly game

- **WHEN** a game outside a competition ends and its results are saved
- **THEN** neither team's Treasury changes

### Requirement: A fixture pays exactly once

The first report of a league fixture SHALL fix its winnings on the fixture
result (`FixtureResult.winnings`, with both Fan Factors) in the same write as
the score, so both coaches pay the same amounts. A team SHALL be paid when its
record is updated for the fixture, which happens once per fixture
(`Team.recordedFixtureIds`). Recording the result again, the other coach's
report, a reload, or the results screen saving its kick-off copy of the team
SHALL NOT pay again or undo the payment.

#### Scenario: Recorded twice

- **WHEN** the same league fixture result is recorded a second time, or after a
  reload
- **THEN** each Treasury holds one payment of the winnings

### Requirement: A result recorded by score only pays

A league fixture reported by score only, without a played match, SHALL pay. Its
Fan Factors SHALL be rolled when it is recorded, on the game's dice source, and
its scores SHALL count as the touchdowns. A team outside this coach's library
counts 1 Dedicated Fan, the fewest a league team can have (D7).

#### Scenario: Score-only worked example

- **WHEN** the worked example's teams are reported 2-1 by score only and the
  D3s come up 2 and 3
- **THEN** Team A's Treasury rises by 60,000 gp and Team B's by 50,000 gp

### Requirement: Concessions

The game's only concession is the penalty-free set-up concession, made before
setting up by a team that cannot put 3 players on the Line of Scrimmage. It
SHALL pay both teams by the normal formula on the played score. The penalised
concession during play does not exist yet. When it is added, the conceding
team SHALL win nothing and the winning team SHALL win the whole Fan Attendance
plus its touchdowns, times 10,000 gp.

#### Scenario: Penalty-free concession

- **WHEN** a team concedes without penalty at a 0-0 score, with Fan Factors 2
  and 3
- **THEN** each team wins 25,000 gp

### Requirement: Dedicated Fans change after the game

After a played league game, each league team's Dedicated Fans SHALL change as
the rulebook says (Update Dedicated Fans), within 1 to 5 in Sevens. This
happens after the Fan Factors are rolled. A result recorded by score only does
not roll this update.

### Requirement: Coaches see the winnings and the new Treasury

The match results screen SHALL show each team's winnings and the Fan Factors
behind them once the league fixture is recorded. The Team page SHALL show the
Treasury with the winnings added.

#### Scenario: Results screen

- **WHEN** a league fixture is recorded at full time
- **THEN** the results screen lists each team's winnings in gold pieces
