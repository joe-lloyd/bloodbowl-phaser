# Project status

Last checked: 2 November 2026. This page describes implemented behaviour and
known gaps, rather than a release promise or a claim of complete rules coverage.

## Playable now

Local two-coach matches support team selection, setup, kick-offs, regular and
special player actions, scoring, half-time, results and saved-match resume.
A [computer coach](technical/computer-coach.md) can take Player 2 instead, at
Standard, Hard or Legend difficulty.
Teams can develop across matches and enter leagues or tournaments.
The [roster update audit](ROSTER_UPDATES_2026.md) records the 2026 data updates
and their sources.

The public catalog contains 108 skill and trait families. The
[rule coverage gate](../__tests__/headless/rules/gate.test.ts) currently expects
106 registered in-match rules. Insignificant is enforced during roster
construction instead. Decay also stays unregistered: Sevens does not use the Casualty Roll that it modifies.
A registered rule and a passing scenario do not prove every interaction is correct.

## Rules and progression gaps

The [Sevens checklist](SEVENS_RULES.md) is the detailed implementation audit.
Its outstanding items include:

- Razzle-Dazzle and Magic Scroll can be awarded but have no gameplay effect.
- Re-drafting has rules helpers but no season-management screen.
- Some roster-management flows, including a Journeyman hiring screen, remain absent.

[The October rules review](RULES_REVIEW.md) records reproduced fixes and the
remaining audit findings. It is a dated review, not a guarantee about every
current path.

## Online play

Both browsers run the engine and exchange commands through Firestore. Checksums
and resyncs help recover state divergence. Firebase authentication and database
rules restrict access, but there is no authoritative game server validating
all gameplay. Play with coaches you trust.

The [active lockstep tasks](../openspec/changes/online-lockstep-play/tasks.md)
still include timing and determinism checks, commit/reveal write restrictions,
stale-driver clock takeover and agreement on decision timeouts. A page that
comes back to a match replays the commands it missed, so a decision it owed
is still open and can be answered. Treat online play as experimental.

## Developer tools and build limits

- The simulation CLI plays whole matches between automated coaches.
- Sandbox and Sound Test are development tools, gated on configured deployments.
- The Vite production bundle builds independently of private rulebook files.
  The stricter TypeScript build has existing errors; see
  [build instructions](DEVELOPMENT.md#build-and-preview).

## Evidence to run

| Claim                                         | Check                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Skill registration and scenario coverage      | `pnpm exec vitest run __tests__/headless/rules/gate.test.ts`                                |
| Legal development rosters                     | `pnpm exec vitest run __tests__/unit/seeding __tests__/integration/developmentSeed.test.ts` |
| Deterministic scenarios                       | `pnpm e2e:engine`                                                                           |
| Actual browser interactions                   | `pnpm e2e:browser`                                                                          |
| Reviewed screenshot baselines                 | `pnpm e2e:visual`                                                                           |
| Whole-match interactions and replay           | `pnpm sim --games 10`                                                                       |
| Documentation links and private-file tracking | `pnpm docs:check`                                                                           |
