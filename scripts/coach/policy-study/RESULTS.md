# First skill-plan comparison — 16 November 2026

The candidate selected useful new actions and reduced turnovers. A higher win rate is **not established**: it earned 50.23% of points against the frozen previous planner, with a block-bootstrap 95% interval of 49.17–51.37%.

Daily Driver ran 3,240 matches over 810 balanced four-game blocks, all 405 snapshots and all 30 rosters. Every game finished with zero engine findings. Every immediate replay matched its final state hash and authoritative event counters. No block was excluded.

| Outcome                    |             Candidate |        Frozen planner |
| -------------------------- | --------------------: | --------------------: |
| Wins / draws / losses      | 1,086 / 1,083 / 1,071 | 1,071 / 1,083 / 1,086 |
| Touchdowns                 |                 2,018 |                 2,012 |
| SPP casualties             |                 2,524 |                 2,501 |
| Turnovers                  |                 8,373 |                 9,184 |
| Roster-weighted TD/CAS SPP |                11,453 |                11,361 |
| Total coach decision time  |         371.4 seconds |         163.7 seconds |

The candidate used 3,900 Secure the Ball declarations, 425 Gaze commands, one Multiple Block command and 225 Thrall-support declarations. These are selections, not per-skill win contributions. Forty skill/trait names had no recorded SkillTriggered event under either policy; event coverage is not the same as mechanical coverage.

Vampire teams had 160 games per policy. Candidate points share was 41.56% against 40.00% for the previous policy using those same roster matchups, a descriptive difference of +1.56 percentage points. They averaged 1.03 fewer turnovers per game. Across the whole run, unfed Bloodlust events were 184 against 341, while bite events were 382 against 211. More friendly bites can hurt Thrall availability, so the next feeding study must measure that cost rather than rewarding bites or triggers themselves. Roster samples have no individual confidence intervals here.

The candidate's points share was 48.69% on base teams, 50.35% on focused builds and 50.89% on randomized builds. Every cohort's interval includes 50%. The equal-weight mean across roster point-share deltas was +0.57 percentage points, descriptive without a macro interval. Neither this pattern nor reduced turnovers proves better generalisation.

## Integrity work before confirmation

The initial 96-game smoke run exposed four refused Secure the Ball declarations by Unsteady players. Action availability now respects that existing trait rule. The corrected smoke run had no findings.

An initial 3,240-game diagnostic run then exposed a Frenzy bug: a forced follow-up onto a loose ball failed its pickup, but a second Block decision opened while the turnover was ending the half and clearing the pitch. The second block now stops during a latched turnover. Two regression boards cover ordinary and end-of-half turns; replaying the original failing prefix no longer opens a stale decision. The diagnostic batch is retained separately, including its one finding, and is not pooled with confirmation.

The clean confirmation used a new 14-million seed range after that engine correction. No weights or tactical rules were tuned against its outcomes. The full run took 133.1 seconds with eight workers. The archived candidate source matches the committed acquisition inputs at SHA-256 `541c4edbbda9bcef8af063ca2a03d62eb8443221629d8e8922c560dc452ca386`. The control imports decision code frozen at `c55748321ee15d16a4060181c0818e35640f66ac`; both policies use the current engine and legal candidates.

## Review corrections after acquisition

The final PR corrects feeding-cost cancellation in carrier and support moves, including chase moves, and discounts pickup touchdown rewards when Bloodlust can prevent the score. Focused tactical regressions verify these corrections. The 3,240-game results above describe only the archived candidate with digest `541c4edbbda9bcef8af063ca2a03d62eb8443221629d8e8922c560dc452ca386`, before these review corrections. They do not establish performance of the final PR head. The source archives and acquisition remain unchanged; no new full-game confirmation was run for the review corrections.

The report rebuild also removes stale optional source evidence and bundles only current managed files. Its feeding interpretation makes no fixed directional claim.

## Next experiments

- Multiple Block is too sparse to assess. Add natural matchups with high-Strength blockers, two worthwhile adjacent targets and realistic assists, alongside dangerous reduced-Strength controls.
- Ablate securing, Gaze and feeding separately on new seeds. The whole-policy comparison cannot identify which module caused an outcome change.
- Throw Team-mate / Lethal Flight needs a declaration-and-continuation module before match exposure can evaluate its AI use. Compare scoring throws, damaging throws, failed landings and lost possession.
- Keep weapon/foul ejection costs, punt/jump modules and opponent-specific support denial as separate milestones. Confirm against Hard/Legend and exploiters after tactical correctness checks.

The generated `index.html`, CSVs and `policy-study-data.zip` live under the ignored `sim-results/skill-plans/report` artifact directory, with copies on Daily Driver. Source archives, manifests and digests accompany the downloadable data; full traces stay beside each acquisition. See [the reproduction guide](README.md).
