# Deathbowl Sevens

Deathbowl Sevens puts four seven-a-side teams and two balls on one
plus-shaped pitch. It is an experimental game type that only admins can
start, against three computer coaches on one device. A match is an
exhibition: it pays no SPP, keeps no injuries and writes nothing to teams,
competitions or Firestore. The design and the order of work are in
[openspec/changes/deathbowl-sevens](../openspec/changes/deathbowl-sevens/design.md).

## Starting a match

1. Sign in as an admin. The main menu then shows a **Deathbowl Sevens** row.
   Without Firebase configured, as in local development, everyone is an admin.
2. Choose **New Match**. The lobby lists your saved teams and names each DB-D
   rule a team fails. Pick a team that is ready to enter and a difficulty.
3. Choose **Start Match**. Your team takes the North seat. Three computer teams
   take East, South and West.
4. The match saves to its own slot on this device as it goes. **Resume Match**
   in the Deathbowl row picks it up, and a Sevens save is never touched. The
   slot is cleared when you leave the placings screen at full time.

`e2e/fullgame/deathbowl.e2e.ts` plays a whole match this way, clicking every
action of the North seat.

Source: [NAF Deathbowl 2024](https://www.thenaf.net/wp-content/uploads/2024/04/Deathbowl-2024.pdf).
Pages 4 and 5 hold the Sevens variant. Pages 1 to 3 hold the full Deathbowl
rules it builds on, which apply where the Sevens pages say nothing. Anything
neither covers follows the 2025 rulebook and [SEVENS_RULES.md](SEVENS_RULES.md).

This page is our own summary for building the game, not a copy of the NAF
text. Each rule has an ID that code, tests and pull requests cite. Status is
**ok**, **differs** or **missing**.

## Team building (DB-D)

| ID | Rule | Status |
| --- | --- | --- |
| DB-D1 | Budget 700,000. 8 to 11 players. No cap on players without the Lineman keyword; each position's own limit still applies. | ok |
| DB-D2 | Team re-rolls cost 100,000, the house price in every game type. Each team re-roll, and each Leader re-roll, can be used once per match: nothing refills at half time. | differs: the NAF text says the roster's normal price |
| DB-D3 | The only Sideline Staff is an Apothecary. Dedicated Fans have no effect and cannot be bought. | ok |
| DB-D4 | No inducements and no Star Players. | differs: the NAF text allows most inducements |
| DB-D5 | Any team that meets DB-D1 and DB-D3 may play. | ok |

## Pitch and set-up (DB-P, DB-S)

Squares are numbered from 0 in the top-left corner of a 21 by 21 grid.

| ID | Rule | Status |
| --- | --- | --- |
| DB-P1 | The pitch is a plus: columns 5 to 15 on every row, and rows 5 to 15 on every column. The four 5 by 5 corners are not pitch. A player who would move or be pushed there leaves the pitch into the crowd. | ok |
| DB-P2 | North attacks down to row 20, East attacks left to column 0, South attacks up to row 0, West attacks right to column 20. Each arm is 11 squares wide: a Wide Zone of 2 on each side of a 7-square centre strip. | ok |
| DB-P3 | A team scores only in the end zone across from its own Line of Scrimmage. A carrier standing in any other end zone scores nothing. | ok |
| DB-S1 | Each team sets up in its own arm's centre strip, between its end zone and its Line of Scrimmage, the line 6 squares in. Field as many as possible up to 8, at least 3 on the Line of Scrimmage, nobody in a Wide Zone. Teams set up one after another in turn order. | ok |
| DB-S2 | There is no kick-off. Each ball starts on one of the 8 squares around the centre square, picked with a D8. A repeat is rolled again. | ok |
| DB-S3 | A D6 roll-off picks the first team; play then goes clockwise: North, East, South, West. In the second half the team that took the last turn of the first half goes first, and play goes anticlockwise. | ok |

## Match flow (DB-F)

| ID | Rule | Status |
| --- | --- | --- |
| DB-F1 | Two halves of 8 turns for each team. No extra time. | ok |
| DB-F2 | A touchdown does not end the drive. The scored ball leaves the pitch at once and re-enters on a D8 centre square. If the scoring team also held the other ball, that ball is stripped and re-enters too. On its own turn the scorer may finish its move, then the turn ends. A team that scores on another team's turn, such as a carrier pushed into its end zone, scores and the active turn goes on. | ok |
| DB-F3 | A re-entering ball on an empty square stays there. On a standing player, that player may try to catch it as a bouncing ball. On a Prone or Stunned player, or on the other ball, it bounces once. On the Ball cannot be used. | ok |
| DB-F4 | When a turn in which anyone scored ends, every coach rolls for its Knocked-out players. Each coach may then move reserves onto its own Line of Scrimmage, or the row behind it when the line is full, up to 8 on the pitch. | ok |
| DB-F5 | At half time every team sets up again (DB-S1), and Knocked-out players return without a roll. A player saved by an Apothecary or Regeneration returns only at half time. | differs: a player saved by an Apothecary or Regeneration goes to the reserves and can come back after a scoring turn (DB-F4) |
| DB-F6 | A Secret Weapon stays on the pitch until its own team scores, then is Sent-off. Argue the Call applies. | ok |

## Actions and contact (DB-A, DB-B)

| ID | Rule | Status |
| --- | --- | --- |
| DB-A1 | In one team turn a team may make one Blitz against each opposing team and one Foul against each opposing team. It may make two Pass actions and two Hand-offs, but no ball is passed or handed off twice and no player is thrown twice. Throw Team-mate uses a Pass action. A turnover still ends the turn. | ok |
| DB-A2 | A Blitz against a team is spent once declared, even if no block is thrown or a negatrait roll fails. A Blitz may only be declared against a team with a player the Blitzer can reach. | ok |
| DB-A3 | Every opposing tackle zone counts for every roll. No coach may choose not to mark. | ok |
| DB-A4 | A player from a third team next to the attacker or the defender may assist either side of a Block or Foul if its coach agrees and no player from another team marks it, apart from the two involved. Guard may always assist unless Defensive cancels it. Coaches answer in clockwise order. | ok |
| DB-B1 | A player holds at most one ball. A carrier who would take the other ball, by catching, picking up or a bounce, is treated as having No Hands for it. Nobody may drop one ball to take the other. Two balls never rest on one square. | ok |
| DB-B2 | No Pass or Hand-off may target an opposing player. A pass whose path crosses a corner square is not allowed. | ok |
| DB-B3 | When players from several teams may intercept a pass, the one nearest the thrower tries first; equal distances roll off. Each team gets one attempt. Cloud Burster applies to each. | ok |

## Result (DB-R)

Points only come from what a rival did. A player who falls over on its own
earns nobody a point.

| ID | Rule | Status |
| --- | --- | --- |
| DB-R1 | Teams score points: touchdown 10, interception 5, casualty 5, completed pass 2, Knock-out 2, crowd surf into the reserves 2, pick-up 1, hand-off 1, Stun 1 (a re-Stun counts). | differs: the NAF list also pays 1 for a deflection, which the 2025 rulebook no longer has |
| DB-R2 | Teams are placed by points, first to fourth. Tied teams share a place. Touchdowns are shown beside the points. | ok |
