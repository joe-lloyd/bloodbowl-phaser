# Blood Bowl Sevens rules (Spike! Journal 22)

This is the rule set the engine implements for Sevens, written from
[Spike! Journal Issue 22](https://www.warhammer.com/en-US/shop/blood-bowl-spike-issue-22-2026-eng)
(August 2026, printed pages 7 to 20). It is a summary in our own words for
building the game, not a copy of the magazine. Anything not listed here
follows the 2025 rulebook.

The GW rulebook, Sevens supplement, and official errata take precedence.
For ambiguous interactions, the game uses
[NAF clarifications](https://www.thenaf.net/naf-recommendations-and-clarifications-for-bb2025/).
Deliberate NAF departures are optional. The organizer chooses the rules
when creating a tournament or league season. The choice is stored and
cannot change during that competition, including through a cloud write.

The default is **GW 2025 Sevens**. The optional **NAF Sevens rulings of
26 September 2026** ignore Insignificant when drafting a roster. Other
roster limits still apply. Team Builder has a separate draft-rules choice
for preparing such a roster. Entry always validates against the competition's
choice, regardless of the team's draft setting. Friendly matches use the GW
baseline. Existing teams and competitions without a setting use that baseline.

Swarming applies in both profiles. GW's
[Sevens designer notes](https://www.warhammer-community.com/en-gb/articles/f0owm2ar/designers-notes-on-blood-bowl-sevens/)
acknowledge Snotlings as an exception to the seven-player limit, and the NAF
Sevens table explicitly confirms it. Disabling Swarming would be a house rule.

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
| P3 | Each half has one Trapdoor in one of its Wide Zones. Trapdoors only matter for the Treacherous Trapdoor prayer (L12). | ok: the photo puts them near (5,0-1) and (14,9-10); the engine uses the inner Wide Zone row, (5,1) in team 1's half and (14,9) in team 2's half (`TRAPDOOR_SQUARES` in GameConfig.ts) |
| P4 | Six turns per half. The turn and re-roll trackers run to 6. | ok |

## 2. Drafting a team

| ID | Rule | Status |
| --- | --- | --- |
| D1 | The draft budget is 600,000. Unspent gold goes to the Treasury in a league and is lost in Matched Play. | ok for the budget; check what happens to unspent gold |
| D2 | A team has 7 to 11 permanently hired players. League injuries may take it below 7. | ok: only a draft must reach 7. A league team below 7 stays legal to play and to enter a competition, and Journeymen make up the numbers (L2) |
| D3 | At most 4 players without the Lineman keyword. Each position's own limit still applies. | ok |
| D4 | Team re-rolls cost 100,000 each, at the draft and during a league. | ok: capped at 6, the top of the re-roll tracker. A league re-roll is not doubled as in the rulebook (league-treasury spec) |
| D5 | Assistant Coaches and Cheerleaders cost 20,000 each, with at most 3 of each, at the draft or during a league. | ok |
| D6 | An Apothecary costs 80,000 and needs a roster that allows one. At most one. | ok |
| D7 | League teams start with Dedicated Fans 1 and can buy more at 20,000 each. Fans stay between 1 and 5. Matched Play teams start at 0. | ok: at full time a league team rolls for Dedicated Fans as on page 99 of the rulebook, then stays within 1 to 5. The result follows the played score, so a conceded 0-0 is a draw |
| D8 | Choose one Lineman as the Veteran. The Veteran has MA -1 and one re-roll per game for a failed pick-up, catch, Pass Action, or a Block where the Veteran would be Knocked Down. | ok: a draft with a Lineman needs one; scenario test teams have none |

## 3. Match play

| ID | Rule | Status |
| --- | --- | --- |
| M1 | Normal setup fields at most 7 players, kicking team first, between your End Zone and your Line of Scrimmage. At most one player per Wide Zone, at least 3 in the Centre Field on your Line of Scrimmage, and nobody in No Man's Land. Spare players go to Reserves. Swarming is the exception in M7. | ok |
| M2 | A team that cannot put 3 on its Line of Scrimmage may concede without penalty, as in the rulebook. Otherwise every available player stands on the line. | ok |
| M3 | Kick-off deviation distance is the lower of 2D6. The Kick skill's D3 still applies. | ok |
| M4 | A kick that lands in No Man's Land is not a touchback. A touchback happens only when the ball leaves the pitch or crosses the kicking team's Line of Scrimmage. | ok |
| M5 | Throw-in distance is D6+2 instead of 2D6. Everything else is unchanged. | ok |
| M6 | Argue the Call: on a D6, 1 to 4 means the player is still Sent-off; 5 or 6 means the player returns to their square. Either way the Turnover stands, and the coach is never ejected. | ok: Bribery and Corruption re-rolls a 1 once per game (T3) |
| M7 | After both normal setups, a team with Swarming may add D3 reserve Linemen before the kick. Only available Linemen may join. The confirmed formation stays in place, and the usual setup-area and Wide Zone limits apply. The coach may decline some or all extras. | ok: the allowance and placements survive save/resume and online snapshots. Each new drive rolls again. Computer coaches place eligible extras through the same setup commands. |

Swarming does not apply in Sevens. The 2025 rulebook's Snotling special
rule (p.155) adds D3 Linemen after both set-ups, beyond "the usual maximum
of 11 players". Sevens caps a set-up at seven (M1), so the engine treats
Swarming as a dead rule: the Snotling roster still lists it, and nothing
reads it.

A knockout tie cannot end level. The 2025 rulebook (p. 87) plays Extra
Time and then Penalties, and the Sevens rules add nothing. The game plays
Extra Time as one more Sevens half of 6 turns per team, where the rulebook
says 8 for its 8-turn halves. Team Re-rolls are not replenished for it. A
roll-off decides which coach chooses who kicks. If the score is still
level, a Penalty Shoot-out of five roll-offs, re-rolling ties, decides the
game and the result records it. A league or round-robin game may still end
level.

### Kick-off event table (2D6)

| ID | Roll | Event | Status |
| --- | --- | --- | --- |
| K2 | 2 | Get the Ref: each team gets a free Bribe that lasts until the end of the game. | ok |
| K3 | 3 | Time-Out: if the kicking team's marker is on turn 5 or 6, both markers go back one; otherwise both go forward one. | ok |
| K4 | 4 | Alert Defence: the kicking coach picks up to D3+1 Open players. Each may move one square in any direction, even into No Man's Land. | ok |
| K5 | 5 | High Kick: if the ball will land between the receiving End Zone and the receiving Line of Scrimmage, one Open receiving player may be placed on the landing square. Not in No Man's Land. | ok: a landing square someone already holds takes nobody, so the step is skipped with a log line |
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
  has no Sevens equivalent, so the engine does not re-roll the 2D6. A
  successful patch-up clears the casualty from the player's record. A Dead
  result only counts as a kill, for Plague Ridden too, once the Apothecary
  is declined or fails.
- Masters of Undeath uses that confirmed Dead result in place of a
  Casualty Roll. Once per match, an opposition victim with ST 4 or less
  and without Stunty adds the roster's first Lineman to Reserves. As with
  Plague Ridden, this happens automatically. Regeneration and successful
  Apothecary saves prevent it. The extra player may temporarily exceed
  the Sevens roster limit of 11. After a league match, Manage Team offers
  the coach a free permanent hire or release. Hiring requires room under
  that limit and adds the player's full value. Matched Play retains no
  recruit. An unhired recruit does not count toward team value or the next
  match's available players. The use and recruit survive a saved match;
  online resumes retain full rosters, including injuries and skill parameters.
- Seriously Hurt records Miss Next Game on the player and Dead records Dead.
  In a league, a Miss Next Game player sits the next game out in the
  Casualty box and the record is cleared as that game starts. A dead player
  is removed from the roster the next time the team is loaded. Team value
  leaves out both, as the rulebook's Current Team Value does. Matched Play
  teams keep every player: injuries do not carry there. A team loaded from
  the library keeps only the injuries that carry, so Badly Hurt is gone
  after its game and a Matched Play team has none.

## 4. League play

| ID | Rule | Status |
| --- | --- | --- |
| L1 | The league runs as in the rulebook unless a rule here changes it. | ok: winnings, spending the Treasury and Expensive Mistakes follow the rulebook, as the league-winnings and league-treasury specs describe |
| L2 | Journeymen may be hired only up to 7 available players, and they have Loner (5+) instead of Loner (4+). | ok: in a league fixture, a league team with fewer than 7 available players gets Journeymen from its first Lineman position at kick-off. Friendlies and tournament games take on none. After the game Manage Team offers each one who played for their Hiring Fee plus any Value Increase; the rest leave (league-treasury spec) |
| L3 | Inducements available: up to 2 Temp Agency Cheerleaders at 15,000; up to 2 Part-time Assistant Coaches at 15,000; up to 2 Blitzer's Best Kegs at 50,000; up to 2 Prayers to Nuffle at 5,000; up to 6 Extra Team Training at 125,000; up to 2 Bribes at 100,000, or 50,000 with Bribery and Corruption; 1 Wandering Apothecary at 100,000 for teams that may hire an Apothecary; 1 Mortuary Assistant at 100,000 with Masters of Undeath; 1 Plague Doctor at 100,000 with Favoured of Nurgle; 1 Halfling Master Chef at 300,000, or 100,000 for Halfling teams; up to 5 Desperate Measures at 50,000. Nothing else, so no Star Players. | ok: Prayers to Nuffle and Desperate Measures can be bought; their tables are L4 and L5. See the notes below the table for what each inducement does. |
| L4 | Prayers to Nuffle use the D8 table below. | ok |
| L5 | Desperate Measures: each one bought rolls on the D8 table below, re-rolling duplicates. Each result can be used once per game. | ok |
| L6 | No player or Sideline Staff may be fired after a game, and nobody can Temporarily Retire. | ok: a team that has played is refused when it fires a player, and cannot sell back staff. The game has no Temporary Retirement |

What each L3 inducement does in the engine, from the 2025 rulebook pages
147 to 149:

- Temp Agency Cheerleaders and Part-time Assistant Coaches add 1 each to
  the Cheering Fans and Brilliant Coaching rolls.
- Each Blitzer's Best Keg adds 1 to its team's KO recovery rolls.
- Each Extra Team Training adds a team re-roll to every half. The re-roll
  tracker runs to 6 (P4), so a team never starts a half with more than 6.
- A Bribe is offered when Argue the Call fails. That includes a Secret
  Weapon Sent-off at the end of a drive, which argues first as the
  rulebook allows on page 87. On a 2+ the player stays and there is no
  Turnover; on a 1 the Bribe is lost. Free Bribes from Get the Ref are
  spent before bought ones. The May 2026 FAQ says a team that cannot Argue
  the Call goes straight to Bribes. In Sevens the coach is never ejected
  (M6), so every Sent-off can be argued and that case does not arise.
- A Wandering Apothecary or a Plague Doctor is one more Apothecary use,
  spent after the team's own Apothecary.
- A Mortuary Assistant or a Plague Doctor re-rolls one failed
  Regeneration roll. The engine always takes the re-roll, Mortuary
  Assistant first.
- A Halfling Master Chef rolls three D6 at the start of each half, before
  its first Kick-off. Each 4+ moves one team re-roll from the opposition
  to the chef's team for that half. The opposition cannot drop below 0.
- Plague Doctor needs Favoured of Nurgle. A Chaos Chosen or Chaos
  Renegade team that chose Nurgle has it (T4).

### Prayers to Nuffle (D8)

| ID | Roll | Prayer | Status |
| --- | --- | --- | --- |
| L12 | 1 | Treacherous Trapdoor: whenever any player enters a Trapdoor square, roll a D6. On a 1 they fall through, take an injury roll as if pushed into the crowd, and a ball they carried bounces from the Trapdoor. | ok |
| L13 | 2 | Stiletto: a random player of yours gains Stab for the game. | ok |
| L14 | 3 | Iron Man: a player of your choice gains +1 AV for the game, to a maximum of 11+. | ok |
| L15 | 4 | Knuckle Dusters: a player of your choice gains Mighty Blow for the game. | ok |
| L16 | 5 | Blessing of Nuffle: a random player of yours gains Pro for the game. | ok |
| L17 | 6 | Moles Under the Pitch: opposition Rush rolls are at -1. | ok |
| L18 | 7 | Under Scrutiny: an opposition Foul that breaks armour is always Sent-off, double or not. | ok |
| L19 | 8 | Intensive Training: a random player of yours gains one Primary skill of your choice for the game. | ok |

Where the magazine is silent, the engine does this:

- Prayers and Desperate Measures are rolled once, before the first set-up,
  as soon as both coaches have confirmed their inducements. A prayer the
  team already has is re-rolled, as on page 146 of the rulebook.
- A random player is drawn from the team's players who can still play
  this game: not a casualty or Sent-off. A player who already has
  the skill gains nothing.
- Iron Man offers only players below AV 11+. Knuckle Dusters offers only
  players without Mighty Blow. Intensive Training offers every skill in the
  player's Primary categories that they could legally take.
- Every skill and characteristic a prayer grants is taken back at full
  time, so it never reaches the roster.
- A player enters a Trapdoor by a Move step, a Jump landing, a push or
  chain push, a follow-up, or a thrown player's landing. The roll comes
  before any pick-up on that square. Set-up, kick-off events and reaction
  moves such as Shadowing, Diving Tackle and On the Ball do not roll.
- Falling through a Trapdoor is a Turnover when the player belongs to the
  active team, as a push into the crowd is. A Stunned result sends the
  player to the Reserves, as in the crowd.
- Moles Under the Pitch puts -1 on every Rush the other team makes. Both
  teams can hold it.
- Under Scrutiny still leaves the fouler their Argue the Call roll and
  any Bribe, as for any Sent-off.

### Desperate Measures (D8)

| ID | Roll | Measure | When it is used | Status |
| --- | --- | --- | --- | --- |
| L21 | 1 | You Dope!: one player gets +1 ST or +1 AG for the game. At the end of each drive they played, roll a D6: on 1 or 2 they are Knocked-out and cannot recover this end-of-drive. | after both set-ups, before the kick | ok |
| L22 | 2 | Razzle-Dazzle: the player declares two different Actions in one activation, at most one of which includes a Move. | when activating a player | ok |
| L23 | 3 | Hangover: one chosen opposition player misses the first drive. | before the first set-up | ok |
| L24 | 4 | Grudge Match: this player may Foul even if your team already has, and cannot be Sent-off for it. | when activating a player | ok |
| L25 | 5 | Set Piece: this Pass is Accurate on any 2+ whatever the passer's PA, and the receiver catches on any 2+ whatever their AG. | when a player passes | ok |
| L26 | 6 | Sports Espionage: after a Turnover resolves, your team gains two team re-rolls. They cannot re-roll the dice that caused that Turnover. | when your team suffers a Turnover | ok |
| L27 | 7 | Discarded Banana Skin: an opposition player entering one of your Tackle Zones is Placed Prone and their activation ends. It is a Turnover only if they held the ball. | when an opponent enters your Tackle Zone | ok |
| L28 | 8 | Magic Scroll: your team gets a free Sports-Wizard Inducement. | before set-up | ok |

Where the magazine is silent, the engine does this:

- Each measure is offered at its trigger point until it is used. A coach
  may decline and keep it. Hangover has only the one trigger, so a declined
  Hangover is never offered again.
- You Dope! is offered before every kick-off. +1 AG improves the target by
  one, down to 1+, and ST stops at 8. Only a doped player still on the
  pitch when a drive ends rolls, and nobody rolls at full time.
- Grudge Match is offered as a yes or no when the player makes their Foul.
  A second Foul in one turn can only be declared on it and spends it. It
  beats Under Scrutiny.
- Set Piece is offered when a Pass is made, never a Hail Mary Pass. The
  Pass is Accurate on a 2 or more and fumbled only on a natural 1, with no
  modifiers. A team-mate catching that Pass catches on a 2 or more. Normal
  re-rolls still apply.
- Sports Espionage is offered once a Turnover in the team's own turn has
  resolved, not after a touchdown. The two re-rolls count as Team Re-rolls
  for the rest of the half and are lost at half time.
- Discarded Banana Skin is offered when an opposing player's Move step
  ends in a Tackle Zone of the holding team, after any Trapdoor roll and
  before any pick-up. There is no Armour Roll. A ball on that square
  Bounces either way; only a held ball makes it a Turnover.
- Razzle-Dazzle is switched on in the action menu as the player is
  activated, and goes with the first Action declared (`razzleDazzle` on the
  protocol's `declare-action`). It is spent once that Action binds, so a
  declaration cancelled before anything happens keeps it. When the first
  Action ends, the activation stays open and the menu comes back for the
  second. Ending the activation then forgoes it.
- The second Action may not be the first again, and the two may not both
  contain a Move. The Actions with a Move are Move, Blitz, Pass, Hand-off,
  Foul, Secure the Ball, Throw Team-mate, Punt, Hypnotic Gaze and Ball &
  Chain. So Move then Block, or Block then Pass, are allowed; Move then
  Pass is not. Blitz then Block counts as two different Actions.
- The second Action starts from where the player stands. Movement the
  first one spent still counts against the player's MA, which matters only
  when the first was a Block and the second moves. Once-per-turn limits
  apply as usual, so a team that has passed cannot Pass as a second Action.
  Activation rolls such as Bone Head come with the first Action only.
- A Turnover, or the player ending the first Action down or off the pitch,
  ends the activation with the turn: there is no second Action.
- Magic Scroll is read as soon as the measures are rolled, before the first
  set-up, since nothing is gained by keeping it. The team gains the
  Sports-Wizard from page 149 of the rulebook.
- The Sports-Wizard casts once per game. At the end of each Turn, ended by
  End Turn or by a Turnover once it has resolved, each coach with an uncast
  wizard is asked, the coach whose Turn ended first. That includes the last
  Turn of a half. The coach may keep it. Nothing between Turns is a
  Turnover. A touchdown ends the drive rather than the Turn, so the wizard
  is not offered then.
- Fireball picks any square on the pitch. Every player in it or next to it
  rolls a D6 and is hit on a 4+. A Standing player hit is Knocked Down, and
  every player hit has an Armour Roll at +1. A ball dropped this way
  Bounces once the Armour Rolls are made.
- Zap! picks any player on the pitch, either team's. On a natural 1, or
  under the player's ST, nothing happens; at or over ST, or a natural 6,
  the player becomes a Frog: MA 5, ST 1, AG 2+, PA -, AV 5+, with Dodge,
  Leap, No Ball, Stunty, Titchy and Very Long Legs. A held ball Bounces. A
  Frog's Casualty is Badly Hurt and no Apothecary may treat it. At the end
  of the drive the player gets their own profile back; a Frog knocked out
  or hurt stays knocked out or hurt.
- Prayer and measure choices reach the browser as a dialog and the headless
  protocol as an `inducement-choice` decision answered with
  `choose-inducement`. The Sports-Wizard's offer is one too, of kind
  `sports-wizard`, answered with a `spell` and a `playerId` for Zap! or
  `x` and `y` for Fireball. In the browser the coach picks the spell in
  the dialog, then clicks its target on the pitch. Grudge Match, Set Piece, Sports Espionage and
  Discarded Banana Skin are yes or no `reaction` decisions.
- The simulator gives both teams 2 Prayers to Nuffle and 5 Desperate
  Measures, free, in every match it plays.

## 5. Re-drafting between seasons

| ID | Rule | Status |
| --- | --- | --- |
| R1 | Players due to miss the next game recover. Roll to lose Hatred as usual. Temporary retirement does not apply. | ok in the rules: a gained Hatred is lost on a 4+ |
| R2 | Emergency Call-ups: roll a D6 for each player with an added skill. On a 1 the player leaves the team. | ok in the rules |
| R3 | The re-draft budget is 600,000 plus the Treasury plus 10,000 per win last season, capped at 750,000. | ok in the rules |

`beginRedraft` in `src/game/rules/redraft.ts` runs R1, R2 and R3 in order.
The game has no seasons and no re-draft screen, so nothing calls it yet. That
screen would need the wins of the season just ended, and a way to re-hire
players and staff from the budget onto a new Team Draft List. A player not
re-hired is let go, which is not firing, so L6 does not stop it.

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
| MP2 | Inducements are bought straight from the draft budget with no petty cash. The team must still have at least 7 players. | ok: the Team Builder adds them to the draft list, they come with the team to every match, and they do not count toward team value. A Matched Play team gets no petty cash. A purchase cannot be undone in the builder yet. |
| MP3 | Dedicated Fans start at 0. | ok |
| MP4 | Each roster sits in one of four tiers, using the Sevens tier list from the Designers' Commentary, as transcribed at [bloodbowlbase.ru](https://bloodbowlbase.ru/bb2025/spike_journal/issue_22/) under "Sevens team tiers". Tier 1: Amazon, Chaos Dwarf, Dark Elf, Elven Union, Human, High Elf, Necromantic Horror, Norse, Old World Alliance, Skaven, Wood Elf. Tier 2: Bretonnian, Dwarf, Imperial Nobility, Lizardmen, Nurgle, Orc, Shambling Undead, Tomb Kings, Vampire. Tier 3: Black Orc, Chaos Chosen, Chaos Renegade, Halfling, Khorne, Underworld Denizens. Tier 4: Gnome, Goblin, Ogre, Snotling. | ok |
| MP5 | A team gets Skill Points equal to its tier number, from 1 for tier 1 to 4 for tier 4. | ok |
| MP6 | A Primary skill costs 1 point. A Secondary skill costs 2 points, and only one per team. Each player gets at most one added skill. At most two Elite skills per team. Purchased skills do not raise team value. | ok: Elite skills are Block, Dodge, Guard and Mighty Blow, as in the engine's rulebook list |
| MP7 | No SPP and no advancement during Matched Play games. | ok |

## 8. Team special rules

Spike! Journal 22 does not mention the team special rules, so they follow
the 2025 rulebook, pages 154 to 159, and the May 2026 FAQ. Sevens has
no Star Players and no Team Mascot inducement (L3), so the FAQ ruling on
Team Captain with a Team Mascot does not apply.

| ID | Rule | Status |
| --- | --- | --- |
| T1 | Team Captain (Human, Orc): when drafting, name any player except a Big Guy. The Captain gains Pro at no extra cost. While the Captain is on the pitch, each Team Re-roll the team uses rolls a D6, and a natural 6 makes it free. The Captain must be set up at the start of a Drive if able. | ok |
| T2 | Team Captain replacement (May 2026 errata): a team whose Captain leaves its roster may appoint a new one during the Pre-game Sequence of its next League Fixture. | ok |
| T3 | Bribery and Corruption: once per game, an Argue the Call roll of 1 may be re-rolled. Bribes cost 50,000 (L3). | ok |
| T4 | Favoured of: a roster with a choice picks one alignment when drafting and keeps it. Chaos Chosen may pick Hashut, Khorne, Nurgle, Slaanesh, Tzeentch or Undivided. Chaos Renegades pick from the same list without Hashut. | ok |
| T5 | Leagues: a roster with several Leagues picks one when drafting. A Norse team in the Chaos Clash gains Favoured of Khorne. | ok |

Where the rules are silent or Sevens changes the context, the engine does
this:

- The Captain's title lives on the player, as the Veteran's does, so
  saves, the online lobby and match snapshots carry it. A saved Captain
  is given Pro again on load. A Captain may also be the Veteran.
- The Captain's D6 is rolled every time, because a free re-roll has no
  downside. A free re-roll is still the team's one Team Re-roll for that
  turn. "On the pitch" means on a pitch square, Prone and Stunned
  included, as the Leader Re-roll counts it.
- A preset formation that leaves out an available Captain gives the
  Captain its last square. The set-up checklist shows the Captain, and
  set-up cannot be confirmed without them.
- Sevens never lets a team fire a player after a game (L6), so the
  rulebook's limit on firing a Captain never comes up. Removing a player
  from a draft takes the title with them.
- The replacement is offered after both coaches confirm inducements and
  before any Prayer is rolled, in a league fixture only, to an active
  league team with no Captain. It goes through the `inducement-choice`
  decision with kind `team-captain`, which the coach may decline. A team
  made before this rule existed, or one that named no Captain when
  drafting, is offered one the same way.
- The Bribery and Corruption re-roll is taken automatically, because a 1
  always fails. Only a natural 1 is re-rolled, even though Sevens makes
  1 to 4 fail alike. Its use is kept on game state, so saves and online
  play carry it.
- A League and an alignment are fixed once the team has played. Absent
  choices default to the roster's first League and to Undivided. Loading
  drops any stored choice the roster does not offer.
- League choice gates no inducement, because Sevens sells no Star
  Players. Favoured of Khorne and the other alignments also gate nothing
  except Nurgle's Plague Doctor.
