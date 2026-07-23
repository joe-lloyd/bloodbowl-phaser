# skills left

- SECRET WEAPON” (PASSIVE)
At the end of a Drive in which this player took
part, even if they are not on the pitch at the end
of the Drive, they are Sent-off for committing
a Foul.

- BALL & CHAIN* (ACTIVE)
When this player is activated, the only action
they can declare is a Ball & Chain Special
Action; there is no limit to the number of players
that can declare this Special Action each Turn.
When a player performs a Ball & Chain Special
Action, position the Throw-in Template over this
player so it faces one of the two End Zones
or either Sideline. Then roll a D6 and move
this player into the square as indicated by the
Throw-in Template.
A player that moves in this manner does not
have to make an Agility Test to Dodge away
from another player's Tackle Zone; they will
automatically pass. Opposition players cannot
use the Shadowing or Tentacles Skills against a
player performing a Ball & Chain Action.
e if this move takes this player off the pitch,
they will risk Injury by the Crowd.
© if this move takes this player into a square
containing a Standing player (from either
team) they will automatically perform a
Block Action against that player; this Block
Action will ignore the Foul Appearance Skill.
if this is 2 team-mate, then this player's
Coach will choose which result to apply after
the Block Dice have been rolled.
* If this move takes this player into a square
containinga Prone or Stunned player, that
player is Pushed Back and an Armour Roll is
made against them.
© If this move takes this player into a square
containing the ball, it will immediately
Bounce. This will not cause a Turnover.
A player performing a Ball & Chain Special
Action can move a number of Squares up to
their MA. They may Rush as normal, though if
they roll 2 1, they will move into the Square as
normal first, including performing any Block
Actions, Pushing Back any players or Causing
the ball to Bounce, before Falling Over in the
Square they have moved into.
if this player is Knocked Down, Falls Over or Placed Prone for any reason, immediately make an Injury Roll for them treating any result of Stunned as Knocked-out instead.

-  BOMBARDIER (ACTIVE)  ✅ DONE 2026-07-23 (BombardierOperation: Throw Bomb Special Action = "throwBomb" action + GameService.throwBomb + headless `throw-bomb` command. PA test like a Pass → accurate/scatter/fumble; the bomb is a separate projectile (never the ball) and never Bounces — it explodes when it comes to rest: the square it lands in is hit, each adjacent player hit on a 4+, Armour Rolls all round (standing hits Knocked Down first). Fumble = explodes in the Bomber's own square + Turnover. Catch/Intercept → immediate auto-re-throw (nearest enemy, MAX_RETHROWS cap). BombardierRule = inert marker. Configs `throw-bomb` (accurate-explodes, fumble-self-detonates); headless bombardier.test.ts; sandbox scenario `throw-bomb-bombardier`. Gaps: "only one Throw Bomb per team Turn" limit not enforced; crowd (off-pitch scatter clamped to edge); Pass-side skill folds (Accurate/Cannoneer/etc.) not applied to the bomb's PA test.)
P When this player is activated, they can declare
a Throw Bomb Special Action; only one player
can declare this Special Action each Turn.
| When a player performs a Throw Bomb Special
Action, they throw a bomb in the same manner
¥ rey as when a player performs a Pass Action,
ae following all the usual rules for a Pass Action.
Though this is not a Pass Action itself, any Skills
or Traits that come into play when a player
performs a Pass Action will also applyto a
Throw Bomb Special Action, with the exception
of the On the Ball Skill. A player that declared a
Throw Bomb Special Action may not perform a
Move Action before throwing the bomb.
If at any point a bomb comes to rest on the
ground then it will immediately explode in that
square. Should a bomb be Fumbled by the
thrower, or dropped when a player attempts
to Catch it, then it will not Bounce and will
instead explode in that player's square. When
a bomb explodes, any player in the square it
exploded in is hit by the explosion. Additionally,
roll a D6 for each player adjacent to the square
in which the bomb exploded. On a 4+, they are
hit by the explosion.
Any Standing player that is hit by the explosion
is immediately Knocked Down. Additionally,
make an Armour Roll for any Prone or Stunned
players hit by the explosion.
If a player successfully Catches or Intercepts a
thrown bomb, the player that caught the bomb
must immediately throw it again, following
all the same rules for making a Throw Bomb
Special Action as described above.
Here, this Bomma has declared a Throw Bomb
Special Action, and has declared the square
containing the Bretonnian Squire as the target
square a Short Pass. The Bomma makes the
Passing Ability Test, rolling a 5 and resulting in
an Accurate Pass. As there are no opposition
players underneath the Range Ruler, there is
no attempt to Intercept the bomb and the bomb
lands in the Bretonnian Squire's square and
they must try to Catch it.
The Bretonnian Squire rolls a 4 to Catch
the bomb, which is a success. Because the
Squire has caught the bomb, they must
now immediately throw the bomb again.
Unfortunately, the Squire rolls a 1 and fumbles
the bomb, causing it to blow up in their square.

- CHAINSAW” (ACTIVE) ✅ DONE 2026-07-23 (ChainsawAttackOperation as a 'chainsaw' special-action kind — mirrors Stab: D6 kick-back via rollSkillCheck("Chainsaw Kick-back",2) → 1=wielder knocked down+Armour+turnover, 2+=+3 Armour Roll on adjacent Standing target→Injury; ChainsawRule.onArmourBreak adds the always-on +3 to the downed wielder's own armour. Wired ActionType/declareAction/performSpecialAction/actionAvailability/headless special-action/browser button. config chainsaw-attack. TODO: Foul-with-chainsaw +3 and Blitz-block-replacement clauses.)
When this player is activated, they can declare
a Chainsaw Attack Special Action; there is no
limit to the number of players that can declare
this Special Action each Turn.
When a player performs a Chainsaw Attack
Special Action, roll a D6. On a 2+, this player
may immediately make an Armour Roll against
one adjacent Standing opposition player,
applying a +3 modifier to the Armour Roll.
On a 1, the Chainsaw will Kick-back and this
player is Knocked Down instead.
If this player is Knocked Down or Falls Over for
any reason, regardless of how it occurred, then
a +3 modifier is applied when the opposition
Coach makes an Armour Roll for this playef
This +3 modifier must always be applied.
Should they wish, this player may also use thelrchainsaw when performing a Foul Action, in
which case they may apply a +3 modifier when
making the Armour Roll for the opposition
player. They will still need to roll for Kick-back
as normal.
This player may use the Chainsaw Attack Speci@!Action to replace the Block Action made a5
part of a Blitz Action if they wish, though thelr
activation will still end as soon as they have
performed the Chainsaw Attack Special Action-

- POGO (ACTIVE) ✅ DONE 2026-07-22 (PogoRule.onJumpDeclared zeroes negative Jump modifiers; jump-over-any-square in MovementManager.jumpPlayer; config pogo-ignores-penalty)
During their movement, a player with this Trait
can attempt to Pogo over a single adjacent
square regardless of what is in the square.
Pogoing works the same way as Jumping, as
described on page 56, with the exception that
the Pogoing player may ignore all negative
modifiers they would receive by Jumping.
9
A player with this Trait cannot also have the
Leap Skill.

- DIVING CATCH (ACTIVE)
This player may attempt to Catch the bail if
it lands in a square in their Tackle Zone as a
result of a Pass, Throw-in or Kick-off. They may
not use this Skill to attempt to Catch the ball
if it lands in a square in their Tackle Zone as a
result of a Bounce.
Additionally, this player may apply a +1 modifier
to their Agility Test when attempting to Catch
the ball as part of a Pass Action if they are in
the target square.

- HIT AND RUN (ACTIVE) ✅ DONE 2026-07-23 (BlockManager.resolveHitAndRun/freeMove/hitAndRunSquares were already coded; wired the trigger via endBlockActivation from the knockdown-in-place path + GameService.finishBlockActivation, registered HitAndRunRule; config hit-and-run-free-square. Push/follow-up covered via finishBlockActivation; Stab path is a further increment.)
When a player with this Skill performs a Block
Action or a Stab Special Action, after fully
resolving the Action, they may immediately
move one free square ignoring Tackle Zones, so
long as they are still Standing. The player must
ensure that after this free move they are not
Marked by or Marking any opposition players.
A player with this Skill cannot also have the
Frenzy Skill

- LEAP (ACTIVE) [probably we need to implement good jumping rules and ux foir jumping regular prone players] ✅ DONE 2026-07-22 (LeapRule.onJumpDeclared reduces neg modifier by 1 min -1; enables jumping over Standing players; configs leap-softens-penalty, leap-over-standing-player)
During their Move Action, a player with this Skill
can attempt to Leap over a single adjacent ~
square regardless of what is in the square.
Leaping works the same way as Jumping, as
described on page 56, with the exception that
the Leaping player may reduce the negative
modifiers they would receive by Leaping by 1, to
a minimum of -1.
oe eeA player with this Skill cannot also have the
Pogo Trait.

- SAFE PAIR OF HANDS (ACTIVE) ✅ DONE 2026-07-23 (BlockManager.dropCarrierBall: a knocked-down carrier with SPoH places the ball in an adjacent empty square instead of Bouncing; config safe-pair-of-hands-places-ball. Wired at the Block-knockdown drop; Dodge/Rush-fall + Stab drop paths are a further increment.)
If this player would be Knocked Down, Fall Over
or be Placed Prone whilst in possession of
the ball then, before they become Prone, they
may place the ball in any adjacent unoccupied
Square to the square they will become Prone in
instead of Bouncing the ball as normal.

- Bullseye (Active)
When this player performs a Throw Team-mate _Action, if the result of the throw is a Superb_Throw then the thrown player will not Scatterbefore landing and will instead landinthe
target square. 7
A player without the Throw Team-mate Trait a Ficannot have this Skill

- MULTIPLE BLOCK (ACTIVE)
When this player declares a Block Action, they
may perform two Block Actions each targeting
a different opposition player they are Marking.
if they do, then this player will reduce their
Strength Characteristic by 2 for the duration of
the Block Actions. These Block Actions happen
simultaneously, though you may wish to roll
them separately for clarity. This means that
both Block Actions are resolved in full, even if
one of them results in a Turnover. This player
cannot Follow-up during either of these
Block Actions.
A player with this Skill cannot also have the
Frenzy Skill.

- CLOUD BURSTER (ACTIVE)  ✅ DONE 2026-07-22 (CloudBursterRule: onPassDeclared sets ctx.suppressInterception; PassOperation skips the interception offer; catalog config `cloud-burster-no-intercept`. TODO interaction: Very Long Legs ignores this.)
When this player performs a Pass Action, Vas y opposition players may not attempt to Intercept
the ball.

- DUMP-OFF (ACTIVE) 
Whenever an opposition player attempts to
Vas : perform a Block Action against this player, or a
Special Action that targets this player directly, .
this player may use this Skill. When they do, this
player may immediately perform a Quick Pass
before the Action targeting them is resolved.
This Quick Pass cannot cause a Turnover,
but otherwise follows all the normal rules for
making a Quick Pass. Once the Quick Pass
has been resolved, this Action targeting this
player continues.

- GIVE AND Go (ACTIVE)
If this player performs a Pass Action that is
a Quick Pass, or performs a Hand-off Action,
then, so long as a Turnover isn’t caused, their
activation does not end once the Pass or Handoff is resolved. Instead, they may continue with
their Move Action using any movement they
have remaining.

- HAIL MARY PASS (ACTIVE)  ✅ DONE 2026-07-22 (HailMaryPassRule: onPassDeclared sets suppressInterception + downgradeAccurate; PassController.attemptPass gained forceInaccurate; configs `hail-mary-no-intercept`, `hail-mary-downgrades-accurate`. Gap: short Hail Mary not forced to Long-Bomb -3; Throw Bomb clause with Bombardier.)
When this player performs a Pass Action or a
Throw Bomb Special Action, they may declare
any square on the pitch as the target square
rather than using the Range Ruler. Make a
Passing Ability Test as normal treating the throw
as a Long Bomb, and treating any result of an
Accurate Pass as an Inaccurate Pass. A Hail
Mary Pass cannot be Intercepted.

- Leader 
a team that has one or more players with this skill on the pitch at the start of a half may gain
a single extra Team Re-roll - this is called a Be
Leader Re-roll. A team can only use a Leader __Re-roll if they have a player with the Leader Skil son the pitch, and if all players with this Skill are
removed from play, either as a Casualty or by ofbeing Sent-off, before the Leader Re-rollis used
then it is lost.
A Leader Re-roll follows all of the usual rules 4for standard Team Re-rolls, with the exception 4that it cannot be lost as a result of a Halfling
Master Chef.

-  ON THE BALL (ACTIVE)
When an opposition player performs a Pass
Action, after the target square has been
declared but before the Passing Ability Test is
rolled, this player may move up to 3 squares,
following all the usual rules for a Move Action,
with the exception that they cannot Rush.
Should this player Fall Over during this move,
then their move immediately ends and the Pass
Action resumes. If multiple players have this
Skill, then they may all use it during the same
Pass Action, though they must do so one ata
time, and if one of them Falls Over before the
others have had the chance to move, then they |may not do so. ‘ieAdditionally, during the Start of Drive Sequence,
after the Kick Deviates but before the Kick-off
Event is rolled, a single Open player on the
receiving team with this Skill may move up
to 3 squares, following all the usual rules for
@ Move Action, with the exception that they
cannot Rush. A player may not use this Skill if |a Touchback is caused and may not move into
the opposition half. Should this player Fall Over
during this move, then their move immediately
ends and the Kick-off Event is rolled.

- PUNT (ACTIVE)
This player may declare a Punt Special Action;_
only a single player may declare a Punt Special
Action each Turn. When a player declares
a Punt Special Action they are first allowed
to make a Move Action, though they cannot
continue to move after the Punt Special Action
 has been resolved.
if after their Move Action this player is in
 possession of the ball, they can Punt it
downfield. Position the Throw-in Template over this player so it faces one of the two End Zones
or either Sideline. Roll a D6 to determine the
direction the ball is kicked, and then a second
D6 to determine how many squares in that
direction the ball will travel. If this player has
the Kick Skill, they may re-roll either one or
both of these dice - though they must decide
whether to re-roll the direction or not before
rolling for the distance.
If the ball lands in a square containing a player,
then they must attempt to Catch the ball,
otherwise it will Bounce.
When performing a Punt Special Action,
no Turnover is caused if the ball comes to
rest on the ground; however, if after the
Punt Special Action is resolved the bail is in
possession of an opposition player, or in the
crowd, a Turnover is caused.


- VERY LONG LEGS (ACTIVE) ✅ DONE 2026-07-23 (VeryLongLegsRule.onJumpDeclared +1 to Jump; +2 Intercept & ignore-Cloud-Burster resolved inline in PassOperation.resolveInterception — CloudBursterRule now sets ctx.cloudBurster (soft, VLL-bypassable) vs Hail Mary's hard suppressInterception; configs very-long-legs-jump-bonus/lands-standing/intercept-bonus/ignores-cloud-burster.)
This player may apply a +1 modifier to the
Agility Test whenever they attempt to Leap or
Jump, and may apply a +2 modifier to the
Agility Test whenever they attempt to Intercept
the ball.
Additionally, this player ignores the Cloud
Burster Skill.

- DIRTY PLAYER (ACTIVE) ie ‘When this player performs a Foul Action, they ✅ DONE 2026-07-22 (inline in FoulOperation: +1 to Armour or Injury, prefers breaking armour then injury; config dirty-player-modifier)
may apply a +1 modifier to either the Armour
Roll or Injury Roll. This modifier may be applied
after the roll has been made.

- EYE GOUGE (ACTIVE) ✅ DONE 2026-07-22 (EyeGougeRule.onPush adds EYE_GOUGED condition to the pushed player; AssistValidator skips Eye-Gouged assisters; GameService clears it on activation; config eye-gouge-pushed-cannot-assist)
eS When an opposition player is Pushed Back by
this player, the opposition player cannot provide
Offensive or Defensive Assists until after they
are next activated.

- FUMBLEROOSKI (ACTIVE)
When this player performs a Move Action whilst
they are in possession of the ball, they may
choose to place the ball on the ground in any
square they move out of during their Move
Action. This will not cause a Turnover.

- LETHAL FLIGHT (ACTIVE)
When this player is thrown as part of a Throw
Team-mate Action, if they land in a square that
contains an opposition player, including if they
Bounce into a square containing an opposition
player, and the opposition player is Knocked
Down, then they may apply a +1 modifier
to either the Armour Roll or Injury Roll. This
modifier may be applied after the roll has been
made. If an opposition player suffers a Casualty
as a result of being Knocked Down by the
thrown player with this Skill, then this player will
count as having caused that Casualty and will
receive Star Player Points as appropriate.
A player without the Right Stuff Trait cannot
have this Skill.

- LONE FOULER (ACTIVE) _—_— ✅ DONE 2026-07-22 (inline in FoulOperation: re-roll failed Armour when no assists; config lone-fouler-reroll)
When this player performs a Foul Action, if
there are no players providing an Offensive oF
Defensive Assist, then this player may re-roll 4
failed Armour Roll.

- PILE DRIVER (ACTIVE) we When an opposition player is Knocked Down
by this player during a Block Action, this player
may perform a free Foul Action against the
opposition player so long as they are still
Standing and are still Marking the opposition
player. This player is then Placed Prone and
their activation immediately ends.

- PUT THE BOOT IN (ACTIVE) ✅ DONE 2026-07-22 (PutTheBootInRule: onCountAssists foul-only Guard mirror; config put-the-boot-in-marked-assist)
This player can provide Offensive Assists when
a team-mate performs a Foul Action regardless
of how many opposition players are Marking
this player.

- QUICK FOUL (ACTIVE)
This player's activation does not end after
performing a Foul Action, and they may
continue with their Move Action with any
movement they have remaining.

- SABOTEUR (ACTIVE)
When this player is Knocked Down as a result
of an opposition player's Block Action, before
the Armour Roll is made, they may roll a D6.
On a 1-3, nothing happens and the Armour
Roll is made as normal. On a 4+, this player’s
sabotaged weapon goes off and the opposition
player is also Knocked Down, though this will
not cause a Turnover unless the opposition
player was holding the ball. If this player's
sabotaged weapon goes off, then they are
automatically Knocked Out and the Armour Roll
is not made for them.
A player without the Secret Weapon Trait cannot
have this Skill.


- SNEAKY GIT (ACTIVE) ✅ DONE 2026-07-22 (inline in FoulOperation: unbroken natural-double Armour not sent off; config sneaky-git-unbroken-double)
This player is not Sent-off when performing
a Foul Action if a natural double is rolled for
the Armour Roll, so long as the target player's
Armour is not broken. If the target player's
Armour is broken, this player will still be sent off
as normal.

- VIOLENT INNOVATOR ACTIVE
If an opposition player suffers a Casualty as a
result of a Special Action this player performed,
this player will earn Star Player Points for
causing a Casualty as appropriate.
A player can only have this Skill if they have a
Trait that allows them to perform a Special Action.