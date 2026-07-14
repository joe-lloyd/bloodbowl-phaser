# Tasks: add-push-chain-rules

## 1. Rulebook verification

- [ ] 1.1 Confirm throw-in direction/distance dice (p.73) and any 2025 edition wording changes for Chain Pushes (p.55) and Injury by the Crowd (p.68) against the in-repo PDF; record in design.md

## 2. Push option tiers (single-push parity)

- [ ] 2.1 Extend `BlockResolutionService.getValidPushDirections` to return `{unoccupied[], occupied[], crowd}` tiers; decision options present exactly the legal tier (crowd exit encoded as the off-pitch coordinate)
- [ ] 2.2 Keep single-push behavior identical when an unoccupied square exists; all existing tests green

## 3. Chain push resolver

- [ ] 3.1 Create `PushResolver`: recursive chain building with deferred application (innermost first), every direction decision attributed to the blocking team; prone/stunned players chainable
- [ ] 3.2 Wire `BlockManager.resolveBlock`/`executePush` through the resolver; one `PlayerMoved` per link in chain order; follow-up decision stays last
- [ ] 3.3 Headless: verify repeated `push-direction` decisions gate correctly (bot answers option 0); seeded two-link chain test asserting final positions

## 4. Crowd surf + throw-in

- [ ] 4.1 `CrowdInjuryOperation`: injury roll without armour, Stunned→Reserves, KO/Casualty normal; `PlayerPushedIntoCrowd` event; turnover via existing latch when the surfed player is active-team
- [ ] 4.2 `BallManager.throwIn(fromSquare)`: template direction + verified distance dice, landing resolves via bounce/catch chain; `BallThrownIn` event
- [ ] 4.3 Seeded tests: sideline surf (injury outcomes incl. Stunned→Reserves), carrier surf (throw-in then single turnover), chain-into-crowd combination

## 5. UI & wrap-up

- [ ] 5.1 Push-direction dialog handles repeated links + crowd option labeling; crowd surf notification in the log
- [ ] 5.2 Full suite + lint green; manual browser pass: chain shove a cage, surf a sideline player, surf the carrier
- [ ] 5.3 Update ai_notes.md item; prepare change for archive
