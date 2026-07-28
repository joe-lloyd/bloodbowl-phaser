## MODIFIED Requirements

### Requirement: Reactions surface as reacting-team decisions

A trigger that requires a coach's choice SHALL raise a pending decision whose chooser is the reacting player's team; the base action SHALL pause until it is answered and then resume. A declined reaction SHALL leave the base outcome unchanged and SHALL consume no dice.

Brawler's Both Down re-roll is an explicit exception: although declaring a Block Action is otherwise exactly the kind of trigger this requirement describes, Brawler does not raise a separate `reaction` decision. It resolves through the block-dice-rerolls capability instead — an availability flag on the `block-dice` decision that the coach may spend as a button/command, so the coach always sees the rolled dice before deciding whether to spend it. `BrawlerRule` itself registers no hook for this trigger; it is an inert marker registration (the same shape as `ProRule`) purely so the skill still reports as implemented for the coverage gate.

#### Scenario: Reacting coach chooses whether to use a reactive skill

- **WHEN** a reactive skill's trigger condition is met (e.g. an opponent is pushed and the pushed player has Stand Firm)
- **THEN** only the reacting player's coach is offered the choice, and the base action resumes according to their answer

#### Scenario: Brawler does not raise a reaction decision

- **WHEN** an attacker with Brawler rolls block dice and one reads Both Down
- **THEN** no `reaction` decision is raised for Brawler; the block-dice decision the coach already sees simply carries a Brawler re-roll option (per the block-dice-rerolls capability)
