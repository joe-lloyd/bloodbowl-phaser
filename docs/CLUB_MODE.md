# Club mode

A club is a house rule that lets one team keep its players, gold and
history across every game type the game plays. It is not in any rulebook.
Anything this page does not cover follows the team's game type: see
[SEVENS_RULES.md](SEVENS_RULES.md) and [GAME_TYPES.md](GAME_TYPES.md).

Open it from the main menu: **Club → My Clubs** or **Found a Club**.

| ID | Rule |
| --- | --- |
| CL-1 | A club starts as a standard 600,000 Sevens draft: 7 to 11 players, at most 4 positionals, one Lineman as the Veteran. This is the Core Sevens squad. |
| CL-2 | A club always uses Advanced League with SPP. Skills, injuries and deaths follow each player into every game type. |
| CL-3 | The Core Sevens squad plays Sevens, Street Bowl and Beach Bowl from the first match. Staff a game type bans stays home for that match and comes back afterwards. |
| CL-4 | Team re-rolls cost 100,000 in every game type, so a club's re-rolls never change price. |
| CL-5 | Gutter Bowl opens once current team value plus treasury reaches 750,000. It stays open after that, even if the club's value falls. |
| CL-6 | Once Gutter Bowl is open, the club may hire one Gutter Bowl specialist from the treasury: a fifth positional, at roster price. The specialist plays only Gutter Bowl and does not count toward the Core Sevens limits. Roster position limits count the whole club. |
| CL-7 | When the Core Sevens squad has 11 players, one Lineman sits out Gutter Bowl to make room for the specialist. By default it is the last Lineman hired. The coach may pick another, the Veteran included. The Veteran keeps MA −1 and its re-roll in every game type. |
| CL-8 | A club in a tournament plays no other games, friendlies included, until the tournament ends for it. A club in a league may play friendlies between fixtures. A club enters one competition at a time. |
| CL-9 | Dedicated Fans belong to the club and carry between game types. |

The rules live in `src/game/rules/club.ts`. `prepareClubSquad` takes the
players and staff who stay home out of the match copy of the team when the
match starts. `restoreClubHome` puts them back before the result is saved.

## Simulating a club career

`__tests__/campaign/club.test.ts` founds eight computer clubs and plays them
through leagues and tournaments of every game type until each club has played
`CLUB_GAMES` games. It checks that no specialist or banned staff member ever
takes the pitch, and that none goes missing after a match.

```sh
CLUB_CAMPAIGN=1 CLUB_GAMES=40 CLUB_OUT=club.json pnpm exec vitest run __tests__/campaign/club.test.ts
```

The run lifts the competition team value cap. The default 1,200,000 cap
shuts a successful club out of new competitions within a season.
