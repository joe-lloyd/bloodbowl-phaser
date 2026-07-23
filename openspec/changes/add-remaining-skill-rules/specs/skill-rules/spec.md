# skill-rules (delta)

## ADDED Requirements

### Requirement: The catalog reaches full coverage
Every remaining inert catalog skill (the 30 unimplemented families) SHALL be given a registered rule enforcing its 2025 rulebook text, verified against `docs/rulebook/skills.json` at implementation time. On completion `SkillRegistry.coverage()` SHALL report 107 implemented families with an empty inert list, and the only unregistered catalog entry SHALL be the explicitly allowlisted Insignificant (draft-list construction only). The `gate.test.ts` implemented-set snapshot SHALL be updated in the same batch as each rule so it always names exactly the registered set.

#### Scenario: No inert catalog skill remains
- **WHEN** the coverage report runs after the final batch
- **THEN** `implemented` equals 107, `missing` is empty, and only `INSIGNIFICANT` is on the deliberate-inert allowlist

#### Scenario: A rule cannot land unverified
- **WHEN** a batch registers a rule without a rule-scenario catalog configuration for it
- **THEN** the `rule-test-coverage` gate fails naming that skill

### Requirement: Foul-path triggers resolve the Devious fouling skills
`FoulOperation` SHALL fold skill triggers so the fouling skills adjust foul resolution without the operation knowing skills: a post-roll +1 to either the Armour or Injury roll (Dirty Player), a failed-Armour reroll when the fouler has no assists (Lone Fouler), suppression of the send-off on a natural-double Armour roll that does not break armour (Sneaky Git), offensive-assist eligibility regardless of markers (Put the Boot In), an eye-gouged opponent that cannot assist until next activated (Eye Gouge), and Star Player Points attribution for casualties caused by a Special Action (Violent Innovator). Quick Foul SHALL leave the fouler's activation open to continue moving, and Pile Driver SHALL grant a free Foul after a Block knockdown before placing the fouler Prone and ending the activation.

#### Scenario: Dirty Player adjusts a foul roll after seeing it
- **WHEN** a Dirty Player fouls and the Armour roll falls one under the target
- **THEN** the +1 may be applied post-roll to break the armour, announced as a skill trigger

#### Scenario: Sneaky Git avoids the send-off on an unbroken double
- **WHEN** a Sneaky Git fouls, rolls a natural double on the Armour roll, and the armour is not broken
- **THEN** the fouler is not Sent-off; a double that breaks the armour still Sends them off

#### Scenario: Quick Foul keeps the activation open
- **WHEN** a player with Quick Foul performs a Foul Action with movement remaining
- **THEN** their activation does not end and they may continue their Move

### Requirement: Secret Weapon and Saboteur resolve around end-of-Drive send-off
A player with Secret Weapon SHALL be Sent-off for a Foul at the end of any Drive in which they took part, even if not on the pitch at the end of the Drive. Saboteur (which requires Secret Weapon) SHALL let a player Knocked Down by an opposition Block roll a D6 before the Armour roll: on a 4+ the opposition player is also Knocked Down (a Turnover only if they held the ball) and the Saboteur is automatically Knocked Out with no Armour roll.

#### Scenario: Secret Weapon is sent off when the Drive ends
- **WHEN** a Drive ends and a Secret Weapon player took part in it
- **THEN** that player is Sent-off for a Foul

#### Scenario: Saboteur's weapon goes off
- **WHEN** a Saboteur is Knocked Down by an opposition Block and rolls 4+ on the sabotage die
- **THEN** the blocking player is also Knocked Down and the Saboteur is Knocked Out with no Armour roll

### Requirement: Jump and Leap movement lets a player cross an adjacent square
The engine SHALL support jumping over a single adjacent occupied or empty square during movement, resolved as an Agility Test with the standard jump modifiers. Leap SHALL reduce the negative jump modifiers by 1 to a minimum of -1; Pogo SHALL ignore all negative jump modifiers; Very Long Legs SHALL add +1 to the Agility Test when jumping or leaping (and +2 when Intercepting, and SHALL ignore Cloud Burster). A player with Leap SHALL NOT also have Pogo.

#### Scenario: Leap softens the jump penalty
- **WHEN** a player with Leap jumps a square that would carry a -3 modifier
- **THEN** the modifier is reduced to -1 (minimum) for the Agility Test

#### Scenario: Pogo ignores negative jump modifiers
- **WHEN** a player with Pogo jumps an adjacent square
- **THEN** no negative jump modifier is applied to the Agility Test

### Requirement: Pass-reaction and interception-suppression skills resolve around a Pass
When an opposition player declares a Pass, On the Ball SHALL let a reacting player move up to 3 squares (no Rush) after the target square is declared but before the Passing Ability Test, ending the move if they Fall Over; Dump-Off SHALL let a player targeted by a Block or a directly-targeting Special Action make an immediate Quick Pass (no Turnover) before the targeting action resolves. Cloud Burster SHALL prevent opponents from Intercepting that player's Pass, and Hail Mary Pass SHALL let a player target any square on the pitch as a Long Bomb, treating an Accurate result as Inaccurate and forbidding Interception. Give and Go SHALL keep the activation open to continue moving after a Quick Pass or Hand-off that causes no Turnover.

#### Scenario: Dump-Off throws before the block lands
- **WHEN** an opponent declares a Block against a player with Dump-Off who can make a Quick Pass
- **THEN** the Quick Pass resolves first (never a Turnover) and then the Block continues

#### Scenario: Cloud Burster denies interception
- **WHEN** a player with Cloud Burster makes a Pass under an opponent's Tackle Zone
- **THEN** no Interception attempt is offered

#### Scenario: Give and Go keeps moving after a hand-off
- **WHEN** a player with Give and Go performs a Hand-off that causes no Turnover
- **THEN** their activation continues with any remaining movement

### Requirement: Special-action weapons resolve as flow-queue operations
Chainsaw Attack, Throw Bomb (Bombardier), Ball & Chain forced movement, and Punt SHALL each be modelled as a `GameOperation` composed on the flow queue, declarable through the action protocol, following their rulebook text: Chainsaw rolls a Kick-back die (1 = self Knock Down, else a +3 Armour roll on an adjacent Standing opponent) and always applies +3 to Armour rolls made against the chainsaw-wielder; Throw Bomb throws via the Pass rules and explodes on rest, hitting the square and adjacent players on a 4+; Ball & Chain moves the player via the Throw-in Template with auto-passed dodges and forced Blocks; Punt kicks a carried ball downfield via the Throw-in Template. Bullseye (Superb Throw lands without scatter) and Lethal Flight (thrown player Knocks Down an opponent → +1 Armour/Injury and SPP) SHALL extend the existing Throw Team-mate / Right Stuff subsystem.

#### Scenario: Chainsaw kicks back on a 1
- **WHEN** a player performs a Chainsaw Attack and rolls a 1 on the Kick-back die
- **THEN** the chainsaw-wielder is Knocked Down instead of making the +3 Armour roll

#### Scenario: A thrown bomb explodes on the square it comes to rest in
- **WHEN** a Bombardier's thrown bomb lands and is not caught
- **THEN** it explodes, Knocking Down any Standing player in the square and hitting each adjacent player on a 4+

### Requirement: Leader grants a start-of-half team reroll
A team with at least one on-pitch player with Leader at the start of a half SHALL gain a single extra Leader Re-roll, usable like a Team Re-roll but lost if every Leader player is removed from play before it is used.

#### Scenario: Leader adds a reroll at the start of a half
- **WHEN** a half begins with a Leader player on the pitch
- **THEN** the team has one extra Leader Re-roll available

### Requirement: Remaining agility, strength, and mutation skills resolve on their existing rolls
Diving Catch SHALL let a player attempt to Catch a ball landing in their Tackle Zone from a Pass/Throw-in/Kick-off (not a Bounce) and add +1 when they are the Pass target; Safe Pair of Hands SHALL let a knocked-down/prone-placed carrier place the ball in an adjacent empty square instead of Bouncing it; Hit and Run SHALL grant a free 1-square move ignoring Tackle Zones after a Block or Stab if still Standing and ending neither Marking nor Marked; Multiple Block SHALL let a player throw two Blocks at two Marked opponents at -2 Strength with no follow-up; Fumblerooski SHALL let a moving carrier drop the ball in a vacated square with no Turnover.

#### Scenario: Safe Pair of Hands keeps the ball placed, not bounced
- **WHEN** a carrier with Safe Pair of Hands is Knocked Down
- **THEN** the ball is placed in a chosen adjacent empty square rather than Bouncing

#### Scenario: Multiple Block throws two blocks at -2 Strength
- **WHEN** a player with Multiple Block declares against two Marked opponents
- **THEN** both Blocks resolve at -2 Strength with no follow-up, even if one causes a Turnover
