- when doing setup i still wanna see the player info when im draging guys but i dont see anything. 

- i would like to remove the notification system for the most part and integreate it into the Dice Log as the outcomes fro example the weawther roll is in there as a log item but re result should be an entry as well with the inforamtion like for weather perfect bloodbowl weather wioth the result of thazt, or the kick off table result and that info. i just want the old notification system at the top of the page to only show when the turn changes or the round flips to the other player and it shouls say half time at halftime maybe its more of a state shower like it announces what we're going to do, then also make it much bigger and center it so its easy to see and acts like a bookend to each part 

- the foul action when i use it and try to get a downed player the block windwo just opens up instead of a proper foul action

  FIXED 2026-07-25 — root cause was `defaultStep` in GameplayInteractionController
  being hard-coded to "move" regardless of the action's own steps, so the Foul
  branch (which required currentStepId === "foul") never matched and the click
  fell through to the implicit-Block path. Three changes: the opening step is now
  the action's first step; the Foul branch claims player clicks at either step;
  and the implicit Block only runs for modes that mean to block (nothing declared,
  a declared Block, or a Blitz) so no action can decay into a block dice dialog
  again. Also fixed Throw Bomb / Ball & Chain / standalone Block, which were
  stranded on a nonexistent "move" step by the same bug.
  Locked by __tests__/headless/foul-and-jump-actions.test.ts.

when using the jump move ability and there are multiple potentiasl targets only one is selected as a jump opertuinity but when jumping every adjacent downed player should be an option

  INVESTIGATED 2026-07-25 — could NOT reproduce at the engine level, so no
  behaviour was changed. jumpTargets returns every adjacent jumpable player
  (3 prone -> 3 jump-overs; a full ring -> 8), Pitch.drawJumpTargets already
  rings every jump-over and dots every landing, and actionAvailability gates on
  the full set.
  Added sandbox scenario "jump-multiple-prone" (Jump: Multiple Prone Targets) so
  this can be checked in-app: four adjacent Prone defenders plus a Standing one
  that must NOT be offered, and two deliberately shared landing squares — (10,4)
  reachable over either (9,5) or (9,4), and (9,3) over either (8,4) or (9,4).
  A shared landing resolves to the first jump-over in engine order, so if the
  real symptom was "the wrong player got jumped", that tie-break is the likely
  culprit.
  ** TODO: play this scenario and confirm. If still wrong, note how many amber
  rings appear and which action was declared. **

when trying to jump up and blcok i got the message cannot declaire block already used, which makes nosense because you can always blcok adjacent players theres no limit, the block button should alow me to use jumpup and then perform a standard block since jumpup makes the move free

  FIXED 2026-07-25 — two separate defects behind this one message:
  1. The "already used its Block" guard (GameService.blitzBlockUsed) could refuse
     a Block the player was entitled to make. It is now scoped to a player whose
     CURRENTLY declared action is a blitz, and is also cleared at drive reset, so
     a stale flag can never refuse a later Block.
  2. Jump Up's second clause was never implemented (JumpUpRule.ts said so). A
     Prone player with Jump Up may now declare a Block. NOTE: per the 2025 rules
     this is NOT free — standing up to make the Block requires an Agility test
     with a +1 modifier; pass = stand for free and Block, fail = Action wasted
     (not a turnover). Confirmed as the intended behaviour rather than the
     free stand-up assumed in the note above.
  Clause 1 of Jump Up (free stand-up during a movement action) was already
  implemented and is unchanged.
  Locked by __tests__/headless/foul-and-jump-actions.test.ts.

after scoroing a touchdown i was unable to complete the seup, i noticed this warning SceneOrchestrator.ts:124 [Orchestrator] No handler for phase: TOUCHDOWN. i had 7 players ebcause my ko player got recovered but he ended up being duplicated one version was on the pitch and one version was stuck in the ko box, so we need to make the ko recovery a bit of a thing where we roll for each player do an animatino to show they recovered or theya re still KO'd then if they recover move them to the resetrves so they are ready fro setup. and if the are no ready setting up with less than 7 player should not break the gasetup process.

local games are not saved in teh same way that lets them be rejhoinable, a local game is lost if you hit the resfresh button. we should at least make sure the lcoal game is saved in local storage fro recovery but ideally we should add it to the firebase.

I think the firebase has a lot of redundant content we should use ref ids to refrence stuff like teams in leagues instead of duplicating all the team data, same for the coach. a team can only be in one league or tournement at a time anyway so a ref to that team should be singular. additoinally the statlines etc do not need to be added to the firestoore as well when saving a team only unique data for the player needs to go to teh firestore or the additional stuff like the name spp or stat increases or new skills or injuries or just general stats like maybe you wanna add how many games played steps taken kills scores passes etc all that good stats stuff. but reduce the nopise and adata when it comes to redundant stuff. 

when i booted asecond game i got an error after setup where the team couldnt move heres the log Uncaught (in promise) TypeError: Cannot read properties of null (reading 'queueDepthSort')
    at Systems2.queueDepthSort (phaser.js?v=fbbe80dc:112625:38)
    at BallSprite.GameObject2 [as constructor] (phaser.js?v=fbbe80dc:17692:31)
    at new Container2 (phaser.js?v=fbbe80dc:26591:32)
    at new BallSprite (BallSprite.ts:8:5)
    at GameScene.placeBallVisual (GameScene.ts:985:23)
    at KickoffPhaseHandler.ts:76:37
    at EventBus.ts:79:11
    at Set.forEach (<anonymous>)
    at EventBus.emit (EventBus.ts:77:22)
    at BallManager.kickBall (BallManager.ts:112:19)


when the action cam is moveing to doio the kickoff animation all the new overlay with the team names are weirdly kept onm teh screen in exactly the same palce, since they are in the overlya layer ui they are just onn the screen all teh time even when zooming etc. so probably we need to hide them whwn we are fdoing the action cam, theres a plan to do ome with the action cam in the future so we need an elegent solution maybe have them scale up a bit and fade out adn then scale back down and fade in when the camera is reseting 

upon finishing the game this is all i got "[Orchestrator] Match complete. Full time — Shambiling Undead Sample 1 : 1 Human Sample (draw)" we didnt get to the results screen or the stats or spp screen at all. 

im not sure the publish team thing is useful, I think a users teams should be readable just not writable, but in team managemnt tyheres should be kinda 2 modes, the mode before they have ever played a game where they can be edited and everything and then after they have started playing games they should be locked in and they need to folow the rules for an active team or team in a league so the team rerole becaomse double price for example and they cannot buy fanfactor any more, shoiuld should also see the page where we can speend the SPP for a player adn see their individual stats touchdowns etc.

lets fix the tounements overview ui so it looks like a proper cup layout where theres is all teh sames split out with players solowly gettign eleminated till the get to the center and the cuop