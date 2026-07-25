## 1. Inducement State and Rule Profiles

- [ ] 1.1 Extend match and competition settings with an inducement rule profile, resolved budgets, and catalog restrictions
- [ ] 1.2 Add match-scoped inducement inventory entries with owner, quantity, remaining uses, price, and provenance
- [ ] 1.3 Add backwards-compatible serialization for confirmed inventory, pending decisions, and recorded random outcomes

## 2. Pregame Selection

- [ ] 2.1 Implement authoritative inducement budget calculation and purchase validation
- [ ] 2.2 Build Sevens offers with Extra Team Training priced at 150,000 and limited to eight
- [ ] 2.3 Exclude and reject Star Players in Sevens profiles
- [ ] 2.4 Add an accessible pre-match selection and confirmation flow for local and competition matches
- [ ] 2.5 Extend lobby and online setup synchronization so both coaches see the accepted budgets and inventories
- [ ] 2.6 Add equivalent headless offer, select, remove, and confirm commands

## 3. Prayers and Temporary Uses

- [ ] 3.1 Implement rerolling Prayers to Nuffle results 10-13 for non-Advanced-League Sevens
- [ ] 3.2 Preserve results 10-13 for Advanced League unless the competition profile restricts them
- [ ] 3.3 Record rejected and accepted Prayer rolls through the match RNG and operation log
- [ ] 3.4 Expire match-only and drive-only inducement uses at their correct lifecycle boundary

## 4. Sevens Apothecary

- [ ] 4.1 Create an owner-only, stable-id Apothecary decision after eligible KO and casualty results
- [ ] 4.2 Implement decline behavior without consuming the Apothecary
- [ ] 4.3 Implement on-pitch KO patch-up as remaining on the pitch Stunned
- [ ] 4.4 Implement crowd KO patch-up as placement in Reserves
- [ ] 4.5 Implement the D6 casualty patch-up with 4+ to Reserves and 1-3 retaining the original result
- [ ] 4.6 Enforce once-per-match consumption and idempotent decision resolution

## 5. Verification

- [ ] 5.1 Add unit tests for budgets, ETT boundaries, Star Player rejection, Prayer rerolls, and inventory expiry
- [ ] 5.2 Add seeded Apothecary tests for decline, on-pitch KO, crowd KO, each eligible casualty, success/failure, and already-used state
- [ ] 5.3 Add save/resume tests at pregame confirmation and during a pending Apothecary decision without duplicate rolls
- [ ] 5.4 Add host/guest ownership and reconnect scenarios for inducement and Apothecary decisions
- [ ] 5.5 Add headless Playwright end-to-end scenarios for pregame selection through post-injury final state
