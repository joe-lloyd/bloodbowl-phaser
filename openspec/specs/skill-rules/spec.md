# skill-rules

## Purpose

Enforce the 2025 rulebook's skills and traits through a central registry of one-per-file rules invoked at typed trigger points, composing with the reroll machinery, reacting-team decisions, and the flow queue — so every catalog skill's behaviour is implemented, observable, and verifiable in browser, CLI, and tests alike.

## Requirements

### Requirement: Skill rule registry with typed hook points
The system SHALL resolve a player's skills to rule objects via a central registry, invoking them at typed hook points in the roll paths (dodge, block dice count, block result application, pickup, catch, pass). A skill with no registered rule SHALL have no effect and SHALL NOT interrupt play. Rules SHALL live one-per-file; a `switch` over skill types is non-conforming.

#### Scenario: Inert skill does nothing
- **WHEN** a player has a catalog skill with no registered rule and takes any action
- **THEN** rolls and outcomes are identical to a player without that skill

#### Scenario: Adding a rule requires no manager changes
- **WHEN** a new skill rule is registered for an existing hook
- **THEN** its effect applies at that hook without modifications to managers or controllers

### Requirement: Reactive triggers gather rules from all participants

At each named trigger point the system SHALL gather registered rules from every player relevant to that moment — the acting player, the target, and adjacent opponents — not only the acting player. A rule SHALL be able to read and adjust the trigger context (participants, from/to squares, current result). Gathering order SHALL be deterministic so multi-skill interactions are reproducible.

#### Scenario: Opponent's skill affects the acting player's roll

- **WHEN** a player dodges away from an adjacent opponent who has a dodge-affecting skill (e.g. Tackle)
- **THEN** that opponent's rule modifies the dodging player's roll even though the opponent is not the acting player

#### Scenario: Inert reactive skill is transparent

- **WHEN** a reactive-category skill has no registered rule and its trigger point is reached
- **THEN** play proceeds exactly as if the skill were absent

### Requirement: Reactions surface as reacting-team decisions

A trigger that requires a coach's choice SHALL raise a pending decision whose chooser is the reacting player's team; the base action SHALL pause until it is answered and then resume. A declined reaction SHALL leave the base outcome unchanged and SHALL consume no dice.

#### Scenario: Reacting coach chooses whether to use a reactive skill

- **WHEN** a reactive skill's trigger condition is met (e.g. an opponent is pushed and the pushed player has Stand Firm)
- **THEN** only the reacting player's coach is offered the choice, and the base action resumes according to their answer

### Requirement: Flow-altering skills compose through the operation queue

A skill effect that adds or replaces steps (e.g. an extra block, a pre-action roll) SHALL enqueue an operation on the game flow queue rather than mutating the base rule inline, and SHALL emit a skill-trigger event. The base rule's own code SHALL remain unchanged.

#### Scenario: Skill adds a step without editing the base rule

- **WHEN** a flow-altering skill triggers during an action
- **THEN** the added step runs in order via the flow queue and a skill-trigger event is emitted, with the base rule unmodified

### Requirement: Coverage is reportable
The registry SHALL report which catalog skills have implemented rules and which are inert, so rulebook fidelity is measurable.

#### Scenario: Coverage query
- **WHEN** coverage is queried in a test
- **THEN** it lists implemented count, total catalog count, and the names of inert skills

### Requirement: Starter skills enforce 2025 rulebook behavior
The following SHALL be implemented per the Blood Bowl 2025 rulebook: **Block** (attacker not knocked down on Both Down), **Wrestle** (option to place both players prone without armour rolls on Both Down), **Dodge** (dodge reroll; interaction with Defender Stumbles), **Sure Hands** (pickup reroll), **Catch** (catch reroll), **Pass** (pass reroll), and one **reactive skill** — Stand Firm (the pushed player may refuse the push) or Diving Tackle (an adjacent opponent may drop prone to worsen a player dodging away) — exercising a reacting-team trigger decision.

#### Scenario: Block vs Both Down
- **WHEN** a Both Down result is applied and the attacker has Block but the defender does not
- **THEN** only the defender is knocked down and no turnover occurs for the attacker's team

#### Scenario: Dodge skill offers a reroll
- **WHEN** a player with Dodge fails a dodge roll and has not used the skill this action
- **THEN** a reroll decision is offered before the failure is applied

### Requirement: Skill effects are observable
Whenever a rule changes a roll, dice count, or result application, the system SHALL emit an event naming the player, skill, and effect, visible in browser logs and headless command responses.

#### Scenario: Skill trigger appears in headless events
- **WHEN** Block cancels an attacker knockdown during a headless block command
- **THEN** the command response events include the skill trigger with player and skill identified

### Requirement: Every catalog skill enforces 2025 rulebook behavior
Every skill and trait in the reconciled catalog SHALL have a registered rule enforcing the 2025 rulebook's text for it (verified against the book-derived data file at implementation time), invoked through the framework's trigger points, reroll machinery, decision channel, or flow-queue operations. On completion the registry's coverage report SHALL list zero inert catalog skills, and any deliberate exclusion SHALL be an explicit allowlist entry, not an omission.

#### Scenario: Coverage reaches the full catalog
- **WHEN** the coverage report runs after the final batch
- **THEN** implemented equals the catalog total and the inert list is empty (or contains only allowlisted exclusions)

#### Scenario: A batch cannot land unverified
- **WHEN** a batch registers rules without rule-scenario catalog configurations for them
- **THEN** the rule-test-coverage gate fails naming those skills

### Requirement: New trigger points arrive with their first consumer
Trigger points beyond the original six (injury roll, assist counting, activation declared, opponent movement, foul resolution, …) SHALL be added only in the batch that first consumes them, SHALL follow the established contract (deterministic all-participant gather, context mutation, decisions via the one channel, flow effects via the queue), and SHALL be exercised by at least two rules or a rule plus a seeded framework test when introduced.

#### Scenario: Opponent-movement trigger lands with its consumers
- **WHEN** the marking-reactions batch introduces the opponent-movement trigger
- **THEN** Shadowing-class and Tentacles-class rules consume it in the same batch, with catalog configurations proving a marked player's escape is affected

### Requirement: Book-noted skill interactions are covered explicitly
Where the rulebook text of one skill names another (Tackle vs Dodge, Juggernaut vs Wrestle/Stand Firm/Fend, Block vs Wrestle, …), the interaction SHALL have its own catalog configuration and outcome, owned by whichever skill lands second.

#### Scenario: Juggernaut cancels Stand Firm on a Blitz
- **WHEN** Juggernaut lands (after Stand Firm) and a Blitz block pushes a Stand Firm player
- **THEN** a catalog configuration verifies Stand Firm cannot be used against it, per the book

### Requirement: Parameterized families read their instance value
A rule for a parameterized family (Loner (X+), Mighty Blow (+X), …) SHALL read the concrete value from the skill instance so one registered rule serves all printed variants.

#### Scenario: Loner threshold honored per player
- **WHEN** players with Loner (3+) and Loner (5+) each attempt to use a team reroll
- **THEN** each rolls against their own threshold from the same registered rule

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

### Requirement: Activation rolls gate the declared action
The system SHALL provide a single activation-declared trigger that folds the activating player's rules after an action is declared and before it is performed. A rule at this trigger SHALL be able to roll dice and, per its book text, let the action proceed, downgrade the declared action, end the activation immediately, apply a player condition, or force a book-defined effect requiring a coach choice (via the standard decision channel). Failure effects SHALL flow through the existing activation/turnover paths, and a declared once-per-Turn action (e.g. Blitz) SHALL still count as used when the gate fails, where the book says so.

#### Scenario: Bone Head fails
- **WHEN** a Bone Head player declares an action and rolls a natural 1 on the gate
- **THEN** the player becomes Distracted per the book and the declared action does not execute

#### Scenario: Failed gate on the team's last activatable player
- **WHEN** the last player able to act fails an activation gate that ends their activation
- **THEN** the turn passes to the opponent normally, without a turnover being latched

### Requirement: Die-level rerolls compose with the reroll machinery
The reroll machinery SHALL support offering a die-level reroll source (Pro) alongside skill and team sources: eligible only during the player's own activation and never for Armour, Injury, or Casualty Rolls; gated by the book's usage roll; rerolling exactly one die of the original roll (the chooser selecting which die when several were rolled); and, once attempted, locking that roll against every other reroll source.

#### Scenario: Pro attempt locks out the team reroll
- **WHEN** a player with Pro attempts the Pro roll on a failed dodge and the usage roll fails
- **THEN** the dodge result stands and no team reroll may be offered for it

#### Scenario: One die of a multi-die roll
- **WHEN** Pro succeeds against a roll made with several dice
- **THEN** exactly one chosen die is rerolled and the rest keep their values

### Requirement: End-of-opponent-turn trigger
The system SHALL fire a trigger when a team's opponent's turn ends, before the next turn starts, folding rules of the non-active team (Pick-Me-Up class). Effects SHALL respect book limits such as a player stood up by the trait being unable to use the trait themselves that turn.

#### Scenario: Pick-Me-Up stands a Prone team-mate
- **WHEN** the opposition's turn ends with a Prone player within 3 squares of a Standing team-mate with Pick-Me-Up and the roll succeeds
- **THEN** the Prone player stands before the next turn begins

### Requirement: Keyword-parameterized rules match roster keywords
A rule whose instance parameter names a keyword (Animosity (X), Hatred (X)) SHALL match it against the target player's keywords through one shared helper, with `(all)` matching every team-mate, so keyword semantics stay uniform across rules.

#### Scenario: Animosity refuses a matching hand-off
- **WHEN** an Animosity (X) player attempts a hand-off to a team-mate bearing keyword X and rolls a 1
- **THEN** the action is refused and the player's activation ends, with no turnover
