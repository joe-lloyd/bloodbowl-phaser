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

### Second pass

Each of these also has a test that fails on the old engine, and every
change follows the 2025 rulebook text.

| Area | Fix |
| --- | --- |
| Weather | Very Sunny, Pouring Rain, Blizzard and Sweltering Heat now change rolls, from one weather table in `src/game/rules/weather.ts`. A Blizzard refuses Long Passes and Long Bombs. |
| Kick-off | A kick-off that bounces back over the line or off the pitch is a touchback. |
| Passing | Hail Mary Pass is a choice, and a pass beyond the Range Ruler is refused without it. An inaccurate pass that leaves the pitch is thrown in from the last square it was on. No Ball players may not intercept, and Extra Arms gives +1. Distracted players cannot catch. |
| Throw Team-mate | It has its own once-per-turn limit, and Kick Team-mate does not use it. The landing roll counts marking and a Subpar Throw. A failed landing is a turnover only with the ball. Swoop belongs to the thrown player. Bullseye works on any Superb Throw. |
| Bombardier | No move before the throw, and one bomb per turn. |
| Movement | A Jump onto the ball needs a Pick-up. Jumps can be re-rolled, and Prehensile Tail, Diving Tackle and Tentacles affect them. Leap and Pogo can cross an empty square. |
| Movement | A Rooted or Chomped player is offered no Move, Jump or squares. |
| Secure the Ball | A plain 2+ roll, with no Sure Hands re-roll. |
| Match flow | Stunned players turn over at the end of their own team's turn. |
| Blocking | Frenzy's second block follows a Stand Firm, and costs a square on a Blitz. Stand Firm and Sidestep work during a chain push. Pile Driver is optional and works on a Blitz. |
| Armour | Mighty Blow and Claws apply only to Block knockdowns. Stab, Chainsaw and Projectile Vomit respect Iron Hard Skin and the other armour skills. Chainsaw's +3 against its owner applies only after a knockdown or fall. |
| Skills | A failed Bloodlust bites an adjacent Thrall, or causes a turnover and Distracted. Hypnotic Gaze can be re-rolled. The Leader re-roll survives a KO and is saved and synced. |
| Skills | My Ball players may never declare a Pass or Hand-off. |
| Roster data | The Troll Slayer's Hatred (Troll) and the Underworld Skaven's Animosity (Goblin) now fire. The generated Snotling test team is legal. |

Simulated matches now field a legal line-up for every roster, with up to
four positionals, instead of mostly Linemen. That is how the Rooted and My
Ball bugs surfaced.

## Still open

### Covered by the Sevens rule set

Sevens changes these. [SEVENS_RULES.md](SEVENS_RULES.md) gives the rule for each.

1. **Purchased inducements.** Fixed for everything except the two tables:
   the catalogue follows L3, and each inducement now works in the match,
   including Bribes from Get the Ref. Prayers to Nuffle and Desperate
   Measures can be bought, but their tables (L4, L5) are not in yet.
   Simulated matches never buy inducements, so only the tests cover them.
2. **Injuries between league matches.** Fixed for Sevens: a Miss Next Game
   player sits out the next league match and recovers, a dead player leaves
   the roster, and team value counts neither, nor Dedicated Fans. Sevens has
   no Niggling or Lasting Injuries. Still open: the seed teams and old saves
   carry characteristic losses from before the Sevens tables, and loading
   still applies them.
3. **The team builder does not charge for staff.** Coaches and cheerleaders
   are free and unlimited, and the Apothecary ignores whether the roster
   allows one.
4. **Argue the Call** is automatic, and a 6 cancels the turnover. Sevens uses
   amateur referees with a 1 in 3 chance.
5. **League and builder details.** The penalty-free set-up concession still
   wipes the conceding team's SPP. Dedicated Fans now follow Sevens D7: they
   stay out of team value, cost 20,000, start at 1 in a league, stay within
   1 to 5, and change after each league match. Players cannot be fired after
   a match (L6), and short teams take on Journeymen (L2), who cannot yet be
   hired after the match.

### Wrong in rarer situations

- A Jump may land on any square next to the jumped player that is not next
  to the jumper, which is five squares on a diagonal; the engine offers three.
- A thrown team-mate who crashes ends in the occupant's square instead of
  bouncing, and one thrown off the pitch is held at the edge instead of going
  into the crowd.
- A fumbled Throw Team-mate drops the team-mate Prone and rolls injury; the
  text has them bounce from the thrower's square and try to land.
- The action menu still offers Throw Team-mate or Throw Bomb after the
  once-per-turn limit is spent; the engine refuses the declaration.
- Dump-off skips interception and the pass skills.
- The browser has no Hail Mary toggle or Swoop direction choice yet: it
  throws a Hail Mary only beyond the Range Ruler, and Swoop scatters normally.
- `pnpm e2e:seeds --refresh --config X` wipes every other committed seed.

### Not implemented

- Winnings, Expensive Mistakes and the rest of the post-match treasury.
- Seasons and the re-draft screen. The R1 to R3 steps exist as
  `beginRedraft`, which nothing calls yet.
- Conceding during play. Only the set-up concession exists.
- Deflections, and their SPP.
- Most team special rules: Swarming, Bribery and Corruption, Team Captain,
  Masters of Undeath, the Favoured of rules, and the one-big-guy limit in
  the team builder.

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

The magazine has now been read. [SEVENS_RULES.md](SEVENS_RULES.md) lists
every Sevens rule with an ID and compares each one with the engine. It
settles the numbers above. The pitch, set-up limits, D3+1 kick-off
selections, turn count and roster limits match. Argue the Call, the
injury tables, Time-Out, Solid Defence, throw-ins, kick-off deviation,
staff prices, inducements and the advancement details differ. The progression
switch stays: Advanced League with SPP remains a choice alongside the
official Sevens advancement.
