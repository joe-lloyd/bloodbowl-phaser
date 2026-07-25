## 1. State Reconciliation Foundations

- [ ] 1.1 Add idempotent scene reconciliation helpers for ball ownership/location, player pitch/dugout location, and activation styling
- [ ] 1.2 Route full match restore through the same reconciliation helpers and remove touched-path duplicate sprite mutations
- [ ] 1.3 Add assertions or diagnostics that detect multiple ball representations or a player occupying both pitch and dugout

## 2. Ball and Injury Fixes

- [ ] 2.1 Update mid-route pickup resolution to commit carrier state at the pickup step before movement continues
- [ ] 2.2 Reconcile the ball visual and carrier marker after successful and failed mid-route pickups
- [ ] 2.3 Update Knocked Out injury resolution to remove pitch occupancy and add the player to the correct KO box atomically
- [ ] 2.4 Reconcile pitch and dugout presentation after KO, including subsequent pathing and target availability

## 3. Restore and Punt Fixes

- [ ] 3.1 Restore activated opacity and selection gating from current-turn activation state
- [ ] 3.2 Add a Punt declaration presentation event before kick/scatter resolution
- [ ] 3.3 Implement graphical Punt kick animation acknowledgement and headless auto-acknowledgement
- [ ] 3.4 Serialize or reconstruct any pending Punt presentation state without rerolling its outcome

## 4. Regression Scenarios

- [ ] 4.1 Add seeded headless scenarios for successful and failed mid-route pickups with remaining route steps
- [ ] 4.2 Add seeded KO scenarios asserting pitch occupancy, dugout location, pathing, and target selection
- [ ] 4.3 Add save/resume scenarios with both activated and available players
- [ ] 4.4 Add graphical and headless Punt scenarios asserting declaration order and final seeded ball state
- [ ] 4.5 Add stable fixed-viewport screenshot baselines for the selected ball, KO, restore, and Punt checkpoints
- [ ] 4.6 Run the affected unit, scenario, and Playwright suites in headless mode and document baseline update commands
