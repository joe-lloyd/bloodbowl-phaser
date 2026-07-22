# AI Notes — living bug/gotcha list

## 2026-07-22 — Throw / Kick Team-mate subsystem landed

Implemented Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop,
Strong Arm (change `add-throw-teammate-rules`). Engine core is
`ThrowTeammateOperation`; eligibility is `src/game/rules/throwTeammate.ts`
(`isRightStuffEligible`). Coverage gate moved 69 → 74 (Always Hungry was already
counted, so only 5 new registrations).

**Gotcha for any future headless command:** a new `HeadlessCommand` must be
registered in THREE places or it silently fails:
1. `src/headless/protocol.ts` — the `HeadlessCommand` union.
2. `src/headless/HeadlessGame.ts` — `COMMAND_SHAPES` (shape validation; omitted →
   `unknown-command-type`) AND the execute `switch`.
3. `src/game/rules-lab/runner.ts` — `ID_FIELDS`, if any id field carries a
   `team1:0`-style `PlayerRef` (throw-teammate needed `throwerId`/`teammateId`).

**Known simplifications (first cut, faithful-enough, not full rulebook):**
- Off-pitch thrown-player scatter is clamped to the pitch edge (crowd/injury on a
  throw into the crowd is deferred).
- Swoop's throw-in template is modelled as a single-step (1× D8 "Bounce") scatter
  rather than the full throw-in fan; it still gives the tighter scatter + landing
  +1 the trait intends.
- Kick-fumble "removed from play" is: clear gridPosition + Injury Roll + turnover.
- Browser UI wiring (action menu button + GameplayInteractionController) is
  implemented but NOT yet verified in-browser. Sequence is `[move, throw]`:
  optional Move step first, then a Throw step whose first click picks the
  adjacent Right-Stuff mate and whose second click aims. Aim reuses the pass
  arrow + range template (`drawPassZones`/`drawPassLine`) but capped to Quick
  and Short bands.

**Range cap (2026-07-22 follow-up):** a team-mate can only be thrown to Quick
or Short range — `isThrowTeammateInRange(from,to)` in
`src/game/rules/throwTeammate.ts` (rangeValue 0/1). Enforced in
ThrowTeammateOperation (rejects out-of-range with a notification, before the
SkillTriggered emit so no throw is recorded) and mirrored in the controller
aim-click. Catalog `ttm-out-of-range` locks the rejection.

**Ogre-themed playable scenarios (2026-07-22):** added OGRE composition to
`TeamFactory.createTestTeam` (was defaulting to 7 Gnoblars) → indices 0-1 Ogre
Blocker (Throw Team-mate), 2 Ogre Runt Punter (Kick Team-mate), 3-6 Gnoblar
Lineman (Right Stuff, ST 1). New `SCENARIOS` (src/data/scenarios.ts, loaded by
SandboxScene via team1Roster swap): `throw-team-mate-ogre` (Ogre thrower marked
by 2 opponents, throws a ball-carrying Gnoblar), `kick-team-mate-ogre`,
`gnoblar-touchdown-run` (Gnoblar ball carrier 4 sq from the x=19 end zone —
team1 scores at x=width-1 per isInEndZone). NOTE the Ogre Blocker/Punter carry
Bone Head, so a declared throw first rolls the activation gate (realistic) —
seed hunts absorb the ~1/6 Bone-Head-fail via higher seedSearch limits. BOTH
the playable SCENARIOS **and** the rule-lab RULE_SCENARIOS catalog
(throwTeammate.ts + Always Hungry in negatraits.ts) are Ogre-themed: setups pin
`team1Roster: RosterName.OGRE`, thrower = idx 0 (Ogre Blocker) / idx 2 (Runt
Punter for kicks), Gnoblar mate = idx 3; Strong Arm/Swoop/Always Hungry are
granted additively on the thrower (native Throw/Kick Team-mate + Right Stuff
come from the roster). The sandbox rule explorer swaps team1 to the config's
team1Roster (SandboxScene.loadScenario), so configs render as Ogres/Gnoblars.
Also removed the green eligible-mate highlight from the TTM aim hover in
GameplayInteractionController.

**Throw animation + ball-follow (2026-07-22):** the thrown player flies to the
landing square instead of teleporting. The operation emits `PlayerMoved` with
`path:[landing]` + `thrown:true`; `PlayPhaseHandler.handlePlayerMove` branches
on `thrown` to `PlayerSprite.animateThrow` (arc: inner shape rises+grows+spins,
then a landing squash — vs the jog of `animateMovement`). A thrown ball carrier
takes the ball: the operation sets the ball to the landing square and passes
`ballFrom/ballPath/ballJoinStep` so the existing ball-follow tween runs; on a
Standing landing they keep it, on crash/prone-landing a `BounceOperation` drops
it. Catalog `ttm-carry-ball → lands-with-ball` locks possession retention.
