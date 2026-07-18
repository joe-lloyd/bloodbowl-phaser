
- [x] DONE (2026-07-15): can we make a scenario test for this with a seed that works — [blocked ball carrier dropping the ball is not a turnover for the blocking team]
      — New sandbox scenario "Block the Carrier → No Turnover (Seeded)" (seed 2, Human teams): team 2 blocks team 1's carrier, the single block die is a POW, carrier goes down, ball bounces loose, and team 2 keeps their turn. The CLI "turnover ownership" test now drives this exact scenario deterministically (no more seed sweeping).

- [x] DONE (2026-07-16): the follow up lands the player on the ball but there's no pickup roll made, if a player enters a square with the ball then they need to roll to pick up
      — `GameService.followUpPush` now attempts a pickup when following up onto a loose ball (failed pickup bounces + turnover, as usual). Locked by `__tests__/headless/followup-pickup.test.ts`.

- [ ] regression bug in local play, i can select a kicker during kick off a nd kick the ball but the other teams turn never starts make sure that the checks we added for online play do not block local play
      — INVESTIGATED (2026-07-18), could not reproduce: the full local flow (coin flip → both setups → select kicker → kick → receiving team's turn starts) passes end-to-end through the real SceneOrchestrator + phase handlers, for both a normal kick and a touchback kick — and it also still passes when the same test is run against the exact commit this note was written at (51f7f85). Every online gate (`getActiveOnlineMatch()?.mayAct()`, OwnershipGate, UI intent filter) was audited and is inert when there's no active online match. The flow is now locked by `__tests__/integration/local-kickoff-flow.test.ts`. If it recurs, please note: fresh page load or right after visiting an online match? first drive or after a touchdown? which kickoff event was rolled (Blitz/Quick Snap/etc. can change turn flow)? any console errors?

- [x] DONE (2026-07-18): the extras part of the menu should be admin only can we iomeplment something like that for my account and also redirect that url if someone tries to go there to euither sound test or sandbox.
      — Extras (Sandbox + Sound Test) is now admin-only: the menu section only renders for allowlisted accounts, and `/sand-box` + `/music` are wrapped in an `AdminRoute` that redirects everyone else to the main menu (it waits for the initial auth state first, so a restoring session isn't bounced). Admins default to the project owner's email; override with `VITE_ADMIN_EMAILS` (comma-separated). Without Firebase configured (pure local dev) everything stays open. New: `src/firebase/admin.ts`, `AdminRoute` in `src/ui/App.tsx`, `isAuthResolved()`/`ready` in the auth layer.

- [ ] we still need to fully imeplement sound effects.
      — Already specced: `openspec/changes/add-sound-effects-suite/` (proposal + design + tasks + spec). Not yet implemented — run `opsx:apply add-sound-effects-suite`.

- [ ] we still need to implement SPP and level up etc & leagues
      — SPECCED (2026-07-18): SPP + level-ups + post-match stat tracking → `openspec/changes/add-spp-progression-stats/`. (Leagues are the separate change below.)

- [ ] i think we need to amke more structure in the firestore, probably saved teams for a user under a new shared collection so that otyher people can read the team but only the user who owns it can write it, we need a section and page for building tornements and for building leagues and we need to make both of these game types avilable in the local and hosted play
      — SPECCED (2026-07-18): `openspec/changes/add-leagues-and-tournaments/` — shared team collection (owner-write / public-read Firestore rules), league + tournament builder pages, and both formats playable locally and hosted.

- [x] DONE (2026-07-17/18): This is three OpenSpec changes, not one:
      1. add-rule-scenario-catalog — the infrastructure: skills on placements, the catalog format, the leveled sandbox selector, the outcome-driven seed finder, the generated test suite + coverage gate, the CLI flag. Seeded with the 8 existing skills.
      2. reconcile-skill-catalog — fix the catalog against the 2025 book (names, categories, skill-vs-trait), locked by a test comparing against the book's skill tables.
      3. Batch changes for the 118 — in effort order: reroll one-liners → roll modifiers → reactions → new subsystems, each batch rulebook-verified and landing with its catalog configs (which the coverage gate then enforces).
      — All three exist under `openspec/changes/`: `add-rule-scenario-catalog`, `reconcile-skill-catalog`, and `implement-all-skill-rules` (the batches), each with proposal/design/tasks/specs.

- [ ] Pitch and dugout redesign, they are very boring blocks that should be changed to be more interesting as a pitch, maybe theres a few different pitches the host can pickfrom
      — SPECCED (2026-07-18): `openspec/changes/add-pitch-dugout-visual-overhaul/` — selectable pitch themes the host picks from, a redesigned dugout, and the sideline-staff visuals from the note below.

- [ ] need a visual representative of the assistant coaches, cheerleaders etc
      — SPECCED (2026-07-18): folded into `openspec/changes/add-pitch-dugout-visual-overhaul/` (sideline staff shown in the redesigned dugouts).

- [ ] need to add more action camera and options, a player should be able to zoom in a bit more to the pitch and see whats going on or have an action tracker that follows moving players and the ball a bit, whoever is activating, we kind of do this for the ball but its not great the ball is too fast and not fully tracked so we should also enhance that and have an option to turn it all off as well so a player can decide how much they want the camera to szoom in and follow the action or just stay back so they can see everything
      — SPECCED (2026-07-18): `openspec/changes/add-action-camera-options/` — zoom control, action tracking of the activating player, a tuned/smoothed ball follow, and a full "camera stays back" off switch, all player-configurable.

- [ ] we need a kinda after the match statistics page for the players so lets garb some additonal data as well, since we need some of it to calculate spp anyway we should make sure we track it all
      — SPECCED (2026-07-18): folded into `openspec/changes/add-spp-progression-stats/` (the tracked per-player stats feed both SPP and the post-match summary page).

- [x] DONE (2026-07-18): in sandbox mode refeershing no longer keeps the settings i selected when io load, thats because the settings are now more complex, before we just had a query param and that was it, refresh worked to reload the secnario, i would like the new setup to be as simple but i think query params are going to be too much to load into the selects because it will be a bunch and be random, if theres another more elegant way to preload the form on refresh find it.
      — Fixed in commit 3d2b8c4: only scenario id + effective seed + outcome id go in the URL (via replaceState, no history spam); the topic/rule selects are rebuilt from the config id through the rule catalog on mount, and the scene replays scenario+seed+outcome on refresh, reproducing the exact board.

- [x] DONE (2026-07-18): "stumble knocks the defender down and away" seeds incorrectl;y, it does a pow result and not a stumble
      — Root cause: the outcome seed-finder always runs headless with HUMAN teams, but the sandbox replayed the found seed with whatever teams were currently loaded (Black Orcs by default, or leftovers from an earlier scenario). Different rosters → different ST/AV → different block-dice count and RNG draw order, so the same seed rolled a different die (POW instead of POW!/Dodge). `SandboxScene` now pins rule-catalog scenarios to the finder's rosters (Human unless the config names its own) before loading. Locked by `__tests__/integration/sandbox-seed-replay.test.ts`.
