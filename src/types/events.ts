/**
 * Event Types for the Game
 *
 * Type-safe event definitions for communication between Phaser game logic
 * and React UI components via the EventBus.
 */

import { GamePhase, GameState, SubPhase } from "./GameState";
import { Team } from "./Team";
import { Player } from "./Player";
import { BlockResult } from "../services/BlockResolutionService";
import { BoardLabel } from "../game/presentation/boardLabels";
import { SidelineCrewInfo } from "../game/presentation/sidelineStaff";

/**
 * Game Events - Emitted by GameService/Phaser
 * React components subscribe to these to update UI
 */
/**
 * Event Names Enum for Autocompletion
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
  TurnDataUpdated = "turnDataUpdated", // New event
  PlayerPlaced = "playerPlaced",
  PlayerRemoved = "playerRemoved",
  PlayersSwapped = "playersSwapped",
  PlayerMoved = "playerMoved",
  PlayerActivated = "playerActivated",
  PlayerSelected = "playerSelected",
  PlayerDeselected = "playerDeselected",
  PlacementInvalid = "placementInvalid",
  SetupRestrictionsUpdated = "setupRestrictionsUpdated",
  SetupConcessionOffered = "setupConcessionOffered",
  SetupConcessionResolved = "setupConcessionResolved",
  PlayerStatusChanged = "playerStatusChanged",
  Turnover = "turnover",
  BlockDiceRolled = "blockDiceRolled",
  ArmorRolled = "armorRolled",
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
  /** The engine paused on a mid-action decision (reroll offer, reaction) */
  DecisionRequested = "decisionRequested",
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
  DiceRoll = "diceRoll",
  GameStateRestored = "gameStateRestored",
  RefreshBoard = "refreshBoard",
  /** Crisp text (dugout headers, end-zone names) for the React overlay */
  UI_BoardLabels = "ui:boardLabels",

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
  UI_StartCoinFlip = "ui:startCoinFlip",
  UI_ShowCoinFlip = "ui:showCoinFlip",
  UI_CoinFlipComplete = "ui:coinFlipComplete",
  UI_RequestCoinFlipState = "ui:requestCoinFlipState",
  UI_ShowSetupControls = "ui:showSetupControls",
  UI_HideSetupControls = "ui:hideSetupControls",
  /** Online: re-render the pitch from the authoritative snapshot so a
   *  player watching the opponent's setup/placement sees it live. */
  UI_SyncBoard = "ui:syncBoard",
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
  UI_SelectPushDirection = "ui:selectPushDirection",
  UI_PushDirectionSelected = "ui:pushDirectionSelected",
  UI_FollowUpPrompt = "ui:followUpPrompt",
  UI_FollowUpResponse = "ui:followUpResponse",
  UI_RerollResponse = "ui:rerollResponse",
  UI_ReactionResponse = "ui:reactionResponse",
  UI_InterceptionResponse = "ui:interceptionResponse",
  UI_ApothecaryResponse = "ui:apothecaryResponse",
  UI_UpdateActionSteps = "ui:updateActionSteps",
  UI_ResumeBlitzMove = "ui:resumeBlitzMove",
  UI_TeamRerollBlock = "ui:teamRerollBlock",
  UI_ProRerollBlockDie = "ui:proRerollBlockDie",
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

/**
 * Game Events - Emitted by GameService/Phaser
 * React components subscribe to these to update UI
 */
export interface GameEvents {
  // Phase Management
  [GameEventNames.PhaseChanged]: {
    phase: GamePhase;
    subPhase?: SubPhase;
    activeTeamId?: string;
  };
  [GameEventNames.SetupConfirmed]: string; // teamId
  [GameEventNames.KickoffStarted]: void;
  [GameEventNames.ReadyToStart]: void;

  // Turn Management
  [GameEventNames.TurnStarted]: {
    teamId: string;
    turnNumber: number;
    isHalf2?: boolean; // Optional if not always present
  };
  [GameEventNames.TurnEnded]: { teamId: string };
  [GameEventNames.ActionResolved]: { playerId: string };
  [GameEventNames.TurnDataUpdated]: {
    hasBlitzed: boolean;
    hasPassed: boolean;
    hasHandedOff: boolean;
    hasFouled: boolean;
  };

  // Player Actions
  [GameEventNames.PlayerPlaced]: { playerId: string; x: number; y: number };
  [GameEventNames.PlayerRemoved]: string; // playerId
  [GameEventNames.PlayersSwapped]: { player1Id: string; player2Id: string };
  [GameEventNames.PlacementInvalid]: {
    playerId: string;
    x: number;
    y: number;
    reason: string;
  };
  [GameEventNames.SetupRestrictionsUpdated]: import("./SetupTypes").SetupTeamStatus;
  [GameEventNames.SetupConcessionOffered]: {
    teamId: string;
    availablePlayerCount: number;
  };
  [GameEventNames.SetupConcessionResolved]: {
    teamId: string;
    conceded: boolean;
    penaltyFree: true;
  };
  [GameEventNames.PlayerMoved]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    path?: { x: number; y: number }[]; // Optional depending on usage, but GameService seems to emit it?
    followUpData?: {
      // Optional follow-up data for blocks
      attackerId: string;
      targetSquare: { x: number; y: number };
    };
    /** Where the ball visual starts when the mover carries it (their start
     * square, or the pickup square for a mid-path pickup) */
    ballFrom?: { x: number; y: number };
    /** Squares the ball travels with the carrier (tail of `path`) */
    ballPath?: { x: number; y: number }[];
    /** Player steps walked before the ball joins (0 = carried from start) */
    ballJoinStep?: number;
    /** The player is being thrown (Throw Team-mate): animate an arc, not a walk. */
    thrown?: boolean;
  };
  [GameEventNames.PlayerActivated]: string; // playerId
  [GameEventNames.PlayerSelected]: { player: Player | null };
  [GameEventNames.PlayerStatusChanged]: Player;
  [GameEventNames.Turnover]: { teamId: string };

  // Block Events
  [GameEventNames.BlockDiceRolled]: {
    attackerId: string;
    defenderId: string;
    numDice: number;
    isAttackerChoice: boolean;
    results: BlockResult[];
  };

  [GameEventNames.ArmorRolled]: {
    playerId: string;
    roll: number;
    armor: number;
    broken: boolean;
  };

  [GameEventNames.PlayerKnockedDown]: {
    playerId: string;
    // ... details?
  };

  [GameEventNames.PlayerThrowGesture]: {
    playerId: string;
    /** "throw" tips the thrower forward; "kick" swings a little kick */
    mode: "throw" | "kick";
    /** +1 if the target is to the right, -1 to the left (tilt direction) */
    dir: number;
  };

  [GameEventNames.SkillTriggered]: {
    playerId: string;
    skill: string;
    effect: string;
  };

  [GameEventNames.RerollUsed]: {
    playerId: string;
    source: "skill" | "team" | "pro";
    rollKind: string;
    skill?: string;
    /** Die result before and after the reroll */
    before: number;
    after: number;
  };

  [GameEventNames.DecisionRequested]: import("./decisions").DecisionRequest;

  [GameEventNames.PlayerStoodUp]: {
    playerId: string;
    cost: number;
  };

  // Scoring
  [GameEventNames.Touchdown]: {
    teamId: string;
    score: number;
    /** Absent for a touchdown awarded by a post-match/concession rule. */
    scorerId?: string;
  };
  [GameEventNames.PlayerCasualtyInflicted]: {
    causerId?: string;
    victimId: string;
    cause: "block" | "special" | "dodge" | "crowd" | "lethal-flight";
    sppEligible: boolean;
  };
  [GameEventNames.PlayerKilled]: {
    causerId?: string;
    victimId: string;
  };

  // End of drive
  [GameEventNames.KORecoveryRolled]: {
    playerId: string;
    roll: number;
    recovered: boolean;
  };
  [GameEventNames.PlayerPushedIntoCrowd]: {
    playerId: string;
    exitSquare: { x: number; y: number };
  };
  /** Kickoff landed out of bounds / in the kicking half: the receiving
   * coach hands the ball to any of their players on the pitch (p.71). */
  [GameEventNames.TouchbackAwarded]: { teamId: string };
  [GameEventNames.BallThrownIn]: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    distance: number;
  };
  [GameEventNames.DriveEnded]: {
    reason: "touchdown" | "halftime";
    nextKickingTeamId: string | null;
  };

  // Ball
  [GameEventNames.BallPlaced]: { x: number; y: number };
  [GameEventNames.BallKicked]: {
    playerId: string;
    targetX: number;
    targetY: number;
    direction: number;
    distance: number;
    finalX: number;
    finalY: number;
    isTouchback: boolean;
  };
  [GameEventNames.KickoffAirbornePositionChanged]: {
    x: number;
    y: number;
  };
  [GameEventNames.KickoffBallLanding]: {
    /** Null when the deviation produced a touchback instead of a landing. */
    landingSquare: { x: number; y: number } | null;
    isTouchback: boolean;
  };
  [GameEventNames.KickoffSequenceCompleted]: {
    isTouchback: boolean;
  };
  [GameEventNames.KickoffResult]: {
    roll: number;
    /** The resolved Sevens kickoff-table event. */
    event: import("../game/kickoff/kickoffEvents").KickoffEvent;
    /** Plain rulebook statement of what the event does. */
    meaning: string;
    /** Structured account of what each team received. */
    outcome: import("../game/kickoff/kickoffEvents").KickoffEventOutcome;
  };
  [GameEventNames.KickoffEventStepStarted]: {
    event: import("../game/kickoff/kickoffEvents").KickoffEvent;
    /** The coach who may act (kicking or receiving team). */
    teamId: string;
    /** D3+1 — how many players the coach may select. */
    selectionLimit: number;
    /** High Kick only: the square the ball will land in. */
    landingSquare?: { x: number; y: number };
  };
  [GameEventNames.KickoffEventStepResolved]: {
    event: import("../game/kickoff/kickoffEvents").KickoffEvent;
    teamId: string;
    skipped: boolean;
  };
  [GameEventNames.DriveEffectGranted]: {
    teamId: string;
    /** Short effect id, e.g. "bribe", "free-reroll", "offensive-assist". */
    effect: string;
    /** Legible detail, e.g. "one free team re-roll for this drive". */
    detail: string;
  };
  [GameEventNames.DriveEffectExpired]: {
    teamId: string;
    effect: string;
    detail: string;
  };
  [GameEventNames.BallPickup]: {
    playerId: string;
    success: boolean;
    roll: number;
    target: number;
  };
  [GameEventNames.WeatherChanged]: string;

  /**
   * Punt has rolled its direction and distance and knows where the ball will
   * end up, but has not moved it yet. Emitted before ball placement/scatter so
   * a graphical client can play the kick; the outcome carried here is final
   * and is never re-rolled when the operation resumes.
   */
  [GameEventNames.PuntDeclared]: {
    playerId: string;
    presentationId: string;
    from: { x: number; y: number };
    direction: { x: number; y: number };
    distance: number;
    landing: { x: number; y: number };
    /** The kick leaves the pitch and becomes a throw-in. */
    intoCrowd: boolean;
  };
  [GameEventNames.UI_PresentationAcknowledged]: { id: string };

  // Pass/Catch Events
  [GameEventNames.PassDeclared]: {
    playerId: string;
    targetX: number;
    targetY: number;
  };
  [GameEventNames.PassAttempted]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    passType: string;
    accurate: boolean;
    finalPosition: { x: number; y: number };
    scatterPath?: { x: number; y: number }[];
  };
  [GameEventNames.PassCompleted]: {
    playerId: string;
    catcherId: string;
    position: { x: number; y: number };
  };
  /** A thrown bomb flies from the Bomber's square to where it comes to rest. */
  [GameEventNames.BombThrown]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  };
  /** A bomb explodes on a square, covering it and its eight neighbours. */
  [GameEventNames.BombExploded]: {
    x: number;
    y: number;
  };
  [GameEventNames.PassFumbled]: {
    playerId: string;
    position: { x: number; y: number };
    bouncePosition: { x: number; y: number };
  };
  [GameEventNames.InterceptionAttempted]: {
    passerId: string;
    interceptorId: string;
    /** Net modifier the interceptor rolls at (base -3/-2 plus marking). */
    modifier: number;
  };
  [GameEventNames.PassIntercepted]: {
    passerId: string;
    interceptorId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.ThrowTeammateLanded]: {
    throwerId: string;
    thrownPlayerId: string;
    safeLanding: boolean;
    superbThrow: boolean;
  };
  [GameEventNames.MvpAwarded]: {
    teamId: string;
    playerId: string;
    roll: number;
  };
  [GameEventNames.AwardedTouchdownAssigned]: {
    teamId: string;
    playerId: string;
  };
  [GameEventNames.CompetitionResultRecorded]: {
    fixtureId: string;
  };
  [GameEventNames.InterceptionFailed]: {
    passerId: string;
    interceptorId: string;
    roll: number;
  };
  [GameEventNames.CatchAttempted]: {
    playerId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.CatchSucceeded]: {
    playerId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.CatchFailed]: {
    playerId: string;
    position: { x: number; y: number };
    reason: string;
  };
  [GameEventNames.BallScattered]: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    reason: string;
  };

  // Action Mode Events
  [GameEventNames.ActionModeChanged]: {
    playerId: string;
    action: ActionType;
    blockReplacement?: import("./BlockReplacement").BlockReplacement;
    autoSelectMove: boolean;
  };
  [GameEventNames.PlayerMovedInAction]: {
    playerId: string;
  };
  [GameEventNames.PassZoneHovered]: {
    playerId: string;
    targetSquare: { x: number; y: number };
    passType: string; // PassType from PassController
  };

  // Game Flow
  [GameEventNames.DiceRoll]: {
    rollType: string; // e.g. "Weather", "Kickoff", "Armor Break", "Agility"
    diceType: string; // e.g. "2d6", "d6", "Block"
    teamId?: string; // The team performing the roll (for coloring)
    value: number | number[] | string | string[]; // Raw dice result(s)
    total: number; // Sum or relevant total
    description: string; // Text outcome e.g. "Nice Weather", "Scatter"
    resultState?: "none" | "success" | "failure" | "fumble"; // For tests (Armor, Agility, Dodge, Pass)
    seed?: number; // For deterministic replay tracking
    context?: Record<string, unknown>; // Additional metadata
  };

  // Sandbox
  [GameEventNames.GameStateRestored]: GameState;
  [GameEventNames.RefreshBoard]: void;
  /** Board text (dugout section headers, sideline crew, end-zone team names)
   *  positioned in canvas design space for the React overlay to draw crisply. */
  [GameEventNames.UI_BoardLabels]: { labels: BoardLabel[] };
  [GameEventNames.ScenarioLoaded]: {
    name: string;
    seed?: number;
    expectedOutcome?: string;
  };

  // Camera
  [GameEventNames.Camera_TrackBall]: {
    ballSprite: unknown; // Phaser.GameObjects.Container
    animationDuration: number; // How long to track the ball
  };
  [GameEventNames.Camera_Reset]: {
    duration?: number; // Optional reset duration
  };
  [GameEventNames.Camera_StateChanged]: {
    state: "neutral" | "active";
    /** The camera's own transition duration, so consumers animate in step. */
    duration: number;
  };
}

/**
 * UI Events - Emitted by React components
 * GameService/Phaser subscribes to these to handle user actions
 */
export interface UIEvents {
  // Team Builder
  [GameEventNames.UI_PlayerHired]: { position: string };
  [GameEventNames.UI_PlayerFired]: { playerId: string };
  [GameEventNames.UI_TeamSaved]: { team: Team };
  [GameEventNames.UI_TeamNameChanged]: { name: string };
  [GameEventNames.UI_TeamColorChanged]: { primary: number; secondary: number };
  [GameEventNames.UI_RerollPurchased]: void;

  // Game Actions
  [GameEventNames.UI_ActionSelected]: {
    action: ActionType;
    playerId: string;
    blockReplacement?: import("./BlockReplacement").BlockReplacement;
  };
  [GameEventNames.UI_ConfirmAction]: { actionId: string };
  [GameEventNames.UI_CancelAction]: void;
  [GameEventNames.UI_EndActivation]: void;
  [GameEventNames.UI_EndTurn]: void;

  // Setup
  [GameEventNames.UI_PlacePlayer]: { playerId: string; x: number; y: number };
  [GameEventNames.UI_RemovePlayer]: { playerId: string };
  [GameEventNames.UI_ConfirmSetup]: void;

  [GameEventNames.UI_LoadScenario]: {
    /** A core scenario id or a rule-catalog configuration id */
    scenarioId: string;
    /** Seed override (e.g. found by the outcome seed search) */
    seed?: number;
    /** Rule-catalog outcome id whose name is surfaced after load */
    outcomeId?: string;
  };

  // Game Start
  [GameEventNames.UI_StartGame]: { team1: Team; team2: Team };

  // Coin Flip
  [GameEventNames.UI_StartCoinFlip]: { team1: Team; team2: Team };
  [GameEventNames.UI_ShowCoinFlip]: void;
  [GameEventNames.UI_CoinFlipComplete]: {
    kickingTeam: Team;
    receivingTeam: Team;
  };
  [GameEventNames.UI_RequestCoinFlipState]: void;

  // Setup Controls
  [GameEventNames.UI_ShowSetupControls]: {
    subPhase: SubPhase;
    activeTeam: { id: string; name: string };
    status?: import("./SetupTypes").SetupTeamStatus;
  };
  [GameEventNames.UI_HideSetupControls]: void;
  [GameEventNames.UI_SyncBoard]: void;
  [GameEventNames.UI_SetupComplete]: boolean;
  [GameEventNames.UI_SetupAction]: { action: string; name?: string };
  /** The formations pickable for the team currently setting up */
  [GameEventNames.UI_FormationsUpdated]: {
    formations: { name: string; builtIn: boolean }[];
  };

  // Common UI
  /** @deprecated see the enum member's doc comment. */
  [GameEventNames.UI_Notification]: string;
  [GameEventNames.UI_GameLog]: string;
  [GameEventNames.UI_LogEntry]: {
    category: LogEntryCategory;
    /** Names the result, e.g. "Sweltering Heat", "Quick Snap". */
    headline: string;
    /** What the result means in play, authored by the resolving rule. */
    detail?: string;
    /** The roll that produced this outcome, when there was one. */
    roll?: number | number[];
    /** Set only when the outcome is attributable to one coach's team. */
    teamId?: string;
  };
  [GameEventNames.UI_Announce]: {
    kind: AnnouncementKind;
    headline: string;
    subtitle?: string;
  };
  [GameEventNames.UI_SkipDriveSequence]: void;

  // Confirmation
  [GameEventNames.UI_RequestConfirmation]: {
    actionId: string;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    risky?: boolean;
  };

  [GameEventNames.UI_ConfirmationResult]: {
    confirmed: boolean;
    actionId: string;
  };

  // Block
  [GameEventNames.UI_BlockResultSelected]: {
    attackerId: string;
    defenderId: string;
    result: BlockResult;
  };

  // Turnover Visuals
  [GameEventNames.UI_Turnover]: { teamId: string; reason: string };

  // Player Info
  [GameEventNames.UI_ShowPlayerInfo]: Player;
  [GameEventNames.UI_HidePlayerInfo]: void;
  [GameEventNames.UI_ShowInfo]: InfoPanelSubject;

  // Block
  [GameEventNames.UI_BlockDialog]: {
    attackerId: string;
    defenderId: string;
    analysis: import("./Actions").BlockAnalysis;
  };

  [GameEventNames.UI_RollBlockDice]: {
    attackerId: string;
    defenderId: string;
    numDice: number;
    isAttackerChoice: boolean;
  };

  /** The requested block roll will not happen (illegal, no movement left,
   * rush declined/failed) — dialogs waiting on dice must close. */
  [GameEventNames.UI_BlockRollCancelled]: void;

  [GameEventNames.UI_SelectPushDirection]: {
    defenderId: string;
    attackerId: string;
    validDirections: { x: number; y: number }[];
    canFollowUp: boolean;
    resultType?: string;
    /** Team whose coach places the push (the pushed player's on Sidestep) */
    chooserTeamId?: string;
    /** Which rulebook tier the offered squares are: open, chain, or crowd */
    pushTier?: "open" | "chain" | "crowd";
  };

  [GameEventNames.UI_PushDirectionSelected]: {
    defenderId: string;
    direction: { x: number; y: number };
    canFollowUp: boolean;
  };

  [GameEventNames.UI_FollowUpPrompt]: {
    attackerId: string;
    targetSquare: { x: number; y: number };
  };

  [GameEventNames.UI_FollowUpResponse]: {
    attackerId: string;
    followUp: boolean;
    targetSquare?: { x: number; y: number };
  };

  [GameEventNames.UI_RerollResponse]: import("./decisions").RerollDecisionAnswer;
  [GameEventNames.UI_ReactionResponse]: import("./decisions").ReactionDecisionAnswer;
  [GameEventNames.UI_InterceptionResponse]: import("./decisions").InterceptionDecisionAnswer;
  [GameEventNames.UI_ApothecaryResponse]: import("./decisions").ApothecaryDecisionAnswer;

  [GameEventNames.UI_UpdateActionSteps]: {
    currentStepId: string;
    steps: { id: string; label: string }[];
  };

  /** A Blitz block resolved with movement left — resume the move. */
  [GameEventNames.UI_ResumeBlitzMove]: {
    playerId: string;
  };

  /** Spend a Team Re-roll on a block (re-roll all the dice). */
  [GameEventNames.UI_TeamRerollBlock]: { attackerId: string };
  /** Spend Pro on a block (re-roll one die). */
  [GameEventNames.UI_ProRerollBlockDie]: {
    attackerId: string;
    dieIndex: number;
  };

  [GameEventNames.UI_StepSelected]: {
    stepId: string;
  };

  // Kickoff event step (owning coach only)
  [GameEventNames.UI_KickoffEventSelectPlayer]: { playerId: string };
  [GameEventNames.UI_KickoffEventMovePlayer]: {
    playerId: string;
    x: number;
    y: number;
  };
  [GameEventNames.UI_KickoffEventPlacePlayer]: {
    playerId: string;
    x: number;
    y: number;
  };
  /** Charge! only: declare the current player's free action. */
  [GameEventNames.UI_KickoffEventDeclareAction]: {
    playerId: string;
    action: ActionType;
  };
  [GameEventNames.UI_KickoffEventConfirm]: void;
  [GameEventNames.UI_KickoffEventSkip]: void;
}

/**
 * State Update Events - For synchronizing state
 */
export interface StateEvents {
  [GameEventNames.TeamUpdated]: { team: Team };
  [GameEventNames.GameStateChanged]: { state: GameState };
  [GameEventNames.PlayerUpdated]: { player: Player };
}

/**
 * All Events - Union of all event types
 */
export type AllEvents = GameEvents & UIEvents & StateEvents;

/**
 * Categories for UI_LogEntry. "info" is the deprecated-alias catch-all for
 * text that has not (yet) been authored with a richer category.
 */
export type LogEntryCategory =
  | "weather"
  | "kickoff"
  | "skill"
  | "reroll"
  | "score"
  | "drive"
  | "action"
  | "info";

/**
 * The closed set of structural transitions the announcer may show. This
 * union is the only entry point — there is no way to raise an announcement
 * outside these four kinds.
 */
export type AnnouncementKind =
  | "turn-started"
  | "round-passed"
  | "halftime"
  | "full-time";

/**
 * Action types available in the game
 */
export type ActionType =
  | "move"
  | "block"
  | "multipleBlock"
  | "blitz"
  | "pass"
  | "punt"
  | "handoff"
  | "foul"
  | "standUp"
  | "throwTeamMate"
  | "secureBall"
  | "special"
  | "stab"
  | "breatheFire"
  | "vomit"
  | "gaze"
  | "chomp"
  | "chainsaw"
  | "throwBomb"
  | "ballAndChain"
  | "forgoe";

/**
 * Discriminated subject for the info panel: a player, or a sideline crew
 * figure (a staff type, or the empty-rail placeholder). Kept as a sibling of
 * the `Player`-typed `UI_ShowPlayerInfo` payload rather than widening it, so
 * existing player-only subscribers do not have to narrow a union.
 */
export type InfoPanelSubject =
  | { kind: "player"; player: Player }
  | { kind: "sidelineCrew"; crew: SidelineCrewInfo };

/**
 * Helper type for event handlers
 */
export type EventHandler<K extends keyof AllEvents> = (
  data: AllEvents[K]
) => void;
