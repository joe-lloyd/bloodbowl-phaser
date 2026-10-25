# Rules review, 25 October 2026

Six reviewers each took one area of the rules (set-up and kick-off,
movement, blocking and injury, passing, match flow and progression, skills
and rosters) and compared the engine with the 2025 rulebook. Every claim
below was reproduced by running the engine, unless marked otherwise. Disputed
rules were checked against the text of the 2025 rulebook (third season).
That book has no Sevens chapter, so Sevens-only numbers are listed as
unverified rather than wrong.

The short answer: the core dice maths is right. Block dice, assists, the
injury and casualty bands, the range ruler, Dodge and Rush targets, the kick-off
table and the turn count all check out. The bugs sit where rules meet: a pass
caught by an opponent, a turnover in the middle of a move, a skill that should
apply to a foul as well as a block. Several whole systems are wired but have no
effect yet: weather, purchased inducements, and injuries carried between league
matches.

## Fixed

Each fix has a test that fails on the old engine.

| Area | Fix |
| --- | --- |
| Passing | A Pass or Hand-off that the passing team does not end up holding is a turnover. Before, an opponent could catch your pass and you kept the turn. A drop that bounces to a team-mate who catches it is no longer a turnover. |
| Movement | A move may not pass through a Prone or Stunned player's square. Crossing one is a Jump, with its Agility test. The pathfinder no longer routes through them either. |
| Movement | Movement allowance counts across every `move` command in an activation. Before, splitting a move reset it, so an MA 6 player could cover 10 squares. |
| Movement | A Pick-up is an Agility test at -1 per marking player, with no +1. Every pick-up was about one pip too easy. |
| Movement | Tackle and Prehensile Tail only work from the square the dodger leaves. |
| Movement | A step that needs both a Rush and a Dodge rolls the Rush first. Before, a Shadowing marker could end up in the same square as the mover. |
| Blocking | A Blitz includes exactly one Block. A Both Down where the attacker had Block left the Blitz open for more blocks. A plain Block had the same hole. |
| Blocking | Loner is rolled when a team re-roll is spent on block dice. Before, big guys re-rolled blocks for free. |
| Injury | Fouls and crowd pushes go through the same injury and armour rules as blocks: Thick Skull, Stunty, Iron Hard Skin. |
| Match flow | Team re-rolls are tracked per half and refill at half-time. Before, they came off the roster for good, and a league team lost them permanently. |
| Match flow | A touchdown in the opponent's turn ends that turn, and the scorers skip their next turn, as the rulebook says. Before, a team could get a seventh turn. |
| Kick-off | Team 2 kicking onto its own line of scrimmage is a touchback. The check was off by one column. |

The simulation harness learned the rules it was missing, so it now finds each
of these: passes to any square, Jumps, one Block per Blitz, a turnover check
after every pass, and the movement allowance.

## Still open

### Fix before release

These change results in normal play.

1. **Weather does nothing.** It is rolled and shown, but no roll reads it.
   - Very Sunny: -1 to passes.
   - Pouring Rain: -1 to pick-ups, catches and interceptions.
   - Blizzard: -1 to Rush, and only Quick or Short passes.
   - Sweltering Heat: D3 random players miss the next drive.
2. **Bloodlust has no penalty.** On a failed roll the player should bite an
   adjacent Thrall or cause a turnover and become Distracted. Every Vampire
   position has Bloodlust.
3. **Purchased inducements do nothing.** Extra Team Training, the Wandering
   Apothecary and Bribes are bought and confirmed, and then never applied.
   Bribes from Get the Ref can never be spent either.
4. **A kick-off that bounces back over the line or off the pitch is not a
   touchback.**
5. **Injuries do not carry between league matches.** A loaded team marks
   every player Reserve.
   - Dead players stay on the roster.
   - Miss Next Game players can play the next match.
   - Niggling Injuries are never applied.
   - A Lasting Injury always takes MA instead of rolling for which
     characteristic to lose.
   - Team value counts Dead and Miss Next Game players, and Dedicated Fans.
6. **The team builder does not charge for staff.** Coaches and cheerleaders
   are free and unlimited, and the Apothecary ignores whether the roster
   allows one. The generated Snotling test team is illegal: seven
   Insignificant Linemen.
7. **Hatred and Animosity data.**
   - The Troll Slayer's Hatred has no target, so it never fires.
   - Underworld Skaven Animosity names "Underworld Goblin Linemen", which
     matches no keyword.

### Wrong in rarer situations

**Throwing and passing**

- Hail Mary Pass is forced on every pass; it should be optional.
- Pass targets beyond the range ruler are accepted without Hail Mary.
- An inaccurate pass can scatter off the pitch and back on instead of being
  thrown in.
- No Ball players may intercept, and Extra Arms gives no +1 to Intercept.
- Throw Team-mate and Kick Team-mate:
  - They share the once-per-turn Pass limit.
  - Swoop is read from the thrower, not the thrown player.
  - Bullseye needs a natural 6.
  - The landing roll ignores marking.
  - Every failed landing is a turnover, even without the ball.
- Throw Bomb allows a move before the throw.

**Movement**

- Jumping onto the loose ball picks it up with no roll.
- A Jump offers no re-roll, and Prehensile Tail, Diving Tackle and Tentacles
  never affect it.
- Leap and Pogo cannot cross an empty square.
- Secure the Ball uses the normal pick-up and offers the Sure Hands re-roll.
  The rulebook makes it a 2+ roll with no Sure Hands.

**Blocking and fouling**

- Stand Firm stops Frenzy's second block, and Stand Firm and Sidestep are not
  offered during a chain push.
- Frenzy's second block during a Blitz costs no movement.
- Pile Driver is forced on a Block and never fires on a Blitz.
- Mighty Blow and Claws apply to knockdowns that are not Blocks, such as
  Breathe Fire.
- Stab, Chainsaw and Projectile Vomit roll armour outside the shared rules,
  so Iron Hard Skin is skipped there.
- Chainsaw's +3 armour against its owner now also applies when the owner is
  fouled. The rulebook says "Knocked Down or Falls Over", so this is doubtful.
- Argue the Call is automatic, and a 6 cancels the turnover.

**Other skills**

- Hypnotic Gaze offers no re-roll.
- Leader's re-roll is lost for good when the Leader is KO'd. No starting
  roster has Leader.
- Dump-off skips interception and the pass skills.

**Match flow**

- Stunned players turn Prone at the start of their team's turn, not the end.
- The Leader re-roll bank is not saved or synced online.

**League and builder**

- The penalty-free set-up concession still wipes the conceding team's SPP.
- Dedicated Fans count toward team value, cost 10,000 instead of 5,000, start
  at 0 instead of 1, and have no cap.
- Several inducement prices and team restrictions differ from the 2025 table,
  for example the Wandering Apothecary and the Halfling Master Chef.

### Not implemented

- Winnings, the Dedicated Fans roll, Expensive Mistakes and the rest of the
  post-match treasury.
- Conceding during play. Only the set-up concession exists.
- Deflections, and their SPP.
- Most team special rules: Swarming, Bribery and Corruption, Team Captain,
  Masters of Undeath, the Favoured of rules, and the one-big-guy limit.

## Claims the rulebook overturned

- "A pass of 1 or less after modifiers should be Wildly Inaccurate, not a
  fumble." The 2025 rules have no Wildly Inaccurate result. A pass that is a
  1 after modifiers is a fumble, so the engine is right.
- "Following up onto the ball skipped the +1 pick-up modifier." This was
  claimed in [pull request #41](https://github.com/joe-lloyd/bloodbowl-phaser/pull/41). There is no +1, so that old path was right. The
  follow-up now shares the corrected pick-up path with every move.

## Sevens numbers that could not be checked

These match no 11-a-side rule, and no Sevens text was available to confirm
them:

- D3+1 players for Solid Defence, Quick Snap and Charge!.
- One player per Wide Zone.
- The six-column neutral zone.
- The Time-Out turn bands.
- An Apothecary casualty re-roll of 4+.
- Pitch Invasion hitting one player.
- Extra Team Training at 150,000.
- The 7 to 11 player and four-non-Lineman roster limits.
- Doubled re-roll prices at draft.

## The official Sevens rules: Spike! Journal Issue 22

Games Workshop published the official Sevens rules in
[Spike! Journal Issue 22](https://www.warhammer.com/en-US/shop/blood-bowl-spike-issue-22-2026-eng),
a 32-page magazine released in August 2026. It builds on the 2025 rulebook
and changes a few things. The full text is not public. These differences come
from the
[designer's notes](https://www.warhammer-community.com/en-gb/articles/f0owm2ar/designers-notes-on-blood-bowl-sevens/)
and a
[review](https://spruesandbrews.com/2026/08/08/blood-bowl-sevens-and-big-guys-review-spike-issue-22/),
and need checking against the magazine itself:

| Rule | Spike! 22 | This game |
| --- | --- | --- |
| Team budget | 600,000 | to check |
| Non-Lineman players | at most 4 | at most 4 |
| Team re-rolls | 100,000 each | doubled at draft |
| Veteran | one Lineman per team, slower, with a once-per-game re-roll | missing |
| Advancement | no SPP; after each game one player gains a random skill. For Primary, you pick two, the opponent picks one, a D3 decides. | SPP and level-ups |
| Injuries | two new tables, standard and Stunty | 2025 tables |
| Injury cover | a player may be signed to cover an injury elsewhere and miss your game | missing |
| Kick-off | its own kick-off table; kick-offs and throw-ins travel less far | its own table, to compare |
| Referees | amateur: 1 in 3 chance when arguing a send-off | 2025 Argue the Call |
| Pitch | smaller, with a No Man's Land in the centre | 20 by 11, six-column neutral zone |
| Turns | six per half | six per half |

Until the magazine text is compared line by line, these open items stay on
hold, because Sevens changes them: purchased inducements, league injuries,
the team builder's staff and prices, team value, Argue the Call and
progression.
