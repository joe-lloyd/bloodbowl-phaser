- FIXED 2026-07-28 (fix-cloud-save-permission-error, PR #20): noticed this error when loading the app heres a copnsole duimp
    index-OyrASW8s.js:3449 🌀 @strudel/core loaded 🌀
    index-OyrASW8s.js:3609 ⚛️  React UI - Initialized!
    index-OyrASW8s.js:3609 🏈 Blood Bowl Sevens - Ready!
    index-OyrASW8s.js:3609 📡 EventBus - Ready for communication!
    index-OyrASW8s.js:3609 Failed to load cloud match save: FirebaseError: Missing or insufficient permissions.
    (anonymous) @ index-OyrASW8s.js:3609
    await in (anonymous)
    (anonymous) @ index-OyrASW8s.js:3609
    (anonymous) @ index-OyrASW8s.js:3422
    (anonymous) @ index-OyrASW8s.js:3422
    (anonymous) @ index-OyrASW8s.js:913
    Promise.then
    registerStateListener @ index-OyrASW8s.js:913
    onAuthStateChanged @ index-OyrASW8s.js:913
    cne @ index-OyrASW8s.js:1138
    nw @ index-OyrASW8s.js:3422
    sw @ index-OyrASW8s.js:3422
    Cwe @ index-OyrASW8s.js:3529
    (anonymous) @ index-OyrASW8s.js:3609
  — the cloud match-save load raced Firestore's token attachment right after sign-in restore, producing a spurious permission-denied. Now refreshes the ID token first, retries once on a permission error (warn, not error), and falls back to the local save instead of losing the resumable match.

- FIXED 2026-07-28 (redesign-team-builder-draft-ui, PR #22): do a redesign for the advancement mode dropdown ion the build team so it matches the style of the other options maybe just add it to the list under team colours, in that style.
  — replaced the native `<select>` with a row of styled option buttons matching the Team Colours swatches, placed directly under that section.

- FIXED 2026-07-28 (redesign-team-builder-draft-ui, PR #22): team builder also says that reroles cost double thats not true in sevens they just cannot be bought but by default when drafing the team they cost double. right now in draft teh rerol is the original price but it should be double
  — draft reroll price now doubles the roster's base cost; active teams can no longer buy a reroll at all (was previously purchasable at double price, which is backwards).

- FIXED 2026-07-28 (redesign-team-management-pages, PR #21): i also wanna remove the stats overview from the overview page and add the stats overview to the detail page for the team
  — the Team Value/Treasury/Roster/Record grid moved from the Team Management overview cards to each team's own detail page.

- FIXED 2026-07-28 (redesign-team-management-pages, PR #21): can we do a redesign for the team select in local play, i have so many teams so teh page is so long
  — added a live search/filter per column and shrank each row to a denser single-line treatment.

- FIXED 2026-07-28 (fix-chain-push-grab-skill, PR #19): chain push test is now not working ebcause black orcs have grab so they cannot push into the dudes behind because there are more options because they ahve the geab skill by default
  — investigated and Grab's push logic was already correct per the rulebook (it widens push options to all 8 adjacent squares, and still chains normally when the defender is fully boxed in on all 8 — the old test scenario just never exercised a Grab-holding attacker). Added scenarios/tests locking in both the open-square and boxed-in cases, plus a match-log line naming Grab when it's the reason a wider square was offered.

- FIXED 2026-07-28 (overhaul-sound-system, PR #26): why id the doubd just like boom boom boom boom theres nothing else to it and the mute and volume slider dont do anything in standbox mode.
  — the dice-roll sound now picks randomly from a small family of patterns instead of always playing the same one. The mute/volume control was relocated into the Match Options menu (see below), which also resolves the sandbox-mode issue — it was overlapping the sandbox controls, not actually broken.

- FIXED 2026-07-28 (restore-e2e-existing-test-cases, PR #25): why did you make e2e testcases when we should just hva efilled out the exiusting testcases that we had for each section dont just remove them but wwhy can we keep then in each seciton and just have added extra test cases that I can use
  — reorganized the e2e scenario-case registry into section-named modules mirroring `__tests__/headless/*.test.ts` naming, so new coverage for a section lands in that section's own file. Nothing under `__tests__/headless/`, `__tests__/unit/`, or `__tests__/integration/` was touched or deleted.

- FIXED 2026-07-28 (overhaul-sound-system, PR #26): sound persists even when leaving the game anmd is terrible, we need an overhaul of sound and to fix eveything there
  — leaving a match now fully stops the shared audio scheduler and any in-flight sample playback, not just event bindings.

- FIXED 2026-07-28 (overhaul-sound-system, PR #26): sound popup also covers the top right corner stuff, move it into the mactch options button in the bottom right as an option
  — the mute checkbox and volume slider now live inside the bottom-right Match Options menu as a keyboard-reachable panel entry; the floating top-right popup is gone.

- FIXED 2026-07-28 (fix-kickoff-event-table-followups, PR #24): charge, the result oin the kick off table has stopped working it wont let me move my gus.
  — the kickoff step's displayed state (selection counter, Charge!'s active player) was frozen because the engine handed back the same object reference on every change, so React never re-rendered mid-step even though state was actually updating underneath.

- FIXED 2026-07-28 (fix-kickoff-event-table-followups, PR #24): seeding the game is not working since i roilled the kickoff table and got one result and then i refreshed the game and rerolled the kick off tabl;e result and go a different result this will knock games out of sync so lets make sure its cnonsistanbt and you cannot double roll a socre to get a different result
  — a stale page refresh mid-kickoff could re-trigger the actual kick action, producing a different deviation/landing result. A drive's kickoff now resolves exactly once and replays its stored result on a restore instead of rolling again.

- FIXED 2026-07-28 (fix-kickoff-event-table-followups, PR #24): kick off table results description get pushed down the page in a really annying way when you hover a player since they are in the same block, make sure it doesn move when its up perhapse it should be top right and the player and other highlights should go underneath since this is static content until that section is gone, actually the selected player should be under that and the hoverd player shyould be under that since the hover is the shortest popup type sp please get that order from top to bottom correct, [static section notes] -> selected player -> [hovered content]
  — the kickoff panel now renders above the player-info panel and no longer moves when hovering; order top to bottom is kickoff panel, then selected player, then hovered player.

- FIXED 2026-07-28 (fix-kickoff-event-table-followups, PR #24): the kickoff results note often has a x/x in the top right butas i select and move players the number is not updated so its kinda dumb. make the number update correctly
  — same root cause as the Charge fix above (stale object reference blocking re-render); the counter now updates live as players are selected and moved.

- FIXED 2026-07-28 (fix-foul-ko-sentoff-cleanup, PR #23): KO player from foul was not removed to the KO box when the foul was finished and also the hughlight red underneath the palyer stayed after the players activation ended, it should have ended. also sendt off player was not remvoed from the filed, they can gop to the dugout with a redcard icon or something to show that they cannot play the rest of thebgame.
  — foul-caused KO/Casualty now route through the same `movePlayerToBox` seam block-caused injuries already used, so the player's sprite actually leaves the pitch. Sent-off players are moved to a new dugout section with a red-card marker. The foul highlight now clears only once the foul's full resolution (including any KO/Casualty/Send-Off) has finished, not the instant it was queued.
