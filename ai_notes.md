
- [x] DONE (2026-07-15): can we make a scenario test for this with a seed that works — [blocked ball carrier dropping the ball is not a turnover for the blocking team]
      — New sandbox scenario "Block the Carrier → No Turnover (Seeded)" (seed 2, Human teams): team 2 blocks team 1's carrier, the single block die is a POW, carrier goes down, ball bounces loose, and team 2 keeps their turn. The CLI "turnover ownership" test now drives this exact scenario deterministically (no more seed sweeping).

- [x] DONE (2026-07-16): the follow up lands the player on the ball but there's no pickup roll made, if a player enters a square with the ball then they need to roll to pick up
      — `GameService.followUpPush` now attempts a pickup when following up onto a loose ball (failed pickup bounces + turnover, as usual). Locked by `__tests__/headless/followup-pickup.test.ts`.

- [ ] regression bug in local play, i can select a kicker during kick off a nd kick the ball but the other teams turn never starts make sure that the checks we added for online play do not block local play

- [ ] the extras part of the menu should be admin only can we iomeplment something like that for my account and also redirect that url if someone tries to go there to euither sound test or sandbox.

- [ ] we still need to dfully iomeplement sound effects.

- [ ] we still need to implement SPP and level up etc & leagues

- [ ] i think we need to amke more structure in the firestore, probably saved teams for a user under a new shared collection so that otyher people can read the team but only the user who owns it can write it, we need a section and page for building tornements and for building leagues and we need to make both of these game types avilable in the local and hosted play

- [ ] This is three OpenSpec changes, not one:
      1. add-rule-scenario-catalog — the infrastructure: skills on placements, the catalog format, the leveled sandbox selector, the outcome-driven seed finder, the generated test suite + coverage gate, the CLI flag. Seeded with the 8 existing skills.
      2. reconcile-skill-catalog — fix the catalog against the 2025 book (names, categories, skill-vs-trait), locked by a test comparing against the book's skill tables.
      3. Batch changes for the 118 — in effort order: reroll one-liners → roll modifiers → reactions → new subsystems, each batch rulebook-verified and landing with its catalog configs (which the coverage gate then enforces).

- [ ] Pitch and dugout redesign, they are very boring blocks that should be changed to be more interesting as a pitch, maybe theres a few different pitches the host can pickfrom 

- [ ] need a visual representative of the assistant coaches, cheerleaders etc

- [ ] need to add more action camera and options, a player should be able to zoom in a bit more to the pitch and see whats going on or have an action tracker that follows moving players and the ball a bit, whoever is activating, we kind of do this for the ball but its not great the ball is too fast and not fully tracked so we should also enhance that and have an option to turn it all off as well so a player can decide how much they want the camera to szoom in and follow the action or just stay back so they can see everything 

- [ ] we need a kinda after the match statistics page for the players so lets garb some additonal data as well, since we need some of it to calculate spp anyway we should make sure we track it all 