# skill-rules (delta)

## ADDED Requirements

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
