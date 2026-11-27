# Club mode

A club is a house rule that lets one team keep its players, gold and
history across every game type the game plays. It is not in any rulebook.
Anything this page does not cover follows the team's game type: see
[SEVENS_RULES.md](SEVENS_RULES.md) and [GAME_TYPES.md](GAME_TYPES.md).

Club mode is admin-only while its design settles, like the Sandbox. An
admin opens it from the main menu: **Club → My Clubs** or **Found a Club**.
Everyone else sees no Club menu, and the `/clubs` pages send them home.

A club's page is its team sheet, the same page every team uses, with one
more row. Shirt 12 holds the Gutter Bowl specialist. Before Gutter Bowl
opens, that row shows the club's progress toward it. Once it opens, the row
offers each positional the club may hire. When the squad has eleven players,
the specialist's row picks the Lineman who sits out Gutter Bowl, and that
Lineman's row says so.

| ID | Rule |
| --- | --- |
| CL-1 | A club starts as a standard 600,000 Sevens draft, and keeps the roster it was founded with: 7 to 11 players, at most 4 positionals, one Lineman as the Veteran. This is the Core Sevens squad. |
| CL-2 | A club always uses Advanced League with SPP. Skills, injuries and deaths from league and tournament games follow each player into every game type. A friendly carries nothing unless the coach ticks "Count this game" when picking teams. Then the club keeps the SPP and advancements its players earn, as any team does. Injuries, deaths, gold, the win-loss record and players added during the match, such as a Plague Ridden Rotter, never carry from a friendly. |
| CL-3 | The Core Sevens squad plays Sevens, Street Bowl and Beach Bowl from the first match. Staff a game type bans stays home for that match and comes back afterwards. |
| CL-4 | Team re-rolls cost 100,000 in every game type, so a club's re-rolls never change price. |
| CL-5 | Gutter Bowl opens once current team value plus treasury reaches 750,000. It stays open after that, even if the club's value falls. |
| CL-6 | Once Gutter Bowl is open, the club may hire one Gutter Bowl specialist from the treasury: a fifth positional, at roster price. The specialist plays only Gutter Bowl, wears a shirt number above 11, and does not count toward the Core Sevens limits. Roster position limits count the whole club. |
| CL-7 | When the Core Sevens squad has 11 players, one Lineman sits out Gutter Bowl to make room for the specialist. By default it is the last Lineman hired. The coach may pick another, the Veteran included. The Veteran keeps MA −1 and its re-roll in every game type. |
| CL-8 | A club in a tournament plays no other games, friendlies included, until the tournament ends. A knocked-out club waits for the final, as every tournament team does. A club in a league may play friendlies between fixtures. A club enters one competition at a time. |
| CL-9 | Dedicated Fans belong to the club and carry between game types. |
| CL-10 | A club's career runs through its club league, one season at a time. Each season the club and seven computer clubs play one round robin in Sevens, Street Bowl or Beach Bowl, as the coach chooses. The season has no team value cap. |
| CL-11 | After the play-offs, the coach finishes the season. The club's table finish, record and play-off finish and the champion are kept, and every club in the season is free to enter other competitions again. |
| CL-12 | Four rivals, drawn at random, return the next season. The other three rest on a bench that holds up to nine clubs, dropping the longest-resting first. Each open place has an even chance to bring a benched club back. The places left go to new computer clubs. |
| CL-13 | After the regular season, the top four play the play-offs: first against fourth and second against third, then a final and a third-place game. A level play-off game goes to extra time and penalties. Play-off games are league games: they pay winnings and roll Expensive Mistakes. |
| CL-14 | The play-off champion wins 100,000 and an extra team re-roll that it holds until the next champion takes it. The runner-up wins 60,000 and third place 30,000. The prizes go straight to the treasury when the season is finished. |
| CL-15 | When the season is finished, every club in it rests (R1 in the Sevens rules) and rolls for offers from pro teams, as A6 does after a Sevens game: a D6 for each player with added skills, and an offer on a roll at or under their number of added skills. A club keeps the player by paying their value from the treasury, which raises their value by 15,000, or lets them go. A computer club decides at once; the coach decides on the team sheet. There are no emergency call-ups. |
| CL-16 | Then every club redrafts. The budget is 600,000 plus the treasury plus 10,000 for each league and play-off win that season, capped at 800,000. Each player costs their value plus 20,000 for every season they have played, and re-rolls and staff cost their usual price. The champion's trophy re-roll is free and stays. A club may keep eleven players plus its Gutter Bowl specialist. Players not bought back leave, and what is left becomes the treasury. The next season cannot start until the coach confirms the club's redraft. |
| CL-17 | A computer club redrafts on its own: its most skilled players first, keeping one re-roll when it can, then rookies from what is left. A new computer club drafts at 600,000 and gets the average redraft budget of the season's clubs above that as treasury. |

The rules live in `src/game/rules/club.ts`. `prepareClubSquad` takes the
players and staff who stay home out of the match copy of the team when the
match starts. `restoreClubHome` puts them back before the result is saved.

A club opens its season page from its team sheet with **Club league ·
season N**. The page starts a season, shows its table and finishes it. The
games themselves are played and simulated on the league page, as in any
league. The season rules live in `src/game/rules/homeLeague.ts` and
`src/competition/homeLeague.ts`, and the play-offs in
`src/competition/seasonEnd.ts`, and scouting and the redraft in
`src/competition/offSeason.ts` and `src/game/rules/redraft.ts`.

## Simulating a club career

`__tests__/campaign/club.test.ts` founds eight computer clubs and plays them
through leagues and tournaments of every game type until each club has played
`CLUB_GAMES` games. It checks that no specialist or banned staff member ever
takes the pitch, and that none goes missing after a match. Engine invariant
findings from the matches themselves go to `engineFindings` in the output
and do not fail the run, because they are not club rules.

```sh
CLUB_CAMPAIGN=1 CLUB_GAMES=40 CLUB_OUT=club.json pnpm exec vitest run __tests__/campaign/club.test.ts
```

The run lifts the competition team value cap. The default 1,200,000 cap
shuts a successful club out of new competitions within a season.

`__tests__/campaign/clubSeasons.test.ts` plays one club through several club
league seasons with real simulated matches, play-offs included. It checks
every season has eight clubs, four of them returning, that nobody stays locked
after a season and that the trophy goes to the play-off champion.

```sh
CLUB_SEASONS=1 CLUB_SEASONS_COUNT=4 CLUB_SEASONS_OUT=sim-results/club-seasons.json pnpm exec vitest run __tests__/campaign/clubSeasons.test.ts
```
