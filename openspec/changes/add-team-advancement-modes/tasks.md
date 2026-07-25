## 1. Models and Migration

- [ ] 1.1 Add persisted `matched-play`, `advanced-league`, and `sevens-skill-selection` team advancement modes
- [ ] 1.2 Add skill provenance, source match, added-skill value, Draft history, and pending-development records
- [ ] 1.3 Migrate unambiguous existing SPP teams to Advanced League and require confirmation for ambiguous legacy drafts
- [ ] 1.4 Prevent mode changes after team finalization or competition entry

## 2. Competition Rule Profiles

- [ ] 2.1 Add versioned competition profiles with required advancement mode, draft budget, roster constraints, and Matched Play package
- [ ] 2.2 Snapshot the accepted profile when a competition is created and when a team enters
- [ ] 2.3 Implement one shared structured compatibility validator for UI and repository commands
- [ ] 2.4 Show all compatibility and pending-development refusal reasons before team selection

## 3. Matched Play and Advanced League

- [ ] 3.1 Add team-builder mode selection and event-profile selection before team finalization
- [ ] 3.2 Implement tier-based Matched Play skill allocation with Primary-for-Secondary substitution and one added skill per player
- [ ] 3.3 Gate standard SPP awards and spending to Advanced League teams
- [ ] 3.4 Move Advanced League advancement selection from the results screen into pending Manage Team work

## 4. Sevens Skill Selection

- [ ] 4.1 Build the eligible post-game participant set while excluding DEAD players
- [ ] 4.2 Implement coach-selected recipient plus two-roll random Primary choice
- [ ] 4.3 Implement random recipient plus two-roll random Secondary choice
- [ ] 4.4 Persist selected recipient, candidate rolls, confirmed skill, provenance, and standard value increase
- [ ] 4.5 Present unresolved Skill Selection work in Manage Team and block later fixtures only when the profile requires completion

## 5. The Draft

- [ ] 5.1 Remove DEAD players before Draft candidate generation
- [ ] 5.2 Roll one D6 for every player with added skills and compare it with their added-skill count
- [ ] 5.3 Retain players whose roll is higher than their added-skill count
- [ ] 5.4 Remove drafted players from the active roster while retaining career history
- [ ] 5.5 Credit treasury with exactly the drafted player's cumulative added-skill value increase and record the compensation

## 6. Verification

- [ ] 6.1 Add migration, immutability, package-allocation, SPP-gating, random-skill, value, and Draft unit tests
- [ ] 6.2 Add competition compatibility tests for mode, budget, roster, incomplete package, and pending development
- [ ] 6.3 Add seeded headless Playwright journeys for all three modes from team creation through competition entry and post-match management
- [ ] 6.4 Add save/resume and online synchronization tests for unresolved random-skill and Draft decisions
