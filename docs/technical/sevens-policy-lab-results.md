# Sevens AI policy lab results

The first policy-lab release completes useful passing plans, prices transfers with the actual shared reroll bank, and adds explicit turn-five preparation and turn-six scoring choices. A common planner handles movement, possession, hitting and defence. Capability modules add feeding support, Hypnotic Gaze and other supported actions. Match context uses actual opponents, skills, available players and persistent-injury costs.

The lab runs normal Sevens matches through the command engine. It balances both policies across roster assignment, pitch side and first receiver in eight-game blocks. It saves commands and notes, replays every match and reconciles gameplay counters. Games use six-turn halves and separated setup lines.

## Advanced plays, 17 November

The second release lets the coach throw team-mates, sets up a last-turn throw and gives Standard a game plan per match. Candidate source `73f3e8ab3b7f` played `main` at `53a1c8dd611832f3dc8221664ad07e277ecb87dd`, the same frozen-policy design as below. All 12,304 games completed, with zero acquisition findings and no excluded blocks. The 69-check tactical gate passed.

| Stage                                | Games |   Candidate points share | 95% interval         |
| ------------------------------------ | ----: | -----------------------: | -------------------- |
| Confirmation, best planner           | 5,184 |                   49.89% | 49.72% to 50.07%     |
| Standard, game plans and close calls | 5,184 |                   48.56% | 47.53% to 49.53%     |
| Persistent fixtures                  | 1,296 |                   50.15% | 49.96% to 50.39%     |
| Heuristic control                    |   432 |                   90.39% | 88.19% to 92.48%     |
| Hard sentinels                       |    16 | 28.13%, descriptive only | No strength estimate |

The best planner is level with `main`: its interval includes parity, and its equal-roster share is 50.29%, 49.60% to 50.96%. It scored 3,318 touchdowns against 3,328 and suffered 644 deaths against 647. Standard gives up about 1.4 points of points share for its variety, which is the intended feel of the easiest level.

What each policy chose, counted from saved commands by the coach's note:

| Play in 5,184 games                         |           Best planner |                Standard |   `main` |
| ------------------------------------------- | ---------------------: | ----------------------: | -------: |
| Carrier thrown by a team-mate               | 26, 3 scored that turn | 33, 12 scored that turn |        0 |
| Passes, Pass command accepted               |                     39 |                      64 | 39 to 41 |
| Receiver touchdowns after a completion      |                     11 |                      25 | 10 to 13 |
| Flank runner sent wide                      |                      0 |                     329 |        0 |
| Thrower set up beside a Right Stuff carrier |                    120 |                     126 |        0 |

Every carrier throw in the earlier runs came on the last turn of a half, when nothing safer could score. The planner prices a throw honestly: a PA 5+ Trained Troll fumbles about a third of its throws.

Paired ablations on the same 5,184 seeds, against `3741e12c`, found what the first version cost. The launch setup ran all half and lost 13.3 points of points share on Snotling. A flank runner cost 0.75 points even when only one went wide. Throw Team-mate itself and sideways transfers made no difference. The launch setup now runs only on turn five, and only Standard's flank game plan sends a runner wide.

The lab found four engine faults on the way, each fixed with a test: a thrown carrier landing in the end zone did not score, an eaten team-mate was not recorded as dead, a Multiple Block rolled its second block after the blocker fell, and a spent team-mate throw was still offered. `main` fixed crashed and fumbled thrown players in the meantime.

Passing is still rare because a dropped ball is priced at 60 points plus the turnover. Changing that price is the next tuning study. Counts of plays describe what followed them, not their causal value.

Published report: [Sevens advanced plays](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-advanced-plays-2026-11-17%2Findex.html), Blood Bowl, `sevens-advanced-plays-2026-11-17/`. Each stage links its plays and moments page, whose scoring moments open the match viewer at the declaration. The acquisition stays at `/Users/joelloyd/tmp/bb7-policy-lab-73f3e8ab3b7f-vs-53a1c8dd6118` on Daily Driver.

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
