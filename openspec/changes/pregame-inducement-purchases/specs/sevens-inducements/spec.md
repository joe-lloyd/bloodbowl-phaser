# Spec Delta

## ADDED Requirements

### Requirement: Coaches ready before buying inducements

New graphical matches SHALL wait for both teams to ready before allowing inducement purchases. Each coach SHALL then confirm a legal selection or explicitly confirm no purchases before the coin toss and initial setup proceed. Local hotseat, computer and online matches SHALL follow this order.

#### Scenario: One coach has not readied

- **WHEN** only one coach is ready
- **THEN** shopping and match setup remain unavailable

#### Scenario: Both coaches confirm

- **WHEN** both teams are ready and have confirmed their purchases
- **THEN** the purchases and existing draft inducements load once and any pregame choices resolve before setup

#### Scenario: No available budget

- **WHEN** a coach has no petty cash or uses Matched Play draft purchases
- **THEN** the screen explains the budget and permits confirmation without additional purchases

### Requirement: Pregame purchases belong to the owning coach

Online coaches SHALL ready, edit and confirm only their own team. Accepted changes SHALL be reflected on both screens. Confirmed purchases SHALL be locked and invalid or unaffordable selections SHALL produce visible errors without advancing the match.

#### Scenario: Guest edits a purchase

- **WHEN** the guest buys an affordable inducement for their team
- **THEN** their quantity and remaining budget update from accepted state

#### Scenario: Coach submits another team's readiness

- **WHEN** a coach sends a ready or purchase command for the other team
- **THEN** the host rejects it and the match does not advance

### Requirement: Incomplete pregame progress survives resume

Readiness, selections, resolved budgets and confirmation state SHALL survive local saves and online resynchronization. Resuming a completed pregame SHALL not reopen shopping or reroll its outcomes. Older in-progress saves without a purchase stage SHALL remain playable.

#### Scenario: Resume during shopping

- **WHEN** a coach resumes after one team's confirmation
- **THEN** that team's purchases remain locked and the other team can finish

#### Scenario: Resume after loading purchases

- **WHEN** a match resumes after both confirmations
- **THEN** the existing inventory and outcomes remain unchanged
