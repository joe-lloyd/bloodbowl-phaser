# Skills left

This is the live implementation list. A skill leaves this section only after
its engine behavior is registered and its seeded rule-catalog scenario passes
headlessly (the same catalog powers the sandbox rule explorer).

## Multiple Block

When declaring a Block Action, perform two Blocks against different marked
opponents. Reduce the blocker's Strength by 2 for both Blocks, resolve both
even if the first causes a Turnover, and allow no Follow-up.

## Dump-Off

When directly targeted by an opposition Block or Special Action, the player
may immediately make a Quick Pass before the targeting action resolves. This
Quick Pass cannot cause a Turnover.

## Leader

At the start of a half, a team with a Leader on the pitch gains one Leader
Re-roll. It follows Team Re-roll rules, may only be used while a Leader remains
on the pitch, and is lost when the final Leader leaves play.

## On the Ball

After an opponent declares a Pass target but before the PA test, each eligible
On the Ball player may reactively move up to three squares without Rushing.
Resolve players one at a time; a Fall Over prevents later reactions. At
kick-off, one Open receiving player may similarly move after deviation and
before the kick-off event, except on a Touchback and never into the opposition
half.

## Punt

Once per turn, Move and then punt a carried ball using the Throw-in template:
D6 direction and D6 distance. Kick may re-roll direction and/or distance. A
loose ball at rest is not a Turnover; possession by the opposition or the ball
entering the crowd is.

## Lethal Flight

When a thrown Right Stuff player knocks down an opponent while landing, apply
+1 to either Armour or Injury after the roll. A resulting Casualty is credited
to the thrown player for SPP.

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

## Known project-wide validation baseline

The headless rule catalog and coverage gate are the authoritative checks for
this campaign. The repository still has unrelated pre-existing TypeScript and
lint errors; record any newly introduced failures separately rather than
mixing them into this list.
