/**
 * Every event name on the bus. The payload each one carries is in the
 * domain files beside this one, gathered in types/events.ts.
 */
export enum GameEventNames {
  // Game Events
  PhaseChanged = "phaseChanged",
  SetupConfirmed = "setupConfirmed",
  KickoffStarted = "kickoffStarted",
  ReadyToStart = "readyToStart",
  TurnStarted = "turnStarted",
  TurnEnded = "turnEnded",
  ActionResolved = "actionResolved",
  /** Razzle-Dazzle: the player's first Action ended; the second is next. */
  RazzleDazzleSecondAction = "razzleDazzleSecondAction",
  TurnDataUpdated = "turnDataUpdated", // New event
  PlayerPlaced = "playerPlaced",
  PlayerRemoved = "playerRemoved",
  PlayersSwapped = "playersSwapped",
  PlayerMoved = "playerMoved",
  PlayerActivated = "playerActivated",
  PlayerSelected = "playerSelected",
  PlayerDeselected = "playerDeselected",
  /**
   * Online only: the OTHER coach's own-team selection changed, as reported
   * over the network's cosmetic "selection" envelope. Drives the remote
   * player's red-ring indicator; never engine state, never crosses back out.
   */
  RemoteSelectionChanged = "remoteSelectionChanged",
  /**
   * Online only: the OTHER coach has a Dodge, Rush or Pick up prompt open,
   * or null once they answer it. Sent over the cosmetic "prompt" envelope;
   * never engine state.
   */
  RemotePromptChanged = "remotePromptChanged",
  PlacementInvalid = "placementInvalid",
  SetupRestrictionsUpdated = "setupRestrictionsUpdated",
  SetupConcessionOffered = "setupConcessionOffered",
  SetupConcessionResolved = "setupConcessionResolved",
  PlayerStatusChanged = "playerStatusChanged",
  Turnover = "turnover",
  BlockDiceKept = "blockDiceKept",
  BlockDiceRolled = "blockDiceRolled",
  /** An Armour Roll's outcome, once the rules acting on it have folded. */
  ArmorRolled = "armorRolled",
  /** An Injury Roll's result, once the rules acting on it have folded. */
  InjuryRolled = "injuryRolled",
  PlayerKnockedDown = "playerKnockedDown",
  PlayerCasualtyInflicted = "playerCasualtyInflicted",
  /** A casualty's injury result was Dead — emitted once the result is known,
   *  after PlayerCasualtyInflicted (whose roll comes first). */
  PlayerKilled = "playerKilled",
  PlayerStoodUp = "playerStoodUp",
  /** A thrower performs a Throw / Kick Team-mate gesture (sprite lean/kick) */
  PlayerThrowGesture = "playerThrowGesture",
  /** A skill rule changed a roll/dice/result, or offered/used a reroll */
  SkillTriggered = "skillTriggered",
  RerollUsed = "rerollUsed",
  /** A Sent-off, one step at a time: the call, the argument, any Bribe */
  RefereeCall = "refereeCall",
  /** The engine paused on a mid-action decision (reroll offer, reaction) */
  DecisionRequested = "decisionRequested",
  /** That decision was answered, by whichever coach owns it */
  DecisionResolved = "decisionResolved",
  Touchdown = "touchdown",
  BallPlaced = "ballPlaced",
  BallKicked = "ballKicked",
  /** The airborne kickoff ball's final square changed before landing. */
  KickoffAirbornePositionChanged = "kickoffAirbornePositionChanged",
  /** Kickoff events are resolved and the airborne ball may now land. */
  KickoffBallLanding = "kickoffBallLanding",
  /** Landing hand-off is complete; camera/preview state may be cleared. */
  KickoffSequenceCompleted = "kickoffSequenceCompleted",
  KickoffResult = "kickoffResult",
  /** An interactive kickoff-event step opened for its owning coach. */
  KickoffEventStepStarted = "kickoffEventStepStarted",
  /** The kickoff-event step ended (confirmed or skipped); kick resumes. */
  KickoffEventStepResolved = "kickoffEventStepResolved",
  /**
   * A command for the kickoff-event step has run and its result can be read:
   * a pick, a move or a placement. Sent over the network, the decision the
   * board reads is away while the command runs.
   */
  KickoffEventStepChanged = "kickoffEventStepChanged",
  /** A drive/match-scoped kickoff effect was granted to a team. */
  DriveEffectGranted = "driveEffectGranted",
  /** A drive-scoped kickoff effect expired (drive end, or turn end for
   *  the owed Offensive Assist). */
  DriveEffectExpired = "driveEffectExpired",
  KORecoveryRolled = "koRecoveryRolled",
  TouchbackAwarded = "touchbackAwarded",
  PlayerPushedIntoCrowd = "playerPushedIntoCrowd",
  BallThrownIn = "ballThrownIn",
  DriveEnded = "driveEnded",
  BallPickup = "ballPickup",
  WeatherChanged = "weatherChanged",
  /** A coach readied up for the opening weather roll. */
  WeatherReady = "weatherReady",
  DiceRoll = "diceRoll",
  GameStateRestored = "gameStateRestored",
  RefreshBoard = "refreshBoard",
  /** Crisp text (dugout headers, end-zone names) for the React overlay */
  /** Match assets loading: 0..1, for the loading screen. */
  UI_LoadProgress = "ui:loadProgress",

  /**
   * A rules operation resolved a kick/throw and is holding at a presentation
   * boundary; the client plays it and replies with UI_PresentationAcknowledged.
   */
  PuntDeclared = "puntDeclared",
  /** A client finished presenting a declared animation (id echoes the event). */
  UI_PresentationAcknowledged = "ui:presentationAcknowledged",

  // Pass/Catch Events
  PassDeclared = "passDeclared",
  PassAttempted = "passAttempted",
  PassCompleted = "passCompleted",
  PassFumbled = "passFumbled",
  InterceptionAttempted = "interceptionAttempted",
  PassIntercepted = "passIntercepted",
  ThrowTeammateLanded = "throwTeammateLanded",
  MvpAwarded = "mvpAwarded",
  AwardedTouchdownAssigned = "awardedTouchdownAssigned",
  MatchSppApplied = "matchSppApplied",
  InterceptionFailed = "interceptionFailed",
  CatchAttempted = "catchAttempted",
  CatchSucceeded = "catchSucceeded",
  CatchFailed = "catchFailed",
  BallScattered = "ballScattered",

  // Weapon Events (Bombardier)
  BombThrown = "bombThrown",
  BombExploded = "bombExploded",

  // Action Mode Events
  ActionModeChanged = "game:actionModeChanged",
  PlayerMovedInAction = "game:playerMovedInAction",
  PassZoneHovered = "game:passZoneHovered",

  // Camera Events
  Camera_TrackBall = "camera:trackBall",
  Camera_Reset = "camera:reset",
  Camera_ChooseNextPlayer = "camera:chooseNextPlayer",
  /** The camera left or returned to its neutral framing. Driven by
   *  CameraController itself (not per-call-site), so any camera move —
   *  present or future — publishes this without new wiring. */
  Camera_StateChanged = "camera:stateChanged",

  // UI Events
  UI_PlayerHired = "ui:playerHired",
  UI_PlayerFired = "ui:playerFired",
  UI_TeamSaved = "ui:teamSaved",
  UI_TeamNameChanged = "ui:teamNameChanged",
  UI_TeamColorChanged = "ui:teamColorChanged",
  UI_RerollPurchased = "ui:rerollPurchased",
  UI_ActionSelected = "ui:actionSelected",
  UI_ConfirmAction = "ui:confirmAction",
  UI_CancelAction = "ui:cancelAction",
  UI_EndActivation = "ui:endActivation",
  UI_EndTurn = "ui:endTurn",
  UI_PlacePlayer = "ui:placePlayer",
  UI_RemovePlayer = "ui:removePlayer",
  UI_ConfirmSetup = "ui:confirmSetup",
  UI_LoadScenario = "ui:loadScenario",
  UI_StartGame = "ui:startGame",
  /** The opening's weather roll is up: show the coaches the dialog. */
  UI_StartWeather = "ui:startWeather",
  /** The coach has read the weather; the opening moves on to the toss. */
  UI_WeatherComplete = "ui:weatherComplete",
  /** A late-mounted weather dialog asks whether the roll is waiting. */
  UI_RequestWeatherState = "ui:requestWeatherState",
  UI_StartCoinFlip = "ui:startCoinFlip",
  UI_ShowCoinFlip = "ui:showCoinFlip",
  UI_CoinFlipComplete = "ui:coinFlipComplete",
  UI_RequestCoinFlipState = "ui:requestCoinFlipState",
  UI_ShowSetupControls = "ui:showSetupControls",
  UI_HideSetupControls = "ui:hideSetupControls",
  /** Online: re-render the pitch from the authoritative snapshot so a
   *  player watching the opponent's setup/placement sees it live. */
  /** Online: draw the other coach's whole move path while it plays out */
  UI_ShowOtherCoachMove = "ui:showOtherCoachMove",
  /** Online: the other coach's move has run on this engine */
  UI_OtherCoachMoveResolved = "ui:otherCoachMoveResolved",
  UI_SyncBoard = "ui:syncBoard",
  /** Online guest only: a sync-returning "optimistic" mutation (declare-
   *  action, cancel-action, …) that NetworkedGameService reported as
   *  succeeded was actually rejected by the host once the round trip
   *  completed. The local interaction controller cannot trust its own
   *  optimistic step-machine state after this — it must reconcile against
   *  the (already snapshot-corrected) replica rather than keep pretending
   *  the command it just sent took effect. */
  NetworkCommandRejected = "network:commandRejected",
  UI_SetupComplete = "ui:setupcomplete",
  UI_SetupAction = "ui:setupAction",
  UI_FormationsUpdated = "ui:formationsUpdated",
  /**
   * @deprecated Kept as a compatibility alias while emitters are migrated to
   * UI_LogEntry (see overhaul-match-announcements). A string sent here is
   * wrapped into a low-priority ("info") log entry so nothing goes silent —
   * new code should emit UI_LogEntry directly with a real category.
   */
  UI_Notification = "ui:notification",
  UI_GameLog = "ui:gameLog",
  /** A competition fixture's result has been recorded exactly once; the
   *  results screen uses this to show a recording confirmation. */
  CompetitionResultRecorded = "competitionResultRecorded",
  /** A durable match-log record: a roll (optional) and the outcome it
   *  produced, authored by the rule that resolved it. Lands in the Dice Log
   *  and never expires on its own (subject only to the log's retention). */
  UI_LogEntry = "ui:logEntry",
  /** A large, centred, self-dismissing announcement reserved for structural
   *  match transitions. The `kind` union is the only way to raise one. */
  UI_Announce = "ui:announce",
  /** The moment queue hands the screen to one moment, or clears it (null).
   *  The Announcer and the turnover overlay render only what this says. */
  UI_PresentMoment = "ui:presentMoment",
  /** The local coach cut the end-of-drive celebration/recovery beat short.
   *  Local only — it is a UI intent and never crosses the wire, so an online
   *  match plays the sequence at its fixed length for both coaches. */
  UI_SkipDriveSequence = "ui:skipDriveSequence",
  ScenarioLoaded = "scenarioLoaded", // New event for scenario seed info
  UI_RequestConfirmation = "ui:requestConfirmation",
  UI_ConfirmationResult = "ui:confirmationResult",
  UI_BlockResultSelected = "ui:blockResultSelected",
  UI_Turnover = "ui:turnover",
  UI_ShowPlayerInfo = "ui:showPlayerInfo",
  UI_HidePlayerInfo = "ui:hidePlayerInfo",
  /** Fills the info panel with a subject that may or may not be a player
   *  (e.g. a sideline crew figure). `UI_ShowPlayerInfo` remains the player
   *  path during migration; `UI_HidePlayerInfo` clears either. */
  UI_ShowInfo = "ui:showInfo",
  UI_BlockDialog = "ui:blockDialog",
  UI_RollBlockDice = "ui:rollBlockDice",
  UI_BlockRollCancelled = "ui:blockRollCancelled",
  /** A lifted block die was clicked in the dice tray. */
  UI_BlockDieClicked = "ui:blockDieClicked",
  /** The dice tray: how many shown rolls have not landed yet. */
  UI_DiceInAir = "ui:diceInAir",
  /** The dice tray started, landed or finished showing one throw. */
  UI_DiceThrow = "ui:diceThrow",
  UI_SelectPushDirection = "ui:selectPushDirection",
  UI_PushDirectionSelected = "ui:pushDirectionSelected",
  UI_FollowUpPrompt = "ui:followUpPrompt",
  UI_FollowUpResponse = "ui:followUpResponse",
  UI_RerollResponse = "ui:rerollResponse",
  UI_ReactionResponse = "ui:reactionResponse",
  UI_InterceptionResponse = "ui:interceptionResponse",
  UI_ApothecaryResponse = "ui:apothecaryResponse",
  UI_RoutePreview = "ui:routePreview",
  UI_TargetRollPreview = "ui:targetRollPreview",
  /** The route the coach has plotted for the selected player, or none. */
  UI_MovePlan = "ui:movePlan",
  /** Walk the plotted route, as a second click on its last square does. */
  UI_GoMovePlan = "ui:goMovePlan",
  /** Drop the plotted route and keep the player selected. */
  UI_ClearMovePlan = "ui:clearMovePlan",
  /** A finger aimed a throw at a square: its rolls, before Go throws. */
  UI_ThrowAim = "ui:throwAim",
  UI_PassAimed = "ui:passAimed",
  UI_UpdateActionSteps = "ui:updateActionSteps",
  UI_ResumeBlitzMove = "ui:resumeBlitzMove",
  /** The Sports-Wizard's spell was picked; the pitch now picks its target. */
  UI_WizardTargeting = "ui:wizardTargeting",
  UI_ResumeBallAndChain = "ui:resumeBallAndChain",
  UI_KeepBlockDice = "ui:keepBlockDice",
  UI_TeamRerollBlock = "ui:teamRerollBlock",
  UI_ProRerollBlockDie = "ui:proRerollBlockDie",
  UI_BrawlerRerollBlockDie = "ui:brawlerRerollBlockDie",
  UI_VeteranRerollBlock = "ui:veteranRerollBlock",
  UI_StepSelected = "ui:stepSelected",

  // Kickoff event step (owning coach only)
  UI_KickoffEventSelectPlayer = "ui:kickoffEventSelectPlayer",
  UI_KickoffEventMovePlayer = "ui:kickoffEventMovePlayer",
  UI_KickoffEventPlacePlayer = "ui:kickoffEventPlacePlayer",
  UI_KickoffEventDeclareAction = "ui:kickoffEventDeclareAction",
  UI_KickoffEventConfirm = "ui:kickoffEventConfirm",
  UI_KickoffEventSkip = "ui:kickoffEventSkip",

  // State Events
  TeamUpdated = "team:updated",
  GameStateChanged = "game:stateChanged",
  PlayerUpdated = "player:updated",
}
