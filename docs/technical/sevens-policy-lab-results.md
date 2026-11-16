# Sevens AI policy lab results

The first policy-lab release completes useful passing plans, prices transfers with the actual shared reroll bank, and adds explicit turn-five preparation and turn-six scoring choices. A common planner handles movement, possession, hitting and defence. Capability modules add feeding support, Hypnotic Gaze and other supported actions. Match context uses actual opponents, skills, available players and persistent-injury costs.

The lab runs normal Sevens matches through the command engine. It balances both policies across roster assignment, pitch side and first receiver in eight-game blocks. It saves commands and notes, replays every match and reconciles gameplay counters. Games use six-turn halves and separated setup lines.

## Frozen acquisition

Candidate source: `aad9892275fa5cef210a4cc5977188d3a0d628d3`, baseline: `7bde4654aa80c1d4e42bb2f54804a39675962550`. The final archive and report record full revisions, source digests and result digests. Later documentation and presentation changes do not alter the measured engine or AI source tree.

The final run contains 192 diagnostic pilot games, 5,184 confirmation games, 1,296 persistent-context fixtures, 432 heuristic controls and 16 Hard sentinels. The Hard games exercise a different decision path on special-action boards. They do not estimate general strength.

All 7,120 final games completed with zero acquisition findings and no excluded blocks. All final games are fresh decisions from the candidate revision. Earlier acquisitions remain diagnostic. They were superseded by policy fixes found through tactical tests and independent review. Recorded-game recovery is only permitted when the engine, AI, runner, runtime, locked dependencies, builds, schedule and opponent match.

## Results

| Acquisition | Games | Candidate points share | 95% interval |
| --- | ---: | ---: | ---: |
| Confirmation | 5,184 | 51.74% | 50.74–52.78% |
| Persistent fixtures | 1,296 | 49.31% | 47.15–51.47% |
| Heuristic control | 432 | 91.90% | 90.05–93.63% |
| Hard sentinels | 16 | 37.50%, descriptive only | No strength estimate |

Confirmation has 1,846 wins, 1,672 draws and 1,666 losses. Its equal-roster points share is 52.19%, with a 50.88–53.37% interval across 30 rosters. The base, coherent, coverage and Random Primary estimates range from 51.23% to 52.16%. Their uncertainty does not establish that one build method is better.

The candidate made 43 accepted Pass commands, completed 18 and scored 12 same-turn receiver touchdowns. The frozen policy made no passes. Handoffs are excluded. The candidate scored 2,035 turn-five/six touchdowns against 1,612, including 764 scoring carrier runs of at least six columns against 685. These are whole-policy counts, not an ablation of passing or late-half logic.

Persistent fixtures do not demonstrate better league performance or player survival. The candidate suffered 192 deaths against 169. The difference is 1.77 extra deaths per 100 games, with a 95% interval from -0.77 to +4.48. Miss-next-game losses were 304 against 283, also inconclusive. Exhibition confirmation had 1,255 miss-next-game losses against 1,078, with an interval for the per-game difference above zero. Extra scoring did not eliminate player-loss costs.

The confirmation recorded 365 unfed Vampire endings against 432. This describes the whole policy. Different Bloodlust roll totals and game trajectories prevent a causal claim about feeding support.

Candidate decision time totalled 642.3 seconds against 570.7 in confirmation. These are coach-computation totals across concurrent matches, not elapsed wall time. All final records preserve the acquisition measurements.

Points share counts wins as one and draws as one half. Confidence intervals resample complete blocks 2,000 times. The equal-roster estimate gives each roster the same weight. Counts of useful plays describe observed sequences, not the causal value of any individual skill.

The archived acquisition source digest is `de54f95cf2d1040b425ff56eb2d89624ccf6d033d804dc4daac6337a8b068f9c`. The engine and AI tree digest is `dd424181c757107d2f87345439c64324a4c7a0c0b495619c82b66015a79b6cfe`. Acquisition used Node v24.3.0 on Daily Driver. The 64-check tactical gate passed. The full local suite passed 3,323 tests with 64 existing skips; seven report tests passed.

The reproducible acquisition remains at `/Users/joelloyd/tmp/bb7-policy-lab-aad9892275fa` on Daily Driver, including raw traces and immutable source archives. The published report bundles source archives and CSV/JSON downloads. The report generator records its own source hash separately from the acquisition.

An independent GPT-6.1 Sol audit found two planning defects that were fixed before final acquisition. It inspected the decision trail and artifacts. The workspace had no `agent-transcripts/` directory, so that audit could not verify the complete dialogue. CodeRabbit found nine further issues, all fixed with the full suite passing.

## What remains open

The skill inventory lists 108 skills and traits. Nine have bounded tactical contracts. The other 99 remain explicit tactical gaps, even where their mechanics work or their events occur naturally. Coverage needs a useful-play fixture and a better-alternative or failure control, rather than a trigger quota.

Persistent fixtures restart after each match. They do not measure injuries across a full career. Current results do not justify a claim that the AI preserves players better. An optimistic scoring horizon supports current movement and immediate transfers; it cannot establish that every imaginable chain play is impossible.

The largest observed per-roster points declines were Gnome at -3.52 percentage points, Amazon at -1.95 and Black Orc at -1.56. These compare each roster under both policies. They are exploratory leads with only 128 to 192 games per policy, not established roster-specific effects. Raw roster win rates also reflect matchup strength.

The next round should pair the same boards and seeds with preservation enabled and disabled, then turn recorded player-loss failures into tactical controls. Add season carry-over with explicit player-value tradeoffs. Later rounds should add supported Throw Team-mate scoring and negative-trait failures, and turn Hard losses into replay-derived tactical contracts. Broader opponents and an ablation of feeding/preservation modules are needed before attributing gains to those modules. Unplayed roster pairings remain untested.

## Reproduce and inspect

Run `scripts/coach/policy-lab/daily-driver.sh full` from a clean committed checkout. See [the run guide](../../scripts/coach/policy-lab/README.md) for gates, seeds, controls and recovery. Inspect saved decision receipts before changing policy. Behaviour changes require fresh confirmation.

Published report: [Blood Bowl Sevens policy lab](https://home.arpa/open/?fp=URFDvuvpmcDmjtIkdxfUIIoW7wLpwxPawUc1BFCVk54&vault=bloodbowl&path=sevens-policy-lab-2026-11-16%2Findex.html), Blood Bowl, `sevens-policy-lab-2026-11-16/`.

Implementation and review: [PR223](https://github.com/joe-lloyd/bloodbowl-phaser/pull/223). The decision trail is [.audit/sevens-policy-lab.tsv](../../.audit/sevens-policy-lab.tsv).
