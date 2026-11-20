# Game types

The game plays four seven-a-side formats of Blood Bowl. Each competition
picks one game type when it is created and keeps it for the season. A
friendly match picks one on the team selection screen. Teams record the
game type they were drafted for, and a team can enter any game type whose
draft rules its roster meets.

To check another game type, the game prices the draft at that game
type's costs: its re-roll price and Dedicated Fan price against its
budget. A Sevens team needs a Veteran and keeps it in the other game
types (SB-D4). A Street, Beach or Gutter Bowl draft has no Veteran, so it
cannot play Sevens until it names one.

| Game type | Source | Pitch | Status |
| --- | --- | --- | --- |
| Sevens | GW, Spike! Journal 22 (2026) | 20 × 11 stadium, see [SEVENS_RULES.md](SEVENS_RULES.md) | complete |
| Street Bowl | [NAF Street Bowl 2024](https://www.thenaf.net/wp-content/uploads/2024/04/Street-Bowl-2024.pdf) | 26 × 7 walled street | in progress |
| Beach Bowl | [NAF Beach Bowl 2025](https://www.thenaf.net/wp-content/uploads/2026/05/Beach-Bowl-2025.pdf) | 20 × 9 sand | in progress |
| Gutter Bowl | GW Gutter Bowl (2023) | 26 × 15 walled street or sewer | in progress |

Deathbowl Sevens is left out: it is a four-team game. Dungeon Bowl fields
six and needs a dungeon map, so it is left out too.

This page is our own summary for building the game, not a copy of any
rulebook. Anything not listed follows the 2025 rulebook. Each rule has an
ID that code, tests and pull requests cite. Status uses the same words as
the Sevens page: **ok**, **differs** or **missing**.

The code lives in `src/game/variants/`: `gameTypes.ts` lists the types,
`pitchLayouts.ts` holds each pitch, and `gameTypeRules.ts` holds the
numbers below. `activeMatch.ts` holds the format of the match being
played, and `GameConfig` reads its pitch from there.

## Street Bowl (SB)

### Team building

| ID | Rule | Status |
| --- | --- | --- |
| SB-D1 | Draft budget 600,000. 7 to 11 players. At most 4 players from positions with a limit below 0-12 (the non-Lineman limit). | ok |
| SB-D2 | Team re-rolls cost double the roster's listed price. | ok |
| SB-D3 | No Apothecary, Assistant Coaches or Cheerleaders. Dedicated Fans cost double. | ok |
| SB-D4 | No Veteran: that is a Sevens rule. A Street Bowl draft cannot name one. A Sevens team that enters keeps its Veteran, with MA -1 and its one re-roll: a house rule so one roster can play every game type it meets. | differs |
| SB-D5 | The only inducements are Magic Potions and the Halfling Master Chef. Each team gets one Magic Potion free; more cost 50,000 each with no limit. | ok |

### Match play

| ID | Rule | Status |
| --- | --- | --- |
| SB-M1 | Two halves of 6 turns. | ok |
| SB-M2 | The pitch is 26 long and 7 wide: Wide Zones of 2 rows on each side and a Centre Field of 3. The Lines of Scrimmage meet in the middle as on a full pitch. | ok |
| SB-M3 | Field as many players as possible, up to 7. At least 1 on the Line of Scrimmage in Centre Field, at most 1 in each Wide Zone. | ok |
| SB-M4 | Cobbles: +1 to the Armour roll of any player Knocked Down or who Falls Over. A player Placed Prone gets no bonus. The bonus does not stack with Claws or a Secret Weapon's modifier. | ok |
| SB-M5 | A dropped ball bounces twice: after a failed catch, a pass or kick hitting the ground, a throw-in hitting the ground, or a Knocked Down ball carrier. If the first bounce lands in an occupied square, that player may try to catch it; if not caught it bounces twice more. The game bounces the ball after a failed catch, a pass, kick or ricochet landing and a dropped ball, but a crowd throw-in that lands in an empty square stays put, as in the 2025 rulebook. | differs |
| SB-M6 | Walls run the length of both sidelines. A ball never leaves by a sideline. A ball that would cross one hits the wall and moves D6 squares in a direction from the throw-in template, then bounces twice. This covers kicks too. The D6 counts the square next to the wall as the first, as a throw-in does. | ok |
| SB-M7 | Only the end zones are open. A ball leaving over an end line is thrown in by the crowd as usual. A kick is a touchback only if it lands in the kicking team's half or leaves over an end line. | ok |
| SB-M8 | Pushed into a wall: a player next to a wall who must be pushed and has no open square is pushed into the wall. The active coach rolls a D6: 1-3 nothing happens, 4+ the player Falls Over in their square (+1 Armour). After a POW! there is no roll: the player is Knocked Down in their square with +2 Armour. The Falls Over case gets only the cobbles bonus; `armour.wallPush` adds the wall's +1 after a POW!. The players behind a chain push into a wall stay where they are. | ok |
| SB-M9 | Ricochet pass: a Pass action may target a wall square. Test accuracy as normal. On a miss, a D6 of 1-3 moves the target one wall square to the thrower's right, 4+ to the left. The ball bounces off the wall, straight back if thrown square on, otherwise on the mirrored diagonal, travels D6 squares and scatters once. It ricochets off any other wall it meets. One player from each team it passes over may try to catch it as an inaccurate pass. A Turnover unless the active team catches it. A pass command may target a square of the sideline wall. Only the first standing player the ball passes over tries to catch it; a failed catch bounces as usual instead of the ball flying on. A market stall sends the ball straight back. | differs |
| SB-M10 | Throw Team-mate into a wall: the thrown player rolls a D6. 1-5 they stop at the wall and are Knocked Down with +2 Armour. On a 6 they push off: the coach picks a throw-in template direction, they move D3 squares and land as normal. The coach does not pick the direction: the template faces away from the wall and a D6 picks it, as for a throw-in. A market stall counts as a wall, and nobody may aim a throw at one. | differs |
| SB-M11 | No referee: nobody is Sent-off for a Foul. After any Foul the fouled player's coach rolls a D6; on 4+ a rock hits the fouler, who makes an Armour roll at +1. If the armour breaks, make an Injury roll and the fouling team suffers a Turnover. | ok |
| SB-M12 | Secret Weapons play through the drive. At the end of each drive roll a D6 for each: 1-3 the crowd drags them off as Badly Hurt, 4+ they stay. A Loner stays only on a 6. | ok: the roll is made for every Secret Weapon still in the game, Knocked-out ones included. Magic Potions cannot help, which the potion rules (SB-P) must respect |
| SB-M13 | Injuries use the 2025 rulebook tables, with the Casualty roll. | ok: a Niggling Injury and Decay each add 1 to the Casualty roll. A Lasting Injury that cannot lower its characteristic is a Miss Next Game only |
| SB-M14 | Kick-off deviation is D6 squares, as in the 2025 rulebook. The Kick skill's D3 still applies. | ok |

### Kick-off table (2D6)

Fan Factor in this table is the team's Dedicated Fans, the same number the Sevens Pitch Invasion adds.

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| SB-K2 | 2 | Loose Masonry: pick a Wide Zone at random. Every player in it is Knocked Down and makes an unmodified Armour roll. | ok |
| SB-K3 | 3 | Riot: D6 per coach. The lower coach, or both on a tie, picks D3 random players on the pitch, who are Placed Prone and Stunned. | ok |
| SB-K4 | 4 | Stray Pony: every player on a Line of Scrimmage makes a Dodge into the square behind them, pushing anyone there straight back without a fall. A failed Dodge is Knocked Down with +2 Armour. ST 5 or more skips the roll. Our version: the Dodge is an unmodified Agility test, and a push that would leave the pitch or go into an obstacle does not happen. | differs |
| SB-K5 | 5 | High Kick: one Open receiving player may move to the landing square. | ok |
| SB-K6 | 6 | Cheering Fans: D6 + Fan Factor each; the higher gets a team re-roll for the drive. A tie gives nothing. | ok |
| SB-K7 | 7 | Brilliant Coaching: as SB-K6. | ok |
| SB-K8 | 8 | Changing Weather: roll new Street Bowl weather. On Normal the ball scatters three times before landing. | ok |
| SB-K9 | 9 | Potion Peddler: each team gains one Magic Potion, offered at the next drive break. | ok |
| SB-K10 | 10 | Blitz: D3+1 Open kicking players may Move; one may Blitz and one may Throw Team-mate. A fall ends it. | ok |
| SB-K11 | 11 | Throw a Bomb: D6 + Fan Factor each. The lower team has a random player on the pitch hit by an accurate bomb. A tie is a dud. Our version: the bomb goes off at once; nobody can catch it and throw it on. | differs |
| SB-K12 | 12 | Guards!: the lowest MA player on each team (random tie-break) takes a ST 3 block with no skills. A player Knocked Down is arrested for the rest of the game. Pushes go straight back towards their own end zone. Our version: the block dice are picked for both sides, each taking its best face. | differs |

### Weather table (2D6)

| ID | Roll | Weather | Status |
| --- | --- | --- | --- |
| SB-W2 | 2 | Smog: before each kick-off each coach rolls a D6; on a 1 they field at most 6, on a 6 up to 8. Quick passes only. Our version: Quick passes only. The fielding roll before each kick-off is missing. | differs |
| SB-W3 | 3 | Wind: -1 to every pass. | ok |
| SB-W4 | 4-10 | Normal: no effect. | ok |
| SB-W11 | 11 | Rain: -1 to catch, deflect, intercept and pick-up. | ok |
| SB-W12 | 12 | Snow: -1 to Rush; Quick and Short passes only. | ok |

### Magic Potions (D8)

Given to a KO'd, Badly Hurt or Seriously Hurt player after KOs are rolled,
or to a fit player before a drive. Not to a player with Regeneration.
The game asks each coach before every drive, the first included, once KO
recovery is done. A player who drank Tap Water waits for the next break.

| ID | Roll | Potion | Status |
| --- | --- | --- | --- |
| SB-P1 | 1 | Squig Pish: the player dies. | ok |
| SB-P2 | 2 | Tap Water: no effect; another potion may be tried after the next drive. | ok |
| SB-P3 | 3 | Laudanum: returns with Really Stupid, Thick Skull and -2 to Agility tests. | ok |
| SB-P4 | 4 | Dwarf Ale: returns with Bone-head and -1 to Agility tests. | ok |
| SB-P5 | 5 | Healing Balm: returns with no ill effect. | ok |
| SB-P6 | 6 | Warpstone Tincture: returns with Sprint and Jump Up, and must be the first player activated each turn. Activating another first is a Turnover. | differs: the game will not let another player act first, so the Turnover never happens |
| SB-P7 | 7 | Orca-Cola: returns, but leaves for the rest of the drive whenever an action ends in a Wide Zone or End Zone. A touchdown still counts. | ok |
| SB-P8 | 8 | Fungus Beer: +2 ST, Frenzy and Animal Savagery. Rolls a D6 at the start of every turn and dies on a 1. | ok |

## Beach Bowl (BB)

### Team building

| ID | Rule | Status |
| --- | --- | --- |
| BB-D1 | Draft budget 600,000. 7 to 11 players. At most 4 positional players. | ok |
| BB-D2 | Team re-rolls cost double the roster's listed price. | ok |
| BB-D3 | No Apothecary. Cheerleaders and Assistant Coaches are allowed. Dedicated Fans only in a league. | ok |
| BB-D4 | No Veteran. A Sevens team that enters keeps its Veteran, as in SB-D4. | differs |
| BB-D5 | Inducements: Blitzer's Best Kegs, the Halfling Master Chef and the Souvenir Shop. | ok |

### Match play

| ID | Rule | Status |
| --- | --- | --- |
| BB-M1 | Two halves of 6 turns. | ok |
| BB-M2 | The pitch is 20 long and 9 wide: Wide Zones of 2 rows and a Centre Field of 5. The layout along the pitch follows Sevens, with No Man's Land between two Lines of Scrimmage. The NAF text gives the size only; the No Man's Land is our reading of its "strong similarities" with Sevens. | ok |
| BB-M3 | Field as many players as possible, up to 7. At least 2 on the Line of Scrimmage in Centre Field, at most 1 in each Wide Zone. | ok |
| BB-M4 | Kick-off deviation is the lower of 2D6, as in Sevens. | ok |
| BB-M5 | Sand: -1 to the Armour roll after a failed Dodge or Rush; +1 to every other Armour roll. | ok |
| BB-M6 | Injury table (2D6, no Stunty table): 2-7 Stunned, 8-9 Mild Knock-out (recovers on 3+), 10-12 Serious Knock-out (recovers on 5+). There are no casualties. Regeneration does nothing. A Serious KO counts as a Casualty for SPP and tie-breaks. | ok: a Serious Knock-out is recorded in `GameState.seriousKnockoutIds` and counts as a Casualty through the same event as one, so SPP and casualty counts include it |
| BB-M7 | The ball does not bounce when it lands in an open square. A crowd throw-in goes D6 squares, counting the square it left from as the first. | ok |
| BB-M8 | Every Rush succeeds on 3+, before modifiers. | ok |
| BB-M9 | Fouls: before the Armour roll the fouled player's coach rolls a D6. On 4-6 the fouler is Knocked Down and it is a Turnover. On 1-3 the Foul goes ahead. | ok: the referee still watches, so a double on the Foul can still send the fouler off |
| BB-M10 | A Secret Weapon plays one drive, then misses the rest of the match. | ok: no Argue the Call or Bribe, since nothing is Sent-off |

### Kick-off table (2D6)

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| BB-K2 | 2 | High Tide: a random Wide Zone floods for the drive. Players in it move straight towards the middle until they reach Centre Field. A player pushed in goes to Reserves. A kick landing there is a touchback; a ball entering it returns to its last square. Our version: players wade out and a kick landing in the flood is a touchback. Pushes into the flood and a loose ball entering it are not handled yet. | differs |
| BB-K3 | 3 | Rousted: if the receiving team's marker is on turn 5, both markers go back one; if the receiving team has not had a turn this half, both go forward one; otherwise a D6 of 1-3 moves both forward, 4-6 back. | ok |
| BB-K4 | 4 | Lost Ball: D6. 1-3 a conch shell: -1 to pick-up, catch and intercept, and the carrier gains Mighty Blow (+1). 4-6 a beach ball: -1 to pass, +1 to pick-up, catch and intercept. Lasts the game or until rolled again. Our version: the conch carrier does not gain Mighty Blow. | differs |
| BB-K5 | 5 | High Kick: one Open receiving player may move to the landing square. | ok |
| BB-K6 | 6 | Samba!: D6 + Cheerleaders each; the higher gets a team re-roll for the drive. A tie gives nothing. | ok |
| BB-K7 | 7 | Brilliant Coaching: D6 + Assistant Coaches each; as BB-K6. | ok |
| BB-K8 | 8 | Changing Weather: roll new Beach Bowl weather. On Perfect Conditions the ball scatters one extra square. | ok |
| BB-K9 | 9 | Jellyfish!?: D6 each; the lower team, or both on a tie, has a random player make an Injury roll. | ok |
| BB-K10 | 10 | Seagull Attack: for the drive, -1 to Quick and Short passes and -2 to Long passes and Long Bombs. | ok |
| BB-K11 | 11 | Charge!: D3+1 Open kicking players may Move; one may Blitz and one may Throw Team-mate. A fall ends it. | ok |
| BB-K12 | 12 | Monster Wave: every player on the pitch moves D3 squares in one random direction, all at once. Anyone washed off the pitch goes to Reserves. Then the ball lands. | ok |

### Weather table (2D6)

| ID | Roll | Weather | Status |
| --- | --- | --- | --- |
| BB-W2 | 2 | Sweltering Heat: at the end of a drive the kicking team rolls a D3; that many random players from each team on the pitch miss the next drive. | ok |
| BB-W3 | 3 | Very Sunny: -1 to every Passing Ability test. | ok |
| BB-W4 | 4-10 | Perfect Conditions: no effect. | ok |
| BB-W11 | 11 | Pouring Rain: -1 to catch, pick-up and intercept. | ok |
| BB-W12 | 12 | Tropical Storm: every kick-off is a touchback. Quick and Short passes only. | ok |

### Souvenir Shop (D8, 50,000 each)

Assigned before a drive. Every souvenir breaks at the end of the half.
The game rolls each souvenir before the first drive. A souvenir nobody
carries yet stays in the bag for a later drive; one a player carries
breaks at the end of that half.

| ID | Roll | Souvenir | Status |
| --- | --- | --- | --- |
| BB-S1 | 1 | Sports Sandals: +1 to Rush. | ok |
| BB-S2 | 2 | Suntan Lotion: +1 to Dodge. | ok |
| BB-S3 | 3 | Thong: Disturbing Presence. | ok |
| BB-S4 | 4 | Sunglasses: Accurate and Safe Pass. | ok |
| BB-S5 | 5 | Bottle: Stab. | ok |
| BB-S6 | 6 | Puka Shell Necklace: Pro. | ok |
| BB-S7 | 7 | Sticky Bun: +1 to pick-up, catch and intercept; -1 to pass. | ok |
| BB-S8 | 8 | Gatorcade: Frenzy, Jump Up and No Ball. | ok |

## Gutter Bowl (GB)

### Team building

| ID | Rule | Status |
| --- | --- | --- |
| GB-D1 | Draft budget 750,000. At least 7 players. At most 5 players without the Lineman keyword. | ok |
| GB-D2 | Team re-rolls cost 100,000 for every roster. | ok |
| GB-D3 | No Sideline Staff: no Apothecary, Assistant Coaches or Cheerleaders. | ok |
| GB-D4 | No Veteran. A Sevens team that enters keeps its Veteran, as in SB-D4. | differs |
| GB-D5 | Only Gutter Bowl inducements: Lesser (50,000) and Superior (100,000) Magic Potions, Sawbones, Snack Stand and Novice Wizard. No Prayers to Nuffle. | ok |

### Inducements

Potions are given before a drive, after KO recovery, to a fit or KO'd
player. A player drinks at most one Gutter Bowl potion a game. A
potion's result that "recovers" a KO'd player sends them to the
Reserves.

| ID | Inducement | Rule | Status |
| --- | --- | --- | --- |
| GB-I1 | Lesser Magic Potion | 50,000, no limit. D8: 1 Manticore Venom, the player is removed with a Casualty roll; 2 Fresh Water, nothing; 3 Blood and Bootlaces IPA, Bone-head and -1 AG; 4 Healing Bairn, nothing more; 5 Fungus Broth, Projectile Vomit; 6 Warpstone Whiskey, Jump Up and Leap, must act first each turn; 7 Bugman's XXXXXX, Pro; 8 roll on the Superior table. Results 3 to 8 recover a KO'd player. | ok |
| GB-I2 | Superior Magic Potion | 100,000, no limit. A KO'd player always recovers. D8: 1 Endurance, AV +1 and the next Casualty is only a KO; 2 Mutation, a random Mutation skill; 3 Accuracy, PA +1; 4 Intelligence, Leader and Sidestep; 5 Grace, AG +1 and Sure Feet; 6 Speed, MA +1 and Sprint; 7 Strength, ST +1 and Stand Firm; 8 Rage, ST +2, Frenzy and Animal Savagery. | differs: Accuracy does not yet ignore range modifiers |
| GB-I3 | Sawbones | 50,000, 0-1. Once per game, after a Casualty roll on one of your players, roll a D6. On a 1 the player dies. On 2+ make a second Casualty roll and keep the better result; a Badly Hurt player goes to the Reserves. | ok |
| GB-I4 | Snack Stand | 100,000, 0-1. +1 to KO recovery. Each team re-roll the team uses comes back on a D6 of 6. | ok |
| GB-I5 | Novice Wizard | 100,000, 0-1. Once per game, at the end of your turn, pick an opposing player. Firebolt: on 3+ the target is Knocked Down, otherwise the nearest player to it is. Transmutation: on 3+ the target becomes a Frog until the end of the next drive and drops the ball. | differs: the Frog is the Sports-Wizard Frog, with No Ball in place of No Hands |

### Pitch

| ID | Rule | Status |
| --- | --- | --- |
| GB-P1 | Before the match roll a D6: 1-3 the Sewer, 4-6 the Street. The game rolls it when the match is created. | ok |
| GB-P2 | Both pitches are 26 × 15 with Wide Zones of 4 rows. Both sidelines are walls. | ok |
| GB-P3 | Four 6 × 4 blocks, two in each half: market stalls on the Street, sewer pits in the Sewer. The printed board's positions are not in the text, so the game places one block in each Wide Zone of each half, staggered and point-symmetric (`gutterObstacles` in pitchLayouts.ts). | differs |
| GB-P4 | Market stalls count as walls. Nobody may move into a stall or a pit. | ok |
| GB-P5 | Barricades are left out: the text does not say where they stand. | missing |

### Match play

| ID | Rule | Status |
| --- | --- | --- |
| GB-M1 | Two halves of 6 turns. | ok |
| GB-M2 | Up to 7 players per drive. At least 3 on the Line of Scrimmage, at most 2 in each Wide Zone. | ok |
| GB-M3 | The kick may not target a stall or a pit. A kick that deviates into one moves the minimum distance back onto the pitch in a D8 direction. A kick that hits a sideline bounces off the wall. Touchback only over an end line or into the kicking half. | ok |
| GB-M4 | A ball that hits a wall moves D6 squares in a throw-in template direction from where it would have gone. The D6 counts the square next to the wall as the first, as a throw-in does. | ok |
| GB-M5 | A dropped ball bounces twice on the cobbles. | ok |
| GB-M6 | Cobbles: +1 to every Armour roll after a fall. | ok |
| GB-M7 | Pushed into a wall or stall: D6, 1-3 nothing happens, 4+ the player Falls Over. After a POW! they fall with no roll. | ok |
| GB-M8 | Pushed into a sewer pit: a player next to a pit with no square to be pushed into goes in. In a pit a player has no Tackle Zone, cannot act and cannot be targeted. At the end of each team turn roll a D6 per player in a pit: 1 a Casualty, 2-3 stays, 4+ climbs out Standing onto the nearest free square. A 1 makes the 2025 Casualty roll. | ok |
| GB-M9 | A pass whose range ruler crosses a stall is at -1. A ball that lands on a stall or pit moves the minimum distance back onto the pitch in a D8 direction. The game follows the line between the centres of the two squares. | ok |
| GB-M10 | Ricochet passes work as SB-M9. As SB-M9. | differs |
| GB-M11 | No referee: nobody is Sent-off. One Foul per turn still applies. | ok |
| GB-M12 | Secret Weapons roll a D6 at the end of each drive: 1-3 the crowd removes them for the game, and a second D6 of 1 makes them a Casualty. 4+ they stay. Bribes do not help. | ok: a player removed for the game goes to the Sent-off box, and a Casualty makes a Casualty roll. No Bribe is offered |
| GB-M13 | Stalling: at the end of the team turn a stalling player is hit by a bottle on a D6 of 2+ and makes an Injury roll. | differs: the bottle is thrown when the stalling player's activation ends, as the Sevens crowd is, not at the end of the team turn. A hit is an Injury roll with no Armour roll, Steady Footing does not help, and it is a Turnover |
| GB-M14 | Injuries use the 2025 rulebook tables, with the Casualty roll. | ok, as SB-M13 |
| GB-M15 | Kick-off deviation is D6 squares, as in the 2025 rulebook. The Kick skill's D3 still applies. | ok |

### Kick-off tables (2D6)

Fan Factor in these tables is the team's Dedicated Fans, the same number the Sevens Pitch Invasion adds.

Street:

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| GB-KS2 | 2 | Falling Roof Tiles: every player in a random Wide Zone makes an Armour roll; a break means an Injury roll. | ok |
| GB-KS3 | 3 | Riot!: D6 per player on the pitch; on a 6 Placed Prone and Stunned. | ok |
| GB-KS4 | 4 | Quick Attack: one kicking player may Block before the first turn. | ok |
| GB-KS5 | 5 | Rogue Washing Line: each coach picks one random player who cannot act next turn. | ok |
| GB-KS6 | 6 | "This round is on us!": for the drive, a player who is KO'd rolls a D6 and goes to Reserves on 4+. | ok |
| GB-KS7 | 7 | Cheering Fans: D6 + Fan Factor each; the higher gets a team re-roll for the drive. A tie gives nothing. | ok |
| GB-KS8 | 8 | Changing Weather: roll new Street weather. On A Normal Day the ball scatters before landing. | ok |
| GB-KS9 | 9 | Loose Dogs: for the drive, no team re-rolls on pick-ups or Blocks. | ok |
| GB-KS10 | 10 | Black Market Dealer: each team gains a free Lesser Magic Potion, offered at the next drive break. | ok |
| GB-KS11 | 11 | Furious Neighbour: D6 + Fan Factor each; the lower team has a random player on the pitch KO'd. | ok |
| GB-KS12 | 12 | "The Guards are Coming!": each coach picks a random player and rolls a D6; on 1-2 they are arrested for the game. | ok |

Sewer:

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| GB-KW2 | 2 | Tentacled Terror: D6 each; the lower coach's player on the pitch becomes a Casualty. Our version: always Badly Hurt, until the Casualty roll is in. | differs |
| GB-KW3 | 3 | Riot!: as GB-KS3. | ok |
| GB-KW4 | 4 | Sudden Stink: every player on a Line of Scrimmage is pushed one square towards their own End Zone, pushing anyone behind them in turn. Our version: a push that would go into a pit does not happen. | differs |
| GB-KW5 | 5 | Bats!: D6 each; the lower coach's random player is Placed Prone and Stunned. | ok |
| GB-KW6 | 6 | "Get Ready, Lads!": each Open receiving player may move one square. | ok |
| GB-KW7 | 7 | Cheering Fans: as GB-KS7. | ok |
| GB-KW8 | 8 | Changing Weather: roll new Sewer weather. | ok |
| GB-KW9 | 9 | Sticky Sludge: for the drive, +1 to pick-up but a ball carrier cannot Pass. | ok |
| GB-KW10 | 10 | Black Market Dealer: as GB-KS10. | ok |
| GB-KW11 | 11 | 'Fresh' Sewage: every player within 2 squares of a pit is Placed Prone. | ok |
| GB-KW12 | 12 | Swarm of Rats: for the drive, a player who ends an activation next to a wall rolls a D6 and Falls Over on a 1; a Turnover only for the ball carrier. | ok |

### Weather tables (2D6)

| ID | Roll | Street | Sewer | Status |
| --- | --- | --- | --- | --- |
| GB-W2 | 2 | Clouds of Smog: Quick and Short passes only | Unbearable Stench: a random active player is Placed Prone at the end of each turn | ok |
| GB-W3 | 3 | Howling Winds: -1 to pass | Spilt Sewage: -2 to Rush | ok |
| GB-W4 | 4-10 | A Normal Day | No more Disgusting than usual | ok |
| GB-W11 | 11 | Sudden Downpour: -1 to Rush and pick-up | It's Getting Warm: -1 to pick-up and catch | ok |
| GB-W12 | 12 | A Stormy Night: Downpour, and a D6 of 1 at the end of each turn knocks a random player over | Underground Heatwave: at the end of a drive a D6 of 1 keeps a player out of the next drive | ok |
