# Skills left

This is the live implementation list. A skill leaves this section only after
its engine behavior is registered and its seeded rule-catalog scenario passes
headlessly (the same catalog powers the sandbox rule explorer).

None. All 107 in-match skills and traits are registered and covered by seeded
rule-catalog scenarios. Insignificant remains deliberately unregistered because
it is enforced while building the Team Draft List, not during a match.

## Completed in this campaign

- Bullseye: Superb Throw lands on target without Scatter.
- Give and Go: continue moving after a no-Turnover Quick Pass or Hand-off.
- Quick Foul: continue moving after a Foul.
- Fumblerooski: leave the ball in a vacated Move square without a Turnover.
- Diving Catch: adjacent Pass/throw-in/kick-off catch plus target-square +1;
  never triggers from a Bounce.
- Secret Weapon: Sent-off during the end-of-Drive sequence.
- Violent Innovator: Special Action Casualties are attributed to the skill
  holder for SPP processing.
- Pile Driver: qualifying Block knockdown performs the free Foul, then Places
  the blocker Prone and ends their activation.
- Saboteur: the pre-Armour explosion roll can KO the Saboteur, knock down the
  blocker, and cause a Turnover when that blocker carried the ball.
- Multiple Block: two marked targets resolve at -2 Strength, without
  Follow-up, including a second Block after a first-result Turnover.
- Dump-Off: a no-Turnover Quick Pass resolves before an incoming Block or
  directly-targeting opposition Special Action.
- Leader: one half-level re-roll while at least one Leader remains on the
  pitch.
- On the Ball: sequential pre-PA reacting movement plus the receiving-team
  kick-off move after deviation and before the Kick-off Event.
- Punt: move-then-kick action with D6 direction/distance, Kick re-rolls, and
  the correct loose-ball, opposition-possession, and crowd Turnover rules.
- Lethal Flight: post-roll +1 on an opposition crash plus 2-SPP Casualty
  attribution to the thrown Right Stuff player.

## Known project-wide validation baseline

The headless rule catalog and coverage gate are the authoritative checks for
this campaign. The repository still has unrelated pre-existing TypeScript and
lint errors; record any newly introduced failures separately rather than
mixing them into this list.
