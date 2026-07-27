## 1. State Reconciliation Foundations

- [x] 1.1 Add idempotent scene reconciliation helpers for ball ownership/location, player pitch/dugout location, and activation styling
- [x] 1.2 Route full match restore through the same reconciliation helpers and remove touched-path duplicate sprite mutations
- [x] 1.3 Add assertions or diagnostics that detect multiple ball representations or a player occupying both pitch and dugout

## 2. Ball and Injury Fixes

- [x] 2.1 Update mid-route pickup resolution to commit carrier state at the pickup step before movement continues
- [x] 2.2 Reconcile the ball visual and carrier marker after successful and failed mid-route pickups
- [x] 2.3 Update Knocked Out injury resolution to remove pitch occupancy and add the player to the correct KO box atomically
- [x] 2.4 Reconcile pitch and dugout presentation after KO, including subsequent pathing and target availability

## 3. Restore and Punt Fixes

- [x] 3.1 Restore activated opacity and selection gating from current-turn activation state
- [x] 3.2 Add a Punt declaration presentation event before kick/scatter resolution
- [x] 3.3 Implement graphical Punt kick animation acknowledgement and headless auto-acknowledgement
- [x] 3.4 Serialize or reconstruct any pending Punt presentation state without rerolling its outcome

## 4. Regression Scenarios

- [x] 4.1 Add seeded headless scenarios for successful and failed mid-route pickups with remaining route steps
- [x] 4.2 Add seeded KO scenarios asserting pitch occupancy, dugout location, pathing, and target selection
- [x] 4.3 Add save/resume scenarios with both activated and available players
- [x] 4.4 Add graphical and headless Punt scenarios asserting declaration order and final seeded ball state
- [x] 4.5 Add stable fixed-viewport screenshot baselines for the selected ball, KO, restore, and Punt checkpoints
- [ ] 4.6 Run the affected unit, scenario, and Playwright suites in headless mode and document baseline update commands
      (unit + scenario suites run headless and pass, and baseline update commands are documented in
      docs/technical/testing-guide.md — but this repo has no Playwright dependency, config, or specs, so the
      Playwright half of this task could not be run)
