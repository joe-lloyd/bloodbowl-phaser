# Blood Bowl Sevens rules (Spike! Journal 22)

This is the rule set the engine implements for Sevens, written from
[Spike! Journal Issue 22](https://www.warhammer.com/en-US/shop/blood-bowl-spike-issue-22-2026-eng)
(August 2026, printed pages 7 to 20). It is a summary in our own words for
building the game, not a copy of the magazine. Anything not listed here
follows the 2025 rulebook.

Each rule has an ID so code, tests and pull requests can cite it. The
status column compares the engine on 25 October 2026:

- **ok**: the engine already does this.
- **differs**: the engine has the feature with different numbers or effects.
- **missing**: the engine does not have it.

The progression switch stays. Each team can still choose Advanced League
with SPP instead of the official Sevens advancement in section 6.

## 1. Pitch and dugout

| ID | Rule | Status |
| --- | --- | --- |
| P1 | The pitch is 20 squares long and 11 wide: an End Zone at each short edge, Wide Zones 2 squares wide on each long edge, and a Centre Field 7 squares wide. The magazine gives the widths; the length is counted from its pitch photo. | ok |
| P2 | Two Lines of Scrimmage cross the pitch. The area between them is No Man's Land and includes the Wide Zone squares there. In the photo each half is 7 columns including the End Zone, which leaves 6 columns of No Man's Land. | ok |
| P3 | Each half has one Trapdoor in one of its Wide Zones. Trapdoors only matter for the Treacherous Trapdoor prayer (L12). | missing |
| P4 | Six turns per half. The turn and re-roll trackers run to 6. | ok |

## 2. Drafting a team

| ID | Rule | Status |
| --- | --- | --- |
| D1 | The draft budget is 600,000. Unspent gold goes to the Treasury in a league and is lost in Matched Play. | ok for the budget; check what happens to unspent gold |
| D2 | A team has 7 to 11 permanently hired players. League injuries may take it below 7. | ok |
| D3 | At most 4 players without the Lineman keyword. Each position's own limit still applies. | ok |
| D4 | Team re-rolls cost 100,000 each, at the draft and during a league. | ok: capped at 6, the top of the re-roll tracker |
| D5 | Assistant Coaches and Cheerleaders cost 20,000 each, with at most 3 of each, at the draft or during a league. | ok |
| D6 | An Apothecary costs 80,000 and needs a roster that allows one. At most one. | ok |
| D7 | League teams start with Dedicated Fans 1 and can buy more at 20,000 each. Fans stay between 1 and 5. Matched Play teams start at 0. | ok: nothing changes Dedicated Fans after a game yet, so only the cap of 5 is enforced |
| D8 | Choose one Lineman as the Veteran. The Veteran has MA -1 and one re-roll per game for a failed pick-up, catch, Pass Action, or a Block where the Veteran would be Knocked Down. | ok: a draft with a Lineman needs one; scenario test teams have none |

## 3. Match play

| ID | Rule | Status |
| --- | --- | --- |
| M1 | Set up at most 7 players, kicking team first, between your End Zone and your Line of Scrimmage. At most one player per Wide Zone, at least 3 in the Centre Field on your Line of Scrimmage, and nobody in No Man's Land. Spare players go to Reserves. | ok |
| M2 | A team that cannot put 3 on its Line of Scrimmage may concede without penalty, as in the rulebook. Otherwise every available player stands on the line. | ok |
| M3 | Kick-off deviation distance is the lower of 2D6. The Kick skill's D3 still applies. | ok |
| M4 | A kick that lands in No Man's Land is not a touchback. A touchback happens only when the ball leaves the pitch or crosses the kicking team's Line of Scrimmage. | ok |
| M5 | Throw-in distance is D6+2 instead of 2D6. Everything else is unchanged. | ok |
| M6 | Argue the Call: on a D6, 1 to 4 means the player is still Sent-off; 5 or 6 means the player returns to their square. Either way the Turnover stands, and the coach is never ejected. | ok |

### Kick-off event table (2D6)

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| K2 | 2 | Get the Ref: each team gets a free Bribe that lasts until the end of the game. | ok |
| K3 | 3 | Time-Out: if the kicking team's marker is on turn 5 or 6, both markers go back one; otherwise both go forward one. | ok |
| K4 | 4 | Alert Defence: the kicking coach picks up to D3+1 Open players. Each may move one square in any direction, even into No Man's Land. | ok |
| K5 | 5 | High Kick: if the ball will land between the receiving End Zone and the receiving Line of Scrimmage, one Open receiving player may be placed on the landing square. Not in No Man's Land. | ok |
| K6 | 6 | Cheering Fans: D6 plus Cheerleaders each. The higher coach, or both on a tie, gets an extra Offensive Assist on the first Block of their next turn. | ok |
| K7 | 7 | Brilliant Coaching: D6 plus Assistant Coaches each. The higher coach, or both on a tie, gets a free re-roll that expires at the end of the drive. | ok |
| K8 | 8 | Changing Weather: roll new weather. Perfect Conditions makes the ball Scatter (3) in the air. | ok |
| K9 | 9 | Quick Snap: the receiving coach picks up to D3+1 Open players. Each may move one square in any direction, even into No Man's Land. | ok |
| K10 | 10 | Charge!: the kicking coach picks up to D3+1 Open players and activates them one by one for a free Move. One may Blitz instead, one may Throw Team-mate and one may Kick Team-mate. A player who falls or is Knocked Down ends the Charge. | ok |
| K11 | 11 | Dodgy Snack: both coaches roll a D6. The lower one, or both on a tie, picks a random player on the pitch and rolls a D6. On a 2 or more that player has MA and AV -1 for the drive. On a 1 they go to the Reserves for the drive. | ok |
| K12 | 12 | Pitch Invasion: D6 plus Dedicated Fans each. The lower coach, or both on a tie, picks one random player on the pitch, who is Placed Prone and Stunned. | ok |

### Injury tables (2D6)

These replace the rulebook's injury table and the casualty roll. There is
no Casualty Roll and there are no Lasting Injuries in Sevens.

| ID | Standard | Stunty | Result |
| --- | --- | --- | --- |
| I1 | 2 to 7 | 2 to 6 | Stunned |
| I2 | 8 to 9 | 7 to 8 | Knocked-out |
| I3 | 10 | 9 to 10 | Badly Hurt: out for the rest of the game, no further effect |
| I4 | 11 | 11 | Seriously Hurt: out for the rest of the game and, in a league, misses the next game |
| I5 | 12 | 12 | Dead: out of the game and, in a league, removed from the roster |

Status: **ok**. Skills that act on the injury roll, such as Thick Skull,
Mighty Blow and Stunty, keep working on the 2D6 roll. A modified total above
12 is Dead. Thick Skull still turns the table's lowest KO total into Stunned:
8 on the standard table, 7 on the Stunty table.

Where the magazine is silent, the engine does this:

- Decay only modifies the Casualty Roll, so it has no effect in Sevens. Its
  rule is not registered.
- Regeneration still saves on a 4+ before a Badly Hurt, Seriously Hurt or
  Dead result is applied.
- A Bloodlust bite that would cause a casualty is Badly Hurt, as in the
  rulebook.
- The Apothecary keeps the Sevens patch-up from the sevens-apothecary spec.
  On a KO on the pitch the player stays Stunned; on a KO in the crowd the
  player goes to Reserves. On any casualty result the coach rolls a D6, and
  on a 4+ the player goes to Reserves. The rulebook's second Casualty Roll
  has no Sevens equivalent, so the engine does not re-roll the 2D6.
- Seriously Hurt records Miss Next Game on the player and Dead records Dead.
  Nothing yet makes a Miss Next Game player sit out the next league game or
  takes a dead player off the roster.

## 4. League play

| ID | Rule | Status |
| --- | --- | --- |
| L1 | The league runs as in the rulebook unless a rule here changes it. | ok |
| L2 | Journeymen may be hired only up to 7 available players, and they have Loner (5+) instead of Loner (4+). | check |
| L3 | Inducements available: up to 2 Temp Agency Cheerleaders at 15,000; up to 2 Part-time Assistant Coaches at 15,000; up to 2 Blitzer's Best Kegs at 50,000; up to 2 Prayers to Nuffle at 5,000; up to 6 Extra Team Training at 125,000; up to 2 Bribes at 100,000, or 50,000 with Bribery and Corruption; 1 Wandering Apothecary at 100,000 for teams that may hire an Apothecary; 1 Mortuary Assistant at 100,000 with Masters of Undeath; 1 Plague Doctor at 100,000 with Favoured of Nurgle; 1 Halfling Master Chef at 300,000, or 100,000 for Halfling teams; up to 5 Desperate Measures at 50,000. Nothing else, so no Star Players. | differs: different prices and limits, and purchases have no effect yet |
| L4 | Prayers to Nuffle use the D8 table below. | missing |
| L5 | Desperate Measures: each one bought rolls on the D8 table below, re-rolling duplicates. Each result can be used once per game. | missing |
| L6 | No player or Sideline Staff may be fired after a game, and nobody can Temporarily Retire. | check |

### Prayers to Nuffle (D8)

| ID | Roll | Prayer |
| --- | --- | --- |
| L12 | 1 | Treacherous Trapdoor: whenever any player enters a Trapdoor square, roll a D6. On a 1 they fall through, take an injury roll as if pushed into the crowd, and a ball they carried bounces from the Trapdoor. |
| L13 | 2 | Stiletto: a random player of yours gains Stab for the game. |
| L14 | 3 | Iron Man: a player of your choice gains +1 AV for the game, to a maximum of 11+. |
| L15 | 4 | Knuckle Dusters: a player of your choice gains Mighty Blow for the game. |
| L16 | 5 | Blessing of Nuffle: a random player of yours gains Pro for the game. |
| L17 | 6 | Moles Under the Pitch: opposition Rush rolls are at -1. |
| L18 | 7 | Under Scrutiny: an opposition Foul that breaks armour is always Sent-off, double or not. |
| L19 | 8 | Intensive Training: a random player of yours gains one Primary skill of your choice for the game. |

### Desperate Measures (D8)

| ID | Roll | Measure | When it is used |
| --- | --- | --- | --- |
| L21 | 1 | You Dope!: one player gets +1 ST or +1 AG for the game. At the end of each drive they played, roll a D6: on 1 or 2 they are Knocked-out and cannot recover this end-of-drive. | after both set-ups, before the kick |
| L22 | 2 | Razzle-Dazzle: the player declares two different Actions in one activation, at most one of which includes a Move. | when activating a player |
| L23 | 3 | Hangover: one chosen opposition player misses the first drive. | before the first set-up |
| L24 | 4 | Grudge Match: this player may Foul even if your team already has, and cannot be Sent-off for it. | when activating a player |
| L25 | 5 | Set Piece: this Pass is Accurate on any 2+ whatever the passer's PA, and the receiver catches on any 2+ whatever their AG. | when a player passes |
| L26 | 6 | Sports Espionage: after a Turnover resolves, your team gains two team re-rolls. They cannot re-roll the dice that caused that Turnover. | when your team suffers a Turnover |
| L27 | 7 | Discarded Banana Skin: an opposition player entering one of your Tackle Zones is Placed Prone and their activation ends. It is a Turnover only if they held the ball. | when an opponent enters your Tackle Zone |
| L28 | 8 | Magic Scroll: your team gets a free Sports-Wizard Inducement. | before set-up |

## 5. Re-drafting between seasons

| ID | Rule | Status |
| --- | --- | --- |
| R1 | Players due to miss the next game recover. Roll to lose Hatred as usual. Temporary retirement does not apply. | missing |
| R2 | Emergency Call-ups: roll a D6 for each player with an added skill. On a 1 the player leaves the team. | missing |
| R3 | The re-draft budget is 600,000 plus the Treasury plus 10,000 per win last season, capped at 750,000. | missing |

## 6. Advancement

These rules apply to the official Sevens mode, called Sevens Skill
Selection in the game. Advanced League with SPP stays available as the
alternative.

| ID | Rule | Status |
| --- | --- | --- |
| A1 | No SPP. After each game one player gains one randomly chosen skill. | ok |
| A2 | For a Primary skill, the coach chooses any player who did not end the game as a Casualty and picks a Primary category. The coach names a skill, then the opponent, then the coach again. A D3 decides which of the three the player learns. | ok: the three named skills must differ, and Manage Team asks each coach in turn |
| A3 | For a Secondary skill, the player is picked at random from those who did not end the game as a Casualty, and the skill is rolled at random, as on page 97 of the rulebook. | ok: the coach picks one of the player's Secondary categories, rolls twice and keeps one, as page 97 says |
| A4 | Leader and Pro can never be gained this way. | ok |
| A5 | A Primary skill adds 10,000 to the player's value the first time and 20,000 after that. A Secondary skill adds 20,000, then 30,000. | ok |
| A6 | Drafted Players: after advancement, roll a D6 for each player with added skills. On a result at or under the number of added skills, a pro team makes an offer. Pay the player's current value from the Treasury to keep them, and their value rises by 15,000. Otherwise they leave. | ok: an offer the Treasury cannot pay releases the player at once |

## 7. Matched Play

| ID | Rule | Status |
| --- | --- | --- |
| MP1 | Draft with 600,000, which events may raise. Unspent gold is lost. Sideline Staff and Inducements go on the draft list and are paid from the same budget. | check |
| MP2 | Inducements are bought straight from the draft budget with no petty cash. The team must still have at least 7 players. | differs: the engine uses petty cash |
| MP3 | Dedicated Fans start at 0. | ok |
| MP4 | Each roster sits in one of four tiers, using the Sevens tier list from the Designers' Commentary, as transcribed at [bloodbowlbase.ru](https://bloodbowlbase.ru/bb2025/spike_journal/issue_22/) under "Sevens team tiers". Tier 1: Amazon, Chaos Dwarf, Dark Elf, Elven Union, Human, High Elf, Necromantic Horror, Norse, Old World Alliance, Skaven, Wood Elf. Tier 2: Bretonnian, Dwarf, Imperial Nobility, Lizardmen, Nurgle, Orc, Shambling Undead, Tomb Kings, Vampire. Tier 3: Black Orc, Chaos Chosen, Chaos Renegade, Halfling, Khorne, Underworld Denizens. Tier 4: Gnome, Goblin, Ogre, Snotling. | ok |
| MP5 | A team gets Skill Points equal to its tier number, from 1 for tier 1 to 4 for tier 4. | ok |
| MP6 | A Primary skill costs 1 point. A Secondary skill costs 2 points, and only one per team. Each player gets at most one added skill. At most two Elite skills per team. Purchased skills do not raise team value. | ok: Elite skills are Block, Dodge, Guard and Mighty Blow, as in the engine's rulebook list |
| MP7 | No SPP and no advancement during Matched Play games. | ok |
