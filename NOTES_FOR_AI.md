- FIXED 2026-07-28 (fix-sandbox-test-fixtures, PR #30): the default chain push test still uses black orcs with grab so i cannot test the bascic chain push, i like that you added the grab tests as well.
  — the base `chain-push` scenario now pins both sides to Human (no Grab), so it exercises a plain no-skill-modifier chain push; the existing Grab-specific scenarios were left untouched.

- FIXED 2026-07-28 (fix-sandbox-test-fixtures, PR #30): in the sandbox never have the same team type facing off against eachother in fact the default teams should be human team 1 and orc (noit black orc) so make sure thats the case in the sand box so iits very easy to see who is on what teamwithout hoviering every dude
  — the sandbox's no-args default matchup is now Human vs. Orc (was Black Orc vs. Black Orc), extracted into its own tested module so it can't silently regress.

- FIXED 2026-07-28 (add-brawler-both-down-reroll, PR #32): for rerolling the both down what i would like to happen is no popup with the question but just show the blcok upuup as normal but add a nutton inside the blcok popup that says brawler: reroll 1 both down and clicking that spins 1 of the both down results and then shows the new resut.
  — removed the separate confirm popup; the normal block popup now shows a "BRAWLER: RE-ROLL 1 BOTH DOWN" button whenever a die reads Both Down, which re-rolls exactly that one die in place. Using Brawler now mutually excludes Team Re-roll/Pro on that block (and vice versa), matching the rulebook.

- FIXED 2026-07-28 (overhaul-sound-effects-library, PR #33): the sound debug dashboard, seems like it plays the sounds on a loop, and i dont here it in game only the dice roll one on a loop whcihc i hate, the dice roll one is bad we need one that actually sounds like rolling dice, catch needs a better sound evffect as well something brighter and satisfying, pass is bad as well needs to be more of a whoosh sound to show the ball being thrown fast through the air, touchdonw should be qa big crowed cheering kinda sound, end of half should be a whistle sound, probablyy drop the ui click sound, send off should be a strong whistle sound like the reef blew the whistl, KO or injury sound should be a crunch sound like bones breaking, turn over should just be on kinda negative sound like a vuvuzella in a shitty key that sounds like something bad happened, fumble should be a goof sound like a clown inspired sound, ball bounce needs to be brighter its too lkow now and you cannot hear it well, same for knockdown but knockdown shouls till be low, block impact needs to be more imactful. basically all the sounds are a bit too basic and could be layered better to get a deeper feel. I also think we need to completly drop the music stuff. and it feels like the sound is just bugged in game with the sound either repeating froever and never playing new sounds so i always get stuck with just the dice roll or something else is not working. this needs a lot of work, maybe even dropping strudle and getting a more js sound evffect library instead. mute all sound effects and volume sider also dont actually do anything still and also the back to main menu button doesn work either. investigate 
  — root cause: Strudel plays every sound through one shared global scheduler, never designed for concurrent one-shot SFX, so a `setTimeout`-based stop hack would lose races and strand a sound (usually the highest-frequency one — dice roll) playing forever. Dropped Strudel entirely for a hand-rolled Web Audio engine where every trigger gets its own independent, self-stopping node graph. Redesigned every effect's character per your list (dice rattle, bright catch, whoosh pass, crowd-cheer touchdown, whistle end-of-half/send-off, bone-crunch KO, dissonant turnover, goofy fumble, brighter ball-bounce, still-low knockdown, punchier block-impact), dropped the UI click sound and the music system entirely, routed mute/volume through one master gain node so they now actually affect in-flight sound, and fixed the dead "Back to Main Menu" button. Note: sound *quality* couldn't be verified by ear in this environment — please do a real in-browser listening pass and flag anything that still doesn't land.

- FIXED 2026-07-28 (restore-team-overview-stats, PR #28): carrerr statistics are still on each team on the overview page, they need to be removecd only in manbage team they should be. ah but i noticed you deleted the win loss stuff you dumb ass i need those stats so you fcuked up and deleted the wrong part, idiot. bring back the wins and losses and team value treasury and roste x/11 to the overview page and remove the career statics and put those for each player in the detail page as like extra columns 
  — career statistics removed from the overview page; the Team Value/Treasury/Roster x/11/Record grid is back on each overview card (reversing the earlier redesign that wrongly dropped it); career stats now show as extra columns (GP/TD/CMP/CAS/Kills/MVP) on each player's row in the Manage Team detail page.

- FIXED 2026-07-28 (add-team-builder-rule-tooltip, PR #27): i wanna show the rule in a tooltip when hovining the rule in the build team page so a coach can see
  — every skill badge on the draft page (both available hires and your rostered players) now shows its full rule text in a hover tooltip, keyboard-focusable too (tab to a skill, not just mouse hover).

- FIXED 2026-07-28 (seed-advancement-progress-data, PR #29): we need to update the seed data so that each team has selected its advancment type already. and also some seed data where some of the players have the SPP so i can test the spending and adding new skills setup as well as the other advancemnet types and maybe add something in the team name so i can see or add a new pill to show the advancment type in the vierview kinda lik ewhat you have already with the draft vs active pills
  — every seeded team now has an explicit, locked advancement mode; seeded teams across all three modes carry real in-progress state to test against (Advanced League players with spendable SPP, a Matched Play team with an allocated event-skill slot, a Sevens Skill Selection team with a pending post-game skill pick); a new pill next to the draft/active pill shows each team's advancement mode on the overview.

- FIXED 2026-07-28 (add-dice-log-color-coding, PR #31): i wanna fix a bit of the colouring with the dice log. on online play everything that is good for you should be green and everything that is bad for you should be red. thats easy because almost every dice roll is like this, bar the weather and kick off result table. but when playing a solo game i just wanna make sure every negative diceroll is red and every positiv roll is green and other rolls like the coin toss which really is perspective based is some other highlight, mayb e blue, warning info messages like Select a kicker first should be a warning orange/yellow colour. text in the dice log is small we probably need that to be much bigger so peoipole can see adda  scale option in the roller to set the size of the font manually if they thing the default is too small
  — dice log entries are now colored green/red by whether they favor you (online: your team; solo: any positive/negative roll), with Coin Toss/Weather/Kickoff Event always neutral blue (none of those carry a clean per-team good/bad reading) and warning/info messages orange/yellow. Added a persisted font-size stepper (75%-200%) in the dice log header.



# new multiplayer items

- when in setting up in multplayer and changing the position of a player they jump back to the reserves box for a split second, lets nmopt to that if they are dragged from on legal square to another legal square theres no reason fro them to flash into the reserve box for a second, i think its called optemistic rendering, because i know theres a moment when the player gets sent to the reserves becauise of the =firestore connection, but that looks like a bug in the game so stop that.

- lets add a no timelimit option fro multiplayer as well so i can take more time testing stuff

- when the kickoff table gets rolled a lot of the results require input from one player, that means that the skip and confitrm buttons should not be on the other players screen nor should the little selection circles they should just be left to the other coach and for examplke when solid defense is rolled and the deffending player move some players to a new legal setup they should just move in the other screen, or maybe we should have a red circle that shows what the other player is selecting and use that fro the whole game, so a player can see them interacting with each player on the other team. then we remove the select highlight from the whole opposing team and just show who is being selected etc (keep the yellow square and orange for the down status and keep the opacity fro players that already moved i just wanna get rid of the white square if its a team you are not controlling)

- multiplayer the ball was on the wrong square so theres probably a seed issue we need to fix so they have teh same roll outcomes

- turncounter is not working on the non-host, it never goes up.

- the timer hiting zero doesnt seem to end the turn properly 

- something fell out of sync and ended up causing infinite roll fro a block and skipped the bloodlust roll on the vampire. heres a full log dump
    react-dom_client.js?v=e52c6263:20103 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
    @strudel_web.js?v=e52c6263:546 🌀 @strudel/core loaded 🌀
    main.ts:26 ⚛️  React UI - Initialized!
    main.ts:34 🏈 Blood Bowl Sevens - Ready!
    main.ts:35 📡 EventBus - Ready for communication!
    :3001/favicon.ico:1  Failed to load resource: the server responded with a status of 404 (Not Found)
    firebase_auth.js?v=e52c6263:7568 Cross-Origin-Opener-Policy policy would block the window.close call.
    close @ firebase_auth.js?v=e52c6263:7568
    firebase_auth.js?v=e52c6263:7568 Cross-Origin-Opener-Policy policy would block the window.close call.
    close @ firebase_auth.js?v=e52c6263:7568
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    ServiceContainer.ts:54 [ServiceContainer] Initializing RNG with seed: 677473463
    SoundManager.ts:16 SoundManager created.
    SoundManager.ts:23 SoundManager: Initializing...
    phaser.js?v=e52c6263:8456      Phaser v3.90.0 (Canvas | Web Audio)  https://phaser.io/v390
    BootScene.ts:41 Phaser BootScene: Assets loaded, waiting for UI command...
    GameScene.ts:332 [GameScene] Screen Dims: 1220x980
    GameScene.ts:333 [GameScene] Pitch Y: 160, Pitch Height: 660
    SetupPhaseHandler.ts:30 [SetupPhaseHandler] Entering Setup Phase
    SetupPhaseHandler.ts:35 [SetupPhaseHandler] Current SubPhase: INTRO
    @strudel_web.js?v=e52c6263:546 [superdough] AudioWorklets loaded
    @strudel_web.js?v=e52c6263:546 [superdough] ready
    SoundManager.ts:35 SoundManager: Init complete.
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    @strudel_web.js?v=e52c6263:546 [cyclist] start
    :3001/favicon.ico:1  Failed to load resource: the server responded with a status of 404 (Not Found)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    PlayerPlacementController.ts:47 [PlayerPlacementController] enablePlacement: team=team-1785236060488-zsxvnhwt7, isTeam1=false, spriteCount=8
    GameScene.ts:376 [GameScene] Global PointerDown: 821.2760416666667, 490.2647413624827
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 810.9505208333334, 564.9263625663278
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 824.453125, 434.6656617425981
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 945.9765625, 672.1531589761054
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 1053.203125, 547.452366114364
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 943.59375, 318.70186710683873
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 1058.7630208333335, 437.04847944059316
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 813.3333333333334, 443.40265996858
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 814.921875, 556.189364340346
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 936.4453125, 539.5096404543806
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 869.7265625, 551.4237289443558
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 882.4348958333334, 547.452366114364
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 929.296875, 543.4810032843723
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 881.640625, 543.4810032843723
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 938.828125, 484.7048334004943
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    SetupPhaseHandler.ts:89 [SetupPhaseHandler] Exiting Setup Phase
    KickoffPhaseHandler.ts:29 [KickoffPhaseHandler] Entering Kickoff Phase
    GameScene.ts:376 [GameScene] Global PointerDown: 397.1354166666667, 375.0952192927217
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 456.7057291666667, 376.6837644247184
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    PlayPhaseHandler.ts:40 [PlayPhaseHandler] Entering Play Phase
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 824.453125, 676.9187943720955
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 829.21875, 610.1998988282339
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 514.6875, 498.20746702246623
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 514.6875, 498.20746702246623
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 880.0520833333334, 425.9286635166162
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 532.1614583333334, 392.56921574468544
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 532.1614583333334, 392.56921574468544
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 820.4817708333334, 321.0846848048338
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 535.3385416666667, 317.90759454084036
    GameScene.ts:376 [GameScene] Global PointerDown: 535.3385416666667, 317.90759454084036
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 813.3333333333334, 370.3295838967316
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    GameScene.ts:376 [GameScene] Global PointerDown: 530.5729166666667, 559.3664546043393
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 530.5729166666667, 559.3664546043393
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 864.1666666666667, 555.3950917743476
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 519.453125, 668.9760687121119
    GameScene.ts:376 [GameScene] Global PointerDown: 519.453125, 668.9760687121119
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 813.3333333333334, 662.621888184125
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 705.3125, 556.189364340346
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 577.4348958333334, 501.38455728645965
    GameScene.ts:376 [GameScene] Global PointerDown: 577.4348958333334, 501.38455728645965
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 676.71875, 549.8351838123591
    GameScene.ts:376 [GameScene] Global PointerDown: 676.71875, 549.8351838123591
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 702.1354166666667, 491.0590139284811
    GameScene.ts:376 [GameScene] Global PointerDown: 702.1354166666667, 491.0590139284811
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 817.3046875, 510.12155551244155
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    NetworkedGameService.ts:45 [Networked] host rejected cancel-action: command-failed: action-already-committed
    (anonymous) @ NetworkedGameService.ts:45
    GameScene.ts:376 [GameScene] Global PointerDown: 473.3854166666667, 421.1630281206261
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 473.3854166666667, 421.1630281206261
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 400.3125, 434.6656617425981
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 338.359375, 352.8555874447679
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    GameScene.ts:376 [GameScene] Global PointerDown: 698.9583333333334, 492.6475590604778
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    NetworkedGameService.ts:45 [Networked] host rejected declare-action: command-failed: illegal-action-declaration
    (anonymous) @ NetworkedGameService.ts:45
    GameplayInteractionController.ts:349 Switched action step to: block
    GameScene.ts:376 [GameScene] Global PointerDown: 705.3125, 435.4599343085965
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    content.js:1 Uncaught (in promise) Error: Extension context invalidated.
        at content.js:1:20039
        at new Promise (<anonymous>)
        at m (content.js:1:19964)
        at Object.apply (content.js:1:17289)
        at xe (content.js:18:81315)
    NetworkedGameService.ts:45 [Networked] host rejected block: command-failed: block-not-declared
    (anonymous) @ NetworkedGameService.ts:45
    @strudel_web.js?v=e52c6263:3936 skip query: too late
    @strudel_web.js?v=e52c6263:3936 skip query: too late
    @strudel_web.js?v=e52c6263:3936 skip query: too late
    @strudel_web.js?v=e52c6263:3936 skip query: too late
    @strudel_web.js?v=e52c6263:3936 skip query: too late
