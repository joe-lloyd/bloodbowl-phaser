# Sevens AI policy lab results

The first policy-lab release completes useful passing plans, prices transfers with the actual shared reroll bank, and adds explicit turn-five preparation and turn-six scoring choices. A common planner handles movement, possession, hitting and defence. Capability modules add feeding support, Hypnotic Gaze and other supported actions. Match context uses actual opponents, skills, available players and persistent-injury costs.

The lab runs normal Sevens matches through the command engine. It balances both policies across roster assignment, pitch side and first receiver in eight-game blocks. It saves commands and notes, replays every match and reconciles gameplay counters. Games use six-turn halves and separated setup lines.

## Advanced plays, 17 November

The second release lets the coach throw team-mates, sets up a last-turn throw and gives Standard a game plan per match. Candidate source `c928db14d0da` played `main` at `53a1c8dd611832f3dc8221664ad07e277ecb87dd`, the same frozen-policy design as below. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.09% | 49.92% to 50.25%     |
| Standard, game plans and close calls | 5,184 |                   48.77% | 47.75% to 49.75%     |
| Persistent fixtures                  | 1,296 |                   50.12% | 49.92% to 50.31%     |
| Heuristic control                    |   432 |                   92.71% | 90.63% to 94.68%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The best planner is level with `main`: its interval includes parity, and its equal-roster share is 50.49%, 49.72% to 51.24%. It scored 3,432 touchdowns against 3,430 and suffered 710 deaths against 694. No roster lost more than 1.2 points of points share. Standard gives up about 1.2 points for its variety and suffered 722 deaths against 698.

What each policy chose, counted from saved commands by the coach's note:

| Play in 5,184 games                         |           Best planner |               Standard |   `main` |
| ------------------------------------------- | ---------------------: | ---------------------: | -------: |
| Carrier thrown by a team-mate               | 40, 9 scored that turn | 39, 6 scored that turn |        0 |
| Team-mate thrown without the ball           |                     40 |                     34 |        0 |
| Passes, Pass command accepted               |                     31 |                     51 | 30 to 33 |
| Receiver touchdowns after a completion      |                     12 |                     13 | 10 to 12 |
| Flank runner sent wide                      |                      0 |                    360 |        0 |
| Thrower set up beside a Right Stuff carrier |                    116 |                    137 |        0 |

The planner prices every Quick or Short aim over the engine's dice. A fumbled throw bounces once from the thrower's square and lands as after a Subpar Throw; a fumbled kick removes and injures the player. A PA 5+ Trained Troll fumbles about a third of its throws, so carrier throws mostly come on the last turn of a half, when nothing safer can score.

Paired ablations on the same 5,184 seeds, against `3741e12c`, found what the first version cost. The launch setup ran all half and lost 13.3 points of points share on Snotling. A flank runner cost 0.75 points even when only one went wide. Throw Team-mate itself and sideways transfers made no difference. The launch setup now runs only on turn five, and only Standard's flank game plan sends a runner wide.

The lab and its reviews found six engine faults on the way, each fixed with a test. A thrown carrier landing in the end zone did not score, and the first fix also let a player without the ball score by landing on it. An eaten team-mate was not recorded as dead. A Multiple Block rolled its second block after the blocker fell. A spent team-mate throw was still offered, and Kick Team-mate was never offered. A fumbled kick left a Stunned player off the pitch. `main` fixed crashed and fumbled thrown players in the meantime.

Passing is still rare because a dropped ball is priced at 60 points plus the turnover. Changing that price is the next tuning study. Counts of plays describe what followed them, not their causal value.

Published report: [Sevens advanced plays](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-advanced-plays-2026-11-17%2Findex.html), Blood Bowl, `sevens-advanced-plays-2026-11-17/`. Each stage links its plays and moments page, whose scoring moments open the match viewer at the declaration. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-c928db14d0da-vs-53a1c8dd6118` on Daily Driver.

## Two-step passes, 17 November

The third release sets up a pass a turn ahead. When our carrier cannot run the ball in next turn, one receiver goes deep: in Long Pass range, close enough to catch and score next turn without a Rush, and away from the defence. Each square is worth the carrier's chance of completing that throw, so a lineman's Long Pass sends nobody. On the throwing turn a marked carrier may now dodge out before it throws, with the dodge priced into the pass. Candidate source `01e8b45c8750` played `0a474e067fe0`, the same branch without these two changes. Both include coach fouls. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.19% | 49.79% to 50.61%     |
| Standard, game plans and close calls | 5,184 |                   49.25% | 48.29% to 50.26%     |
| Persistent fixtures                  | 1,296 |                   50.50% | 49.69% to 51.31%     |
| Heuristic control                    |   432 |                   89.70% | 87.27% to 91.90%     |
| Hard sentinels                       |    16 | 34.38%, descriptive only | No strength estimate |

The best planner is level: 3,449 touchdowns against 3,434, and 631 deaths against 638. Its equal-roster share is 50.11%, 49.31% to 50.94%. The Standard stage plays the candidate's Standard coach against the frozen best planner, so its share is the cost of variety, not a change from the old Standard. It is 0.75 points behind, with 3,352 touchdowns against 3,441 and 752 deaths against 713. Every Standard stage since game plans landed has come out between 48.6% and 49.3%. The 192-game pilot, on fixed diagnostic seeds, came out at 46.61%, 44.27% to 48.70%. The pilot is not the estimate, but it is the one stage below parity.

| Play in 5,184 games                    | Best planner | Frozen | Standard | Frozen |
| -------------------------------------- | -----------: | -----: | -------: | -----: |
| Receiver sent deep                     |        1,100 |      0 |      949 |      0 |
| Team scored the turn after a deep run  |          107 |      0 |      169 |      0 |
| Passes, Pass command accepted          |           60 |     33 |       83 |     29 |
| Completions                            |           20 |     14 |       44 |     13 |
| Receiver touchdowns after a completion |           17 |     13 |       38 |     11 |

Most deep runs end without a pass. On the next turn the defence has often marked the receiver or taken the ball, and a receiver in walking range takes a hand-off, which needs no Pass roll. Throws after a dodge fail often: 42 of the best planner's 66 Pass declarations ended in a turnover, against 19 of 37 for the frozen policy. Counts of plays describe what followed them, not their causal value.

Published report: [Sevens two-step passes](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-two-step-pass-2026-11-17%2Findex.html), Blood Bowl, `sevens-two-step-pass-2026-11-17/`. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-01e8b45c8750-vs-0a474e067fe0` on Daily Driver.

## Coach fouls, 17 November

The fouling release lets the coach Foul a downed opponent. Each Foul is priced by its armour, injury and referee dice, and by what the fouler is worth: a Gnoblar is cheap to lose, a big guy is not. Candidate source `2a158236dcc9` played `cc193d113529`, the same branch without fouls. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.05% | 49.71% to 50.38%     |
| Standard, against the frozen planner | 5,184 |                   49.11% | 48.07% to 50.15%     |
| Persistent fixtures                  | 1,296 |                   50.00% | 49.15% to 50.89%     |
| Heuristic control                    |   432 |                   90.05% | 87.85% to 92.01%     |
| Hard sentinels                       |    16 | 31.25%, descriptive only | No strength estimate |

Fouls cost the best planner nothing: 3,502 touchdowns against 3,504, 3,510 casualties inflicted against 3,443, and 653 deaths suffered against 692. Standard's share sits in its usual band. Its shortfall comes from rosters that never foul, such as Skaven and Dwarf, so it is not the fouls.

`fouls.ts` counted every accepted Foul. The best planner fouled 802 times in 5,184 games, and Standard 689 times. Cheap linemen did all of it: Gnoblars 242 times, Rotters 76, Tomb Kings Skeletons 75, Goblins 64 and Snotlings 57. No big guy fouled. The dearest foulers were Dwarf Linemen and Khorngors at 70k, with five Fouls between them. Few lineups field Sneaky Git, so it shows only in a handful of Standard games.

| Outcome of the best planner's 802 Fouls | Count |
| --------------------------------------- | ----: |
| Fouler Sent-off                         |   132 |
| Target Stunned                          |   280 |
| Target out of the drive, KO or worse    |   242 |
| Target a casualty                       |   117 |

Published report: [Sevens coach fouls](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-fouls-2026-11-17%2Findex.html), Blood Bowl, `sevens-fouls-2026-11-17/`. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-2a158236dcc9-vs-cc193d113529` on Daily Driver.

## Getting the ball out of a press, 17 November

After a deep setup the carrier mostly kept the ball and ran. A carrier move was valued as its gain over the carrier's square, so a carrier marked by three defenders earned up to 120 for dodging away. A scoring run, pass or hand-off was valued on its touchdown chance alone, with no credit for taking the ball out of that press. Each scoring play now adds its chance times the press: the marks, threats and exposure at the carrier's square. Candidate source `f25c6fcac812` played `5f3da3859ed5`, the two-step pass release. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   51.26% | 50.86% to 51.66%     |
| Standard, against the frozen planner | 5,184 |                   50.11% | 49.02% to 51.14%     |
| Persistent fixtures                  | 1,296 |                   51.12% | 50.27% to 52.01%     |
| Heuristic control                    |   432 |                   91.32% | 89.35% to 93.29%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The best planner gains 1.26 points, with the whole interval above parity: 3,727 touchdowns against 3,498, and 691 deaths suffered against 672. Standard now plays level with the frozen best planner, where every earlier Standard stage was about a point behind.

| Play in 5,184 confirmation games       | Candidate | Frozen |
| -------------------------------------- | --------: | -----: |
| Runs in to score                       |     3,986 |  3,535 |
| Hand-offs                              |     1,878 |  1,598 |
| Hand-offs scored that turn             |       839 |    634 |
| Receiver sent deep                     |     1,034 |  1,090 |
| Team scored the turn after a deep run  |       185 |    113 |
| Passes, Pass command accepted          |        70 |     61 |
| Receiver touchdowns after a completion |        30 |     22 |

Most rescued deep setups end in a hand-off, which needs no Pass roll. Standard's aerial plan throws more: 105 passes against 63, and 47 receiver touchdowns against 26.

The release also measured the attrition weight, which makes a casualty worth more early in the game. The same source with `attrition: 1` played itself with `attrition: 0` over 5,184 games. It scored 49.66%, 48.83% to 50.46%, with 3,431 casualties inflicted against 3,411. Bash rosters split: Khorne and Black Orc gained about 3 points, Dwarf lost 4. Per-roster results at 128 to 256 games are noise, so attrition stays off.

Published report: [Sevens press escape](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-press-escape-2026-11-17%2Findex.html), Blood Bowl, `sevens-press-escape-2026-11-17/`. The acquisition, with the attrition run in `attrition/`, stays at `/Users/joelloyd/tmp/bb7-policy-lab-f25c6fcac812-vs-5f3da3859ed5` on Daily Driver.

## Review fixes, 18 November

Review of the release found two faults. On the setup turn, a receiver that had gone deep lost its Move, so the next declaration sent another, and with three catchers all three went deep. The receiver is now the surest hands among team-mates that can still move or already stand deep, and once it has gone nobody else goes. The Foul odds also gave Lone Fouler its re-roll when one assist on each side cancelled out, which the engine never allows. Candidate source `849cac0a0b57` played `f25c6fcac812`, the press-escape release. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   49.99% | 49.76% to 50.22%     |
| Standard, against the frozen planner | 5,184 |                   48.54% | 47.56% to 49.52%     |
| Persistent fixtures                  | 1,296 |                   49.81% | 49.31% to 50.27%     |
| Heuristic control                    |   432 |                   92.94% | 90.97% to 94.56%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The best planner is level: 3,620 touchdowns against 3,625. Deep runs fell from 1,152 to 836 once the extra receivers stopped going, and no strength went with them. Standard plays the stronger press-escape planner here, and sits 1.45 points behind the best planner of its own release. An earlier version of the deep fix stopped the setup turn whenever any team-mate that had acted stood deep. It held the best planner level but put Standard at 47.50%, so it was replaced.

Published report: [Sevens review fixes](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-review-fixes-2026-11-18%2Findex.html), Blood Bowl, `sevens-review-fixes-2026-11-18/`. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-849cac0a0b57-vs-f25c6fcac812` on Daily Driver.

## Second review fixes, 18 November

A second review found two more faults. The deep receiver was ranked before anyone checked it could reach a deep square, so a slow catcher in the cage kept a faster one home. Only team-mates that already stand deep or can safely reach a deep square are ranked now. A spotted Foul was also priced as losing the fouler every time. The engine always Argues the Call, and a 5 or 6 keeps the player on the pitch. Bribery and Corruption re-rolls a first 1, and a held Bribe keeps the player on a 2+. A spotted Foul still costs the turn, unless a Bribe works. Candidate source `b0f7458e07c4` played `849cac0a0b57`, the first review fixes. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.38% | 49.87% to 50.88%     |
| Standard, against the frozen planner | 5,184 |                   49.80% | 48.78% to 50.85%     |
| Persistent fixtures                  | 1,296 |                   49.92% | 49.04% to 50.77%     |
| Heuristic control                    |   432 |                   92.71% | 90.62% to 94.56%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The best planner is level, with 3,706 touchdowns against 3,663. Standard comes within 0.6 points of the best planner, its closest result so far. Deep runs rose from 782 to 1,026.

Fouls rose from 816 to 2,038 in the confirmation stage, and 270 of them got the fouler sent off. Players of 50k or less made 91% of them: Gnoblars 318 times, Tomb Kings Skeletons 168 and Rotters 151. In Standard, a Tomb Guardian and an Underworld Troll fouled four times between them. Cheaper Send-offs let a big guy's Foul come out just above zero: an Ogre whose team holds a Bribe prices one at 3.69 against soft armour. The bash lean then picked it. `50e16175` stops a big guy fouling at all. It touches only those Fouls, so this acquisition stands for the rest.

Published report: [Sevens argued calls](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-argued-calls-2026-11-18%2Findex.html), Blood Bowl, `sevens-argued-calls-2026-11-18/`. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-b0f7458e07c4-vs-849cac0a0b57` on Daily Driver.

## Third review fixes, 18 November

A third review found two more faults. A receiver that had gone deep and spent its Move no longer counted as the receiver, so the next declaration sent a second one. The first deep receiver now holds the setup turn. A held Bribe also priced a spotted Foul as a lost turn even when the Bribe worked. A Bribe that works now keeps the turn. Candidate source `441f69a31378` played `b0f7458e07c4`, the second review fixes. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.16% | 49.99% to 50.34%     |
| Standard, against the frozen planner | 5,184 |                   48.10% | 47.04% to 49.08%     |
| Persistent fixtures                  | 1,296 |                   50.00% | 49.65% to 50.35%     |
| Heuristic control                    |   432 |                   89.47% | 87.04% to 91.67%     |
| Hard sentinels                       |    16 | 34.38%, descriptive only | No strength estimate |

The best planner is level, with 3,794 touchdowns against 3,774. It made 1,959 Fouls, and 303 got the fouler sent off. No big guy fouled. Standard sits 1.9 points behind the best planner of its own release, inside the 0.6 to 2.4 point range of earlier releases. The likely cause is Standard's flank runner: when its run ends on a deep square, it counts as the deep receiver and holds the others back. That fix belongs to the team work that follows.

Published report: [Sevens third review](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-third-review-2026-11-18%2Findex.html), Blood Bowl, `sevens-third-review-2026-11-18/`. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-441f69a31378-vs-b0f7458e07c4` on Daily Driver.

## Team scorecard and the cage march, 18 November

The pilot, confirmation and Standard stages now write a team scorecard. It holds each roster to the standard of its tier: a tier-one team should take at least 50% of points from an average opponent and score in at least 55% of its games. The scorecard fits that strength from all of a roster's games. The schedule pairs each roster with five to eight others, only 103 of 465 pairings. Skaven met only rosters the AI plays badly, so its raw 81% carried eight points of schedule. Fitted, it is 73%, under the 75% ceiling, and its profile follows the 2025 roster. Its AI was left alone.

On the release before this change, eight rosters missed their standard. The slow, strong ones failed the same way. Dwarfs, Nurgle and Tomb Kings lost the ball in 7% to 9% of their turns with it, less often than most teams. They gained 1.6 to 1.75 squares a turn, against 2.3 to 3.5 for teams that score, and ended about a third of their halves still holding the ball. Skaven ended a quarter that way. For Dwarfs, seven turns in ten started with the carrier marked, and those turns gained nothing six times in ten. Grinder-only runs of 1,920 games tried eight weight sets. A cage corner worth 4 instead of 8 took 51.5% against the default, and the grinders' points rose from 39.4% to 42.5%. Corners worth 2 or 0 gave the gain back.

Candidate source `549cc320f9d6` played main, `e9a8e8036887`. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   51.16% | 50.16% to 52.15%     |
| Standard, against the frozen planner | 5,184 |                   48.28% | 47.34% to 49.25%     |
| Persistent fixtures                  | 1,296 |                   49.46% | 47.53% to 51.47%     |
| Heuristic control                    |   432 |                   92.25% | 90.05% to 94.10%     |
| Hard sentinels                       |    16 | 25.00%, descriptive only | No strength estimate |

The best planner gains, with 3,977 touchdowns against 3,889. Black Orc gained 8.3 points, Chaos Dwarf 5.5, Orc 5.2 and Nurgle 3.4. Dwarf moved 0.8 and Tomb Kings lost 3.4. Each roster plays 128 to 256 games a policy, so a single roster's figure can be off by about five points. Eight rosters still miss their standard. Dwarf and Nurgle score in under a third of their games, so the cage march is only part of their fix.

The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-549cc320f9d6-vs-e9a8e8036887` on Daily Driver. The grinder runs stay at `/Users/joelloyd/tmp/bb7-grind-fa117137085a`.

## Team tactics and the cage walk, 18 November

Replays of the 5,184 confirmation games on `549cc320f9d6` showed why the slow teams fall short. Dwarfs ended about 40% of their halves holding the ball without scoring. On turn six their carrier was out of scoring reach 74% of the time, against 20% for Skaven. In reach, Dwarfs scored 67% of the time. Their average distance to go fell only from 10.9 to 10.4 squares between turns three and five. On 95 of 95 Dwarf end-of-turns with an idle carrier, the planner had offered the carrier no move at all: every square ahead was next to a defender, and each mark cost a flat 30 points.

A roster can now play with its own weights, `ROSTER_WEIGHTS`, and a lab weights file can carry a `rosters` object. Focused runs of 2,432 games played the eight rosters below their standard, each change against main. With no change, both policies play identical games, so every difference comes from the change. Twenty-one weight sets, including two new block weights, `freeCarrier` and `lane`, mostly moved a roster by about two points either way on their first seed. The best of them did not hold up on fresh seeds: Dwarf, Nurgle, Vampire and Snotling tweaks came out at -0.8, -0.8, -0.3 and -3.9 points over 576 to 768 games a roster. Only Halfling kept a gain. Taking dodges at 82% instead of 92% gained it about five points over 640 games a side on seeds that did not pick it, and it is the one roster tweak shipped. The two block weights ship at values that reproduce the old play.

The cage walk prices each mark on the carrier by the chance that defender's block knocks it down, with actual skills and assists, against an even one-die block. A carrier with Block that a hit rarely downs can step into contact; a fragile one still keeps clear. Over three seeds of 5,184 paired games it took 50.53% of points against the planner without it. Halfling gained 4.0 points, Tomb Kings 2.5, Dwarf 2.3, Chaos Dwarf 2.0 and Vampire 1.8. Skaven lost 0.8. It does not finish the job for Dwarfs: by the time the carrier could step forward, the players who would hold its new corners have often spent their activation on blocks.

Candidate source `056ff8c8c10a` played main, `0f9a59492628`. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 77-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.37% | 49.78% to 50.98%     |
| Standard, against the frozen planner | 5,184 |                   48.41% | 47.43% to 49.35%     |
| Persistent fixtures                  | 1,296 |                   49.81% | 48.65% to 51.00%     |
| Heuristic control                    |   432 |                   93.40% | 91.32% to 95.25%     |
| Hard sentinels                       |    16 | 25.00%, descriptive only | No strength estimate |

Confirmation agrees with the three focused seeds, though on its own it cannot rule out parity. In the same games, Halfling gained 9.0 points, Snotling 3.1, Vampire 2.1, Black Orc 1.6 and Dwarf 1.0. Tomb Kings lost 1.8 and Nurgle 1.0. Twenty-one rosters meet their standard, against 22 on `549cc320f9d6`. Shambling Undead and Snotling now meet theirs; Norse, Orc and Black Orc fell under. Their change against the frozen AI in the same games was 0.0, -0.5 and +1.6, so the schedule moved them, not the policy. Each run draws a fresh schedule, and a roster's strength interval spans about 12 points, so one scorecard cannot show a two-point gain. The scorecard now prints each roster's change against the frozen policy in the same games beside its strength.

The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-056ff8c8c10a-vs-0f9a59492628` on Daily Driver. The focused runs stay under `/Users/joelloyd/tmp/bb7-tactics*`.

## Quick ball carriers, 18 November

Human results from 379,170 FUMBBL Competitive matches, 2020 to 2024, put Dwarfs at 53.7% of points, so their tier-two standard of 45% is not too high. Our planner played them about 13 points below people, and it leaned towards fast teams across the field: its roster order matched the human one with a rank correlation of only 0.49. Replays showed why for slow teams. The Sevens Veteran, a Lineman with one less movement and a re-roll for a pick-up, catch or pass, carried the ball in 30% of all turns with it. It carried in 52% for Chaos Dwarf, 41% for Nurgle and 26% for Dwarf, whose movement-6 Runner carried in only a third. The Veteran's re-roll made it the safest picker, and nothing paid for handing the ball on.

`carrierPace` now prices who holds the ball on a spectrum. A hand-off or pass gains 4 points for each square a turn the receiver reaches beyond the carrier, rushes and Sprint included, over the next three turns, and loses the same for a slower receiver. A pick-up is charged against the team's quickest standing player: one turn for a picker who can hand the ball on, all three for a My Ball picker, who must run it in. Pace 2, 4 and 8 took 51.20%, 51.24% and 51.03% of points against main on one seed of 5,184 paired games; pace 4 repeated at 50.60% and 50.70%.

The lab on this branch also found two faults. Sweltering Heat sent every player a team had left to the Reserves, and the team was still offered to play on, so the kick-off had nobody to kick; the team now concedes. And a prone picker with nobody else standing priced its pace against an empty team, which made a plan's value NaN and stopped Standard's close-call choice.

Candidate source `b2ffa9a92193` played main, `783399bdc3fe`. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 83-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   51.62% | 50.80% to 52.40%     |
| Standard, against the frozen planner | 5,184 |                   50.37% | 49.31% to 51.33%     |
| Persistent fixtures                  | 1,296 |                   51.58% | 49.88% to 53.28%     |
| Heuristic control                    |   432 |                   93.06% | 91.20% to 94.79%     |
| Hard sentinels                       |    16 | 34.38%, descriptive only | No strength estimate |

Over every roster, the Veteran's share of carrying fell from 30% to 8%, the team's quickest standing player carried in 70% of turns with the ball instead of 42%, and the carrier's reach rose from 7.77 to 8.25 squares a turn. For Dwarfs the Veteran fell from 26% to 9% and reach rose from 6.83 to 7.30. Standard, which plays the frozen best planner, drew level with it for the first time. Twenty-two rosters meet their standard, against 21. In the same games Nurgle gained 7.8 points, Chaos Dwarf 3.5, Dwarf, Tomb Kings and Vampire 2.1, and Halfling 1.2, against about 3 for the average roster. Quick carriers help every team, so the slow ones are still short: Dwarf scores in 37.5% of games and Nurgle in 39.3%, against a standard of 50%.

The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-b2ffa9a92193-vs-783399bdc3fe` on Daily Driver. The pace sweep stays at `/Users/joelloyd/tmp/bb7-pace`.

## Bash, defence and the cage after the carrier moves, 19 November

The question was whether bash rosters fall short because they block, injure or defend worse than people do. Compared with the average team in each source, our Dwarfs block and injure about as much as FUMBBL's human Dwarfs, and lose fewer players:

| Dwarf against the average team | Human, FUMBBL | Our planner |
| ------------------------------ | ------------: | ----------: |
| Blocks thrown                  |         1.25× |       1.42× |
| Casualties caused              |         1.20× |       1.17× |
| Casualties suffered            |         0.58× |       0.42× |
| Touchdowns conceded            |         0.85× |       1.06× |
| Touchdowns scored              |         0.94× |       0.55× |

Tomb Kings show the same pattern: 1.36× the blocks and 1.39× the casualties, with 0.47× the touchdowns. The shortfall is mostly in scoring, and partly in defence.

`defence.ts` replays a stage and counts, for each turn that starts with an opposing standing carrier, whether the turn won the ball back, whom its blocks hit, and whether the carrier's team scored next turn. It also counts every block by its dice. On `b2ffa9a92193`, Dwarfs threw 1.66 blocks in such a turn, second only to Khorne against a median of 1.29, and half of them hit players more than one square from the carrier, the highest share of any roster. They conceded on 22.5% of the turns that left the opponent with the ball, against 20.5% for all rosters. Dwarfs threw 34% of all their blocks on one die, against a median of 12%, because the planner moved a player in to assist only a hit on their carrier.

Focused runs then played the eight bash rosters, Dwarf, Nurgle, Tomb Kings, Chaos Dwarf, Black Orc, Khorne, Chaos Chosen and Orc, each change against main over three seeds of 2,848 games. Pooled over the eight, 4,800 games a policy:

| Change for the bash rosters                             | Change vs main, points |
| ------------------------------------------------------- | ---------------------: |
| A hit more than two squares from the ball worth nothing |                   -1.8 |
| ... worth half                                          |                   -0.4 |
| ... worth 1.5 times                                     |                   -0.2 |
| ... worth double                                        |                   -2.5 |
| Casualties worth 80 instead of 40                       |                   -0.4 |
| Early casualties worth more, attrition 1                |                   -0.3 |
| Mark their carrier at 30, screen at 18                  |                   -0.5 |
| A free player assists any block                         |                   -0.3 |
| ... at half its gain                                    |                   +0.2 |
| Cage corners worth 16 more once the carrier has acted   |                   +0.8 |
| ... 30 more                                             |                   +0.9 |

Hitting, injuring and defending as they are came out best. Off-ball hits pay: worth nothing or worth double, they cost bash rosters 1.8 and 2.5 points. Assisting every block came out level because few players are still free by the time a block is thrown; unassisted blocks fell only from 34.4% to 33.0%. These weights were removed again.

The one gain was on offence. A carrier's square counts corners that team-mates who have not acted can still reach, so the carrier moves expecting a cage, and those team-mates then spent their activations elsewhere. `cageKeep` makes a corner worth 20 more once the carrier has acted. It first crowded out planned plays: a catcher sent deep for a two-step pass, a runner sent wide and a thrower lining up a launch all filled corners instead. The bonus is now withheld while the team-mate a launch, flank or deep square is for has not finished acting, and applies again once that player has acted. Ungated, it took 50.78% of points against main over three fresh seeds of 5,184 paired games; gated, 50.75% over three more.

Candidate source `7bd9e5eee52b` played main, `15128db61afa`. That source withheld the bonus for the whole turn once any such square existed; review then limited it to the time before that player has acted, which changes play only when a planned player has already acted: a runner under Standard's flank game plan, or a Throw Team-mate thrower late in a half. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 86-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   50.41% | 49.45% to 51.39%     |
| Standard, against the frozen planner | 5,184 |                   49.22% | 48.21% to 50.18%     |
| Persistent fixtures                  | 1,296 |                   51.54% | 49.50% to 53.32%     |
| Heuristic control                    |   432 |                   92.94% | 90.86% to 94.79%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

Confirmation on its own cannot rule out parity, but it agrees with the six focused seeds. Twenty-three rosters meet their standard, against 22. The gain is spread across the field rather than aimed at bash rosters: in the confirmation games Dwarf moved 0.5 points, Nurgle -0.8, Tomb Kings -1.3 and Chaos Dwarf -3.3, inside the five points a single roster swings between runs. Those four still miss their standard. Dwarf scores in 33% of games and Nurgle in 35%, against 50%, so their remaining gap is in scoring, and no change to how they hit closed it.

The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-7bd9e5eee52b-vs-15128db61afa` on Daily Driver. The focused runs stay under `/Users/joelloyd/tmp/bb7-bash*`.

## Rules the planner ignored, 20 November

Weight changes had stopped moving the seven rosters below their standard, so this round read games instead. Four agents each took a group of rosters, read narrated games turn by turn and counted every pattern they found across the 5,184 games of the previous lab. `narrate.ts` prints a trace as a text board with each declaration, the coach's note and the dice.

They found the planner ignoring rules, not weighing them badly:

- A prone player who declared a Blitz had no step to stand up, so the coach ended the activation and the team lost its Blitz. That happened 0.7 to 1.2 times per team per game, 10.8% of all Blitzes.
- No Ball players were sent to pick up and secure the ball and were handed it: 0.33 free turnovers a game for Necromantic builds with Wraiths.
- A chase move was valued by the squares it closed and never charged for its dice. Under Halfling's 82% move threshold, Halflings and their Treemen lost about 100 turnovers and 17 players per 128 games to them.
- Really Stupid, Unchannelled Fury, Bone Head, Animal Savagery and Take Root can end an activation before it starts, but every activation was valued as if it always happened. Minotaurs failed 367 of 752 declared moves; Snotling Big Guys failed Really Stupid 46% of the time, mostly as the team's first activation.

Each is now handled. A prone blitzer stands up and then blocks. No Ball players take no ball job. A chase move is priced like any other move with dice. An activation counts only as often as its rolls pass. Take Root counts only for plans that leave the square, because a Rooted player may still act where it stands. A Really Stupid player waits while a free team-mate can step beside it first and turn its 4+ into a 2+. Two smaller changes go with them. A pick-up is charged only against team-mates who could reach the ball this turn; before, a slow player beside a loose ball was charged for a fast team-mate across the pitch and left the ball on the ground. A marked carrier may Blitz the player marking it.

| Change, paired against the policy before it                                 | Seeds |  Games | Candidate points |
| --------------------------------------------------------------------------- | ----: | -----: | ---------------: |
| Prone Blitz, No Ball and chase pricing, against main                        |     3 | 15,552 |           53.12% |
| Activation rolls and Really Stupid help, against the above                  |     3 | 15,544 |           50.60% |
| Carrier Blitz, against the first three                                      |     1 |  5,184 |           50.18% |
| Pick-up benchmark limited to who can reach the ball, against the first four |     1 |  5,184 |           50.27% |

No change in earlier rounds gained more than 1.6 points. The first three together gained 3.1. They raised the candidate's touchdowns from 3,786 to 4,257 a seed.

A per-roster "change" belongs to a pairing: candidate Halfling against frozen Snotling and frozen Halfling against candidate Snotling give both rosters the same number. Against the field's mean change, the first three fixes moved Nurgle +3.0, Chaos Dwarf +1.8, Tomb Kings +0.9, Dwarf +0.3, Necromantic -0.7, Halfling -4.6 and Snotling -9.6. A stronger planner helped the Stunty rosters least.

Measured and dropped:

| Change                                                                                    | Result                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `cageAhead`, team-mates build the carrier's next cage before it moves                     | 49.8% and 50.1% on fresh all-roster seeds; Dwarf -4.0 and Chaos Dwarf -4.2 at 80                               |
| Frenzy's second block priced from the follow-up square                                    | 50.15% over 15,552 games; Norse and Necromantic, the Frenzy rosters, did not gain                              |
| Hold the ball while the clock allows: no progress value while the carrier has spare turns | 44.8% at one spare turn, 48.0% at two; touchdowns fell 11 to 21%                                               |
| The same hold for Tomb Kings and Halfling only                                            | 48.56% over 2,432 games on fresh seeds; Tomb Kings -4.0                                                        |
| Halfling at the default 92% move threshold                                                | 46.78% over 1,536 Halfling games; 82% stays                                                                    |
| Chase moves without dice pricing, Halfling only                                           | 48.67% over 1,536 games; the chase pricing stays                                                               |
| A hand-off valued by the team-mate throw it sets up                                       | 50.00%: a Right Stuff team-mate is almost never already beside a free thrower on the last turn                 |
| Own casualties priced like the ones we inflict, every roster                              | 49.23%; Snotling, Ogre, Gnome, Halfling and Goblin pairings gained 2 to 9 points, the elf rosters lost 5 to 9  |
| The same pricing for those five rosters only, on fresh seeds                              | 49.49% over 2,432 games; only Gnome gained. The earlier gains came from opponents playing them more cautiously |
| Every picker charged pace for the whole drive, not one turn                               | 50.00% over 10,368 games; Dwarf -2.1                                                                           |
| Tackle players prefer to mark a Dodge carrier                                             | 50.00% over 10,368 games; Dwarf +0.8                                                                           |

An independent Fable 5.2 review of the agents' evidence proposed the hold-the-ball idea and caught the pick-up benchmark fault. Drives that kept the ball until turn 4 scored 35.9% of the time against 12.5% without it, but holding on purpose cost tempo the cage never repaid. The same lesson ended `fullCage`.

Candidate source `74c074d275ae` played main, `35d50ad36b87`. Review then made two changes to the Really Stupid help. A helper's move is offered only when it is worth something, and it is priced by the helper's own activation rolls. Before, a helper with Take Root kept the full value of its move, and a set of helper moves that were all worth less than nothing raised the Big Guy's value instead of lowering it. Both change play only when a Really Stupid player waits for a helper. A check run of that review head found an engine fault: On the Ball let a player step onto the 26-by-15 pitch of the full game, so a Ghoul Runner beside the touchline stepped to (11,11), off the Sevens pitch. On the Ball and the pass-range and interception previews now use the Sevens pitch. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 87-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   52.99% | 52.09% to 53.83%     |
| Standard, against the frozen planner | 5,184 |                   51.52% | 50.54% to 52.55%     |
| Persistent fixtures                  | 1,296 |                   53.12% | 51.47% to 54.90%     |
| Heuristic control                    |   432 |                   93.52% | 91.55% to 95.37%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The candidate scored 4,249 touchdowns against 3,726 in confirmation. Standard, with its game plans and close-call variety, beat the frozen best planner for the first time.

A stronger planner did not close the gaps between rosters. The confirmation scorecard pools both policies, so two self-play runs, where the candidate plays itself on the confirmation schedule, give the standards for the shipped planner. Averaged over them, 23 rosters meet their standard, as on `7bd9e5eee52b`. Snotling now meets its standard at 31.5% against 25.9%. Vampire falls below its bar, at 40.1% against 45.3%; no paired change moved it against the field, and it sat at its bar in earlier rounds.

| Roster still short | Tier | Strength, then and now | Scores in, then and now |
| ------------------ | ---: | ---------------------: | ----------------------: |
| Necromantic Horror |    1 |    46.2% → 46.4% (50%) |         51% → 49% (55%) |
| Chaos Dwarf        |    1 |    44.8% → 45.3% (50%) |         51% → 47% (55%) |
| Nurgle             |    2 |    42.7% → 43.5% (45%) |         35% → 34% (50%) |
| Tomb Kings         |    2 |    41.3% → 41.8% (45%) |         39% → 38% (50%) |
| Dwarf              |    2 |    40.0% → 40.2% (45%) |         33% → 35% (50%) |
| Vampire            |    2 |    45.3% → 40.1% (45%) |         52% → 46% (50%) |
| Halfling           |    3 |    23.5% → 23.5% (38%) |         27% → 28% (40%) |

Halfling's gap is mostly its builds. Undeveloped, the two presets took 43.8% and 32.8% on `7bd9e5eee52b`; with four players developed they took 19% to 27%. Both presets spend 470,000 and 380,000 of the 600,000 budget and buy no team re-roll. The developed arms rank skills by a list that holds nothing a Halfling can take as a primary skill, so ties go alphabetically: Hopefuls take Catch and Right Stuff players Lethal Flight. Slow tier-2 rosters score in about a third of their games against a bar of half; every change that slowed the carrier down to protect the ball lost.

The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-74c074d275ae-vs-35d50ad36b87` on Daily Driver. The paired experiments and self-play runs stay under `/Users/joelloyd/tmp/bb7-std`.

Published report: [Blood Bowl Sevens policy lab, 20 November](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-policy-lab-2026-11-20%2Findex.html), Blood Bowl, `sevens-policy-lab-2026-11-20/`.

## Deployment, 20 November

Every computer team set up the same way. The planner loaded built-in formation number 2, the Bunker, whether it kicked or received, and gave the seven squares to its strongest players first. A person who loaded a preset from the setup drop-down got roster player 1 on square 1.

Built-in formations now give each square a role: line, support, flank or deep. The players who fit a role best fill it, judged for kicking or receiving. When receiving, Sure Hands, Big Hand and agility go deep to collect the ball, and strength, Block and Guard go on the line. When kicking, speed, Tackle and Strip Ball go on the line, and Tackle and Diving Tackle stay back as the safety. An exact assignment picks the seven, and the Team Captain is always fielded. Six formations join Balanced, Spread and Bunker: Kick: Blitz line, Kick: Press, Kick: Screen, Receive: Wedge, Receive: Full line and Receive: Flank. A pitch offers only the formations that are legal on it, and people see them in the same drop-down.

Both policies in a paired lab share the engine's setups, so role matching on its own cannot be measured there. Each formation was measured as the candidate's choice against the Bunker, both with role matching.

| Formation the candidate chose           | Seeds |  Games | Candidate points |
| --------------------------------------- | ----: | -----: | ---------------: |
| Kick: Blitz line, all seven on the line |     3 | 15,744 |           52.31% |
| Kick: Press                             |     1 |  5,248 |           51.19% |
| Kick: Screen                            |     1 |  5,248 |           49.43% |
| Receive: Full line                      |     1 |  5,248 |           50.42% |
| Receive: Flank                          |     1 |  5,248 |           50.15% |
| Receive: Wedge                          |     1 |  5,248 |           49.74% |

Pressure on the kick pays: with everyone on its line, the kicking team reaches the receivers a turn sooner. The receiving formation barely matters. The computer now kicks from the Blitz line and still receives in the Bunker. Over the three Blitz line seeds, against the field's mean change, Chaos Dwarf moved +2.0, Nurgle +1.8 and Tomb Kings -3.1.

The owner also suggested using the Veteran, a Lineman with one less movement and one re-roll a game for a pick-up, catch or pass. It could fetch the ball and hand it to a quicker player, or sit on the bench in a slow team. Branch `t3/veteran-fetch` built it: the odds count the Veteran's re-roll while it is unused, a player may declare a Hand-off, pick up the ball and hand it to a quicker team-mate who has not acted, and setups can put the Veteran deep or leave it in reserve. Each change played this branch's planner on 5,248 games.

| Veteran change                                   | Candidate points |
| ------------------------------------------------ | ---------------: |
| Re-roll counted in the odds                      |           49.96% |
| Plus the fetch, by the Veteran only              |           49.53% |
| Plus the fetch, by the Veteran only, set up deep |           49.27% |
| Fetch by any picker                              |           48.94% |
| Fetch by any picker, Veteran set up deep         |           48.59% |
| Fetch by any picker, Veteran in reserve          |           49.03% |

None helped. The re-roll comes once a game, and the fetch spends the turn's Hand-off and adds a catch roll. The branch stays as a record; nothing from it ships.

Role matching also changes the heuristic coach's games, so the lockstep reload test now replays seed 5151, which still reaches both decisions. The formation runs used candidate `aef765e6` against main at `c2cf35b2`, seed bases 1091000000 to 1093000000; the Veteran runs used `92ab9739` and `4b29abb3` against `aef765e6`, seed base 1101000000. The runs stay under `/Users/joelloyd/tmp/bb7-std` on Daily Driver as `dep-*`, `vet-*` and `vet2-*`.

## Petty cash and people's bar, 20 November

Two rules change how the lab measures a roster's standard. The standards in the sections above were measured without them.

The lab now plays every game as a friendly with inducements. The team with the lower team value gets the difference as petty cash, and both sides shop with the computer coach's own list in `computerPurchases.ts`. It buys the Halfling Master Chef first when the Chef costs less than Extra Team Training, then Extra Team Training, Blitzer's Best Kegs, Part-time Assistant Coaches and Temp Agency Cheerleaders. A 470,000 Halfling preset against a 600,000 Dwarf team gets 130,000 and buys the Chef and two Assistant Coaches. Before, the cheap Halfling presets never got their gold back. Pass `--no-inducements` to the study runners to reproduce an older run.

A roster's points bar is now the lower of its tier's bar and the share of points people took with that race on FUMBBL, 2020 to 2024, in the 11-player game. The lab no longer asks the AI to do better with a team than people do. Six rosters get a lower bar. The scores bar stays the tier's. The scorecard shows the bar each roster was judged against and marks the ones people's share capped.

| Roster             | Tier | Tier bar | People's points share |
| ------------------ | ---: | -------: | --------------------: |
| Old World Alliance |    1 |      50% |                 49.1% |
| Elven Union        |    1 |      50% |                 48.2% |
| High Elf           |    1 |      50% |                 47.6% |
| Imperial Nobility  |    2 |      45% |                 44.3% |
| Vampire            |    2 |      45% |                 43.3% |
| Nurgle             |    2 |      45% |                 42.9% |

Replay verification now hashes the final state with sorted keys, as the engine's checksum does. Restoring a save reorders the keys in `state.inducements`, so the old hash failed once inducements were in the saved state.

## Frozen acquisition

Candidate source: `eb1990dad29282ff010fc35628b3945a98f67971`, baseline: `7bde4654aa80c1d4e42bb2f54804a39675962550`. The archive and report record full revisions, source digests and result digests. Later documentation changes do not alter the measured engine or AI source tree.

The program schedules 192 diagnostic pilot games, 5,184 confirmation games, 1,296 persistent-context fixtures, 432 heuristic controls and 16 Hard sentinels. All 7,120 games completed, with zero acquisition findings and no excluded blocks in completed stages. Hard sentinels exercise different decisions on special-action boards. They do not estimate general strength.

All games are fresh decisions from the candidate revision. Earlier acquisitions remain diagnostic and are not pooled into this result. Policy and seed changes between acquisitions prevent a causal comparison of individual fixes. Recorded-game recovery is only permitted when the engine, AI, runner, runtime, locked dependencies, builds, schedule and opponent match.

## Results

| Acquisition         | Games |   Candidate points share | 95% interval         |
| ------------------- | ----: | -----------------------: | -------------------- |
| Confirmation        | 5,184 |                   50.91% | 49.94% to 51.91%     |
| Persistent fixtures | 1,296 |                   50.66% | 48.73% to 52.47%     |
| Heuristic control   |   432 |                   93.52% | 92.01% to 95.14%     |
| Hard sentinels      |    16 | 37.50%, descriptive only | No strength estimate |

Confirmation has 1,799 wins, 1,680 draws and 1,705 losses. Its equal-roster points share is 50.77%, with a 49.57% to 51.92% interval across 30 rosters. Both overall intervals span parity, so this acquisition does not establish a strength gain over the frozen planner. Each build-method interval also spans parity. Equal SPP budgets do not imply equal team values or identify a chosen-versus-random effect.

The candidate made 39 accepted Pass commands, completed 14 and scored 9 same-turn receiver touchdowns. The frozen policy made no passes. Handoffs are excluded. The candidate scored 2,000 turn-five/six touchdowns against 1,672, including 751 scoring carrier runs of at least six columns against 719. These are whole-policy counts, not an ablation of passing or late-half logic.

Persistent fixtures do not demonstrate better league performance or player survival. The candidate suffered 210 deaths against 201. The difference is 0.69 extra deaths per 100 games, with a 95% interval from -2.24 to 3.32. Miss-next-game losses were 253 against 229, also inconclusive. Exhibition confirmation had 1,225 miss-next-game losses against 1,133; its interval also spans zero. Extra late scoring did not establish better match results or lower player losses.

The confirmation recorded 340 unfed Vampire endings against 421. This describes the whole policy. Different Bloodlust roll totals and game trajectories prevent a causal claim about feeding support.

Candidate decision time totalled 639.0 seconds against 581.7 in confirmation. These are coach-computation totals across concurrent matches, not elapsed wall time. All records retain their acquisition measurements.

Points share counts wins as one and draws as one half. Confidence intervals resample complete blocks 2,000 times. The equal-roster estimate gives each roster the same weight. Counts of useful plays describe observed sequences, not the causal value of any individual skill.

The archived acquisition source digest is `8ef029a655ae5a5d6801d242e69a4ee1ac2f6853fbfa35176979ba04b45c3087`. The engine and AI tree digest is `2ef321db1099caaf4479be4da6805af0c7c010189f69122ba0c5e640f8c81cb6`. Acquisition used v24.3.0 on Daily Driver. The 65-check tactical gate passed. The full local suite passed 3,324 tests with 64 existing skips; eight report tests passed.

The acquisition remains at `/Users/joelloyd/tmp/bb7-policy-lab-eb1990dad292` on Daily Driver, including raw traces and immutable source archives. The published report bundles source archives and CSV/JSON downloads. The report generator records its own source hash separately from the acquisition.

An independent GPT-6.1 Sol audit found two planning defects fixed before final acquisition. It inspected the decision trail and artifacts. The workspace had no `agent-transcripts/` directory, so that audit could not verify the complete dialogue. CodeRabbit found eleven further issues across two rounds. The last round also exposed a misleading test expectation, which was replaced with literal spent and unspent reroll controls.

A fresh GPT-6.1 Sol evidence audit independently reconciled all 7,120 match rows and 14,240 team rows, verified source archives and published downloads, reproduced the confirmation estimate and interval, and found no material discrepancies. It checked the append-only decision trail and superseded acquisitions. It did not rerun matches or verify the complete dialogue, and it does not replace the pull-request review gate.

## What remains open

The skill inventory lists 108 skills and traits. Nine have bounded tactical contracts. The other 99 remain explicit tactical gaps, even where their mechanics work or their events occur naturally. Coverage needs a useful-play fixture and a better-alternative or failure control, rather than a trigger quota.

Persistent fixtures restart after each match. They do not measure injuries across a full career. Current results do not justify a claim that the AI preserves players better. An optimistic scoring horizon supports current movement and immediate transfers; it cannot establish that every imaginable chain play is impossible.

The largest observed per-roster points declines were Snotling at -7.81 percentage points, Chaos Renegade at -4.43 percentage points, Bretonian at -3.91 percentage points. These compare each roster under both policies. They are exploratory leads with only 64 to 192 games per policy, not established roster-specific effects. Raw roster win rates also reflect matchup strength.

The next round should pair the same boards and seeds with preservation enabled and disabled, then turn recorded player-loss failures into tactical controls. Add season carry-over with explicit player-value tradeoffs. Add supported Throw Team-mate scoring and negative-trait failures, and turn Hard losses into replay-derived tactical contracts. Broader opponents and an ablation of feeding/preservation modules are needed before attributing gains to those modules. Unplayed roster pairings remain untested.

## Reproduce and inspect

Run `scripts/coach/policy-lab/daily-driver.sh full` from a clean committed checkout. See [the run guide](../../scripts/coach/policy-lab/README.md) for gates, seeds, controls and recovery. Inspect saved decision receipts before changing policy. Behaviour changes require fresh confirmation.

Published report: [Blood Bowl Sevens policy lab](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-policy-lab-2026-11-17%2Findex.html), Blood Bowl, `sevens-policy-lab-2026-11-17/`.

Implementation and review: [PR223](https://github.com/joe-lloyd/bloodbowl-phaser/pull/223). The decision trail is [.audit/sevens-policy-lab.tsv](../../.audit/sevens-policy-lab.tsv).
