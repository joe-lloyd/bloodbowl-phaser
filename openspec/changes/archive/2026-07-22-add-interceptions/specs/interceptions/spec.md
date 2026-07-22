## ADDED Requirements

### Requirement: Interception eligibility by Range Ruler

After the Pass Action's accuracy roll has determined the square the ball is destined to land in, the system SHALL identify eligible interceptors by placing the Range Ruler from the centre of the passer's square to the centre of the ball's actual landing square. An opposition player SHALL be eligible to attempt an interception only if ALL of the following hold: the Range Ruler overlaps the square they occupy, they are Standing (status Active), and they still have their Tackle Zone. The landing square used for this test MUST be the actual landing square (which may differ from the original target square after scatter), not the declared target.

#### Scenario: Standing opponent under the ruler is eligible
- **WHEN** a pass is thrown and its landing square is resolved, and a Standing opposition player who has their Tackle Zone occupies a square the passer→landing Range Ruler overlaps
- **THEN** that player is offered to their coach as an eligible interceptor

#### Scenario: Prone or Stunned opponent cannot intercept
- **WHEN** an opposition player under the Range Ruler is Prone or Stunned
- **THEN** that player is not eligible to attempt an interception

#### Scenario: Opponent that has lost its Tackle Zone cannot intercept
- **WHEN** an opposition player under the Range Ruler has lost their Tackle Zone (e.g. via a negatrait or skill)
- **THEN** that player is not eligible to attempt an interception

#### Scenario: Interception is tested against the scattered landing square
- **WHEN** an inaccurate pass scatters so the ball's landing square differs from the declared target
- **THEN** eligibility is computed from the passer to the actual landing square, not the original target square

#### Scenario: No eligible interceptors
- **WHEN** no Standing, Tackle-Zone-having opponent lies under the passer→landing Range Ruler
- **THEN** no interception is offered and the pass continues to resolve at its landing square

### Requirement: Interceptor selection by the defending coach

When one or more players are eligible to intercept a pass, the system SHALL offer the defending coach a decision to choose at most one of those players to attempt the interception, or to decline. This decision SHALL flow through the same mid-action decision channel used for rerolls and reactions so it behaves identically in local, online (host/guest), and headless play. The chooser SHALL be the defending (non-active) team's coach.

#### Scenario: Coach chooses an interceptor
- **WHEN** multiple opposition players are eligible to intercept
- **THEN** the defending coach is prompted to pick one of them (or decline), and only the chosen player makes the attempt

#### Scenario: Coach declines the interception
- **WHEN** the defending coach declines to attempt an interception
- **THEN** no interception roll is made and the pass continues to resolve at its landing square

#### Scenario: Decision is routed to the defending team
- **WHEN** the interception decision is raised
- **THEN** the chooser is the team that does NOT own the passer

### Requirement: Interception Agility Test and modifiers

The chosen interceptor SHALL make an Agility Test against their AG. The test SHALL apply a modifier of -3 when intercepting an Accurate pass and -2 when intercepting an Inaccurate pass, plus an additional -1 for each opposition player currently Marking the interceptor. The interception SHALL succeed if the Agility Test passes OR the natural (unmodified) die roll is a 6; it SHALL fail otherwise. A natural 1 SHALL always fail.

#### Scenario: Accurate pass modifier
- **WHEN** a player attempts to intercept an Accurate pass with no opponents marking them
- **THEN** the Agility Test applies a -3 modifier

#### Scenario: Inaccurate pass modifier
- **WHEN** a player attempts to intercept an Inaccurate pass with no opponents marking them
- **THEN** the Agility Test applies a -2 modifier

#### Scenario: Marking opponents stack the penalty
- **WHEN** a player attempts to intercept an Accurate pass while marked by two opposition players
- **THEN** the Agility Test applies -3 for the accurate pass plus -1 per marking opponent, for a total of -5

#### Scenario: Natural 6 always intercepts
- **WHEN** the interceptor rolls a natural 6
- **THEN** the interception succeeds regardless of the modified total

#### Scenario: Failed test lets the pass continue
- **WHEN** the interception Agility Test fails and the roll is not a natural 6
- **THEN** the pass continues to resolve as if no interception had been attempted

### Requirement: Interception outcome and turnover

When an interception succeeds, the intercepting player SHALL immediately gain possession of the ball in their own square, the pass resolution (catch/scatter/bounce at the landing square) SHALL be cancelled, and a Turnover SHALL be caused, ending the active team's turn. When the interception fails, ball resolution at the landing square SHALL proceed unchanged.

#### Scenario: Successful interception grants possession and turnover
- **WHEN** an interception succeeds
- **THEN** the ball is placed with the interceptor, no catch/bounce occurs at the original landing square, and a Turnover is triggered against the passing team

#### Scenario: Failed interception preserves normal resolution
- **WHEN** an interception fails
- **THEN** the ball continues to its landing square and is caught or bounces exactly as it would with no interception

### Requirement: Pass-setup interception preview

While a coach is setting up a Pass Action, the system SHALL preview which squares an opposition player could intercept from for the currently hovered target, by highlighting the eligible interceptor squares under the passer→target Range Ruler. To keep the preview consistent with the resolved geometry, the pass aim SHALL lock to square centres so the previewed Range Ruler and the ruler used at resolution are computed identically.

#### Scenario: Highlight interception threats on hover
- **WHEN** the coach hovers a candidate target square during pass setup
- **THEN** the squares of Standing, Tackle-Zone-having opponents under the passer→target Range Ruler are highlighted as interception threats

#### Scenario: Aim locks to square centres
- **WHEN** the coach moves the pass aim over the pitch
- **THEN** the pass line/arrow snaps to the centre of the hovered square, and the highlighted interception squares match those that would be eligible if the ball landed on that square

#### Scenario: No threats highlighted when none exist
- **WHEN** the hovered target's Range Ruler overlaps no eligible opponent
- **THEN** no interception-threat highlight is shown
