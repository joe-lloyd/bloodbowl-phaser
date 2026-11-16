## ADDED Requirements

### Requirement: Legal skill action candidates

The simulation seam SHALL offer declarations and steps for Secure the Ball, Hypnotic Gaze and Multiple Block only when their engine conditions hold.

#### Scenario: Complete a skill action

- **WHEN** a legal player declares one of the supported actions
- **THEN** enumeration supplies accepted steps until completion, without inventing a target or leaving the activation stranded

### Requirement: Contextual Secure the Ball plans

The planner SHALL compare ordinary pickup and Secure the Ball using their actual roll types, modifiers, reroll access and continuation value.

#### Scenario: Safer collection

- **WHEN** securing improves possession without sacrificing an immediate scoring opportunity
- **THEN** the planner can declare securing and finish on the loose ball

#### Scenario: Ordinary pickup remains useful

- **WHEN** normal pickup and continued movement provide a better scoring line, or securing is illegal
- **THEN** the planner retains the ordinary plan

### Requirement: Useful Hypnotic Gaze targets

The planner SHALL propose Gaze to remove a relevant opponent tackle zone, price reaching its target and consider feeding support at the endpoint.

#### Scenario: Open a teammate's play

- **WHEN** Gaze improves a still-available teammate's scoring or carrier-hit line
- **THEN** the planner can select that target before the dependent play

#### Scenario: Irrelevant or harmful gaze

- **WHEN** Gaze cannot improve the position or would sacrifice a better possession or scoring plan
- **THEN** it does not displace the better plan

### Requirement: Multiple Block tradeoffs

The planner SHALL compare both reduced-Strength blocks with ordinary blocking, including simultaneous assists and combined turnover risk.

#### Scenario: Useful double hit

- **WHEN** both targets produce sufficient expected benefit after reduced Strength and risk
- **THEN** the planner can declare Multiple Block and select the pair

#### Scenario: Dangerous double hit

- **WHEN** reduced Strength makes the pair worse than a useful single block
- **THEN** the ordinary block remains preferred

### Requirement: Vampire feeding safeguards

The planner SHALL use actual Thrall Lineman support and possession when valuing failed-Bloodlust endpoints and choosing a bite target.

#### Scenario: Preserve possession

- **WHEN** a Vampire has failed Bloodlust and can finish beside a non-carrier Thrall
- **THEN** its plan prefers a useful supported endpoint and avoids biting the ball carrier when another target exists

### Requirement: Reproducible confirmation

The implementation SHALL include tactical counterexamples and a fresh mirrored Daily Driver comparison against the frozen planner, preserving the existing bash objectives.

#### Scenario: Evidence publication

- **WHEN** the candidate run completes
- **THEN** HTML and CSV results distinguish natural action usage, tactical tests, paired performance, roster results and replay or engine failures
