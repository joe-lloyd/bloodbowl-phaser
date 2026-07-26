## 1. Shared Declaration Model

- [x] 1.1 Add a typed block-replacement identifier for Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit
- [x] 1.2 Extend activation and command payloads to retain an optional declared replacement through movement and resolution
- [x] 1.3 Add authoritative validation for skill ownership, target eligibility, team Blitz availability, and command ownership

## 2. Legal Actions and Action Economy

- [x] 2.1 Extend action availability to offer direct Special Actions only when each skill has a legal current target
- [x] 2.2 Offer a labelled `Blitz (with <attack>)` variant for every eligible replacement while the team Blitz is available
- [x] 2.3 Reserve and spend the Blitz and player activation at the existing commitment boundaries
- [x] 2.4 Prevent a normal Block or second replacement after the declared attack resolves
- [x] 2.5 Cover cancellation before and after activation commitment without incorrectly refunding the Blitz

## 3. Skill Integration

- [x] 3.1 Route direct and Blitz Stab declarations to the existing Stab resolver
- [x] 3.2 Route direct and Blitz Chainsaw declarations to the existing Chainsaw resolver
- [x] 3.3 Route direct and Blitz Breathe Fire declarations to its skill-specific eligibility and resolver
- [x] 3.4 Route direct and Blitz Monstrous Mouth declarations to its skill-specific eligibility and resolver
- [x] 3.5 Route direct and Blitz Projectile Vomit declarations to its skill-specific eligibility and resolver

## 4. Browser, Headless, and Online Interaction

- [x] 4.1 Add direct and labelled Blitz choices to the graphical action menu and target-selection flow
- [x] 4.2 Extend headless legal-action discovery and commands with the selected replacement
- [x] 4.3 Synchronize accepted declarations, movement, targets, rolls, and completion through the online protocol
- [x] 4.4 Reject non-owner, stale, unreachable-target, and already-spent-Blitz commands without partial mutation

## 5. Roster-Authentic Verification

- [x] 5.1 Add scenario fixture metadata that documents roster-default or legal advancement provenance for every tested skill holder
- [x] 5.2 Add seeded direct-action and move-then-attack scenarios for all five replacements
- [x] 5.3 Add negative scenarios for no legal target, spent Blitz, normal Block after replacement, and forged online ownership
- [x] 5.4 Run unit and headless Playwright scenario coverage and add stable screenshots for the action labels and target state
