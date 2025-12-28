/**
 * Event Types for the Game
 *
 * Type-safe event definitions for communication between Phaser game logic
 * and React UI components via the EventBus.
 */

import { GamePhase, GameState, SubPhase } from "./GameState";
import { Team } from "./Team";
import { Player } from "./Player";
import { BlockResult } from "./Actions";

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
  TurnDataUpdated = "turnDataUpdated", // New event
  PlayerPlaced = "playerPlaced",
  PlayerRemoved = "playerRemoved",
  PlayersSwapped = "playersSwapped",
  PlayerMoved = "playerMoved",
  PlayerActivated = "playerActivated",
  PlayerSelected = "playerSelected",
  PlayerDeselected = "playerDeselected",
  PlacementInvalid = "placementInvalid",
  PlayerStatusChanged = "playerStatusChanged",
  Turnover = "turnover",
  BlockDiceRolled = "blockDiceRolled",
  ArmorRolled = "armorRolled",
  PlayerKnockedDown = "playerKnockedDown",
  PlayerStoodUp = "playerStoodUp",
  Touchdown = "touchdown",
  BallPlaced = "ballPlaced",
  BallKicked = "ballKicked",
  KickoffResult = "kickoffResult",
  BallPickup = "ballPickup",
  WeatherChanged = "weatherChanged",
  DiceRoll = "diceRoll",
  GameStateRestored = "gameStateRestored",
  RefreshBoard = "refreshBoard",

  // Pass/Catch Events
  PassDeclared = "passDeclared",
  PassAttempted = "passAttempted",
  PassCompleted = "passCompleted",
  PassFumbled = "passFumbled",
  PassIntercepted = "passIntercepted",
  CatchAttempted = "catchAttempted",
  CatchSucceeded = "catchSucceeded",
  CatchFailed = "catchFailed",
  BallScattered = "ballScattered",

  // Camera Events
  Camera_TrackBall = "camera:trackBall",
  Camera_Reset = "camera:reset",

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
  UI_EndTurn = "ui:endTurn",
  UI_PlacePlayer = "ui:placePlayer",
  UI_RemovePlayer = "ui:removePlayer",
  UI_ConfirmSetup = "ui:confirmSetup",
  UI_SceneChange = "ui:sceneChange",
  UI_LoadScenario = "ui:loadScenario",
  UI_StartGame = "ui:startGame",
  UI_StartCoinFlip = "ui:startCoinFlip",
  UI_CoinFlipComplete = "ui:coinFlipComplete",
  UI_RequestCoinFlipState = "ui:requestCoinFlipState",
  UI_ShowSetupControls = "ui:showSetupControls",
  UI_HideSetupControls = "ui:hideSetupControls",
  UI_SetupComplete = "ui:setupcomplete",
  UI_SetupAction = "ui:setupAction",
  UI_Notification = "ui:notification",
  UI_GameLog = "ui:gameLog",
  UI_RequestConfirmation = "ui:requestConfirmation",
  UI_ConfirmationResult = "ui:confirmationResult",
  UI_BlockResultSelected = "ui:blockResultSelected",
  UI_Turnover = "ui:turnover",
  UI_ShowPlayerInfo = "ui:showPlayerInfo",
  UI_HidePlayerInfo = "ui:hidePlayerInfo",
  UI_BlockDialog = "ui:blockDialog",
  UI_RollBlockDice = "ui:rollBlockDice",
  UI_SelectPushDirection = "ui:selectPushDirection",
  UI_PushDirectionSelected = "ui:pushDirectionSelected",
  UI_FollowUpPrompt = "ui:followUpPrompt",
  UI_FollowUpResponse = "ui:followUpResponse",

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
    results: any[]; // BlockResult[]
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

  [GameEventNames.PlayerStoodUp]: {
    playerId: string;
    cost: number;
  };

  // Scoring
  [GameEventNames.Touchdown]: { teamId: string; score: number };

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
  };
  [GameEventNames.KickoffResult]: { roll: number; event: string };
  [GameEventNames.BallPickup]: {
    playerId: string;
    success: boolean;
    roll: number;
    target: number;
  };
  [GameEventNames.WeatherChanged]: string;

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
  };
  [GameEventNames.PassCompleted]: {
    playerId: string;
    catcherId: string;
    position: { x: number; y: number };
  };
  [GameEventNames.PassFumbled]: {
    playerId: string;
    position: { x: number; y: number };
    bouncePosition: { x: number; y: number };
  };
  [GameEventNames.PassIntercepted]: {
    passerId: string;
    interceptorId: string;
    position: { x: number; y: number };
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

  // Game Flow
  [GameEventNames.DiceRoll]: {
    rollType: string; // e.g. "Weather", "Kickoff", "Armor Break", "Agility"
    diceType: string; // e.g. "2d6", "d6", "Block"
    teamId?: string; // The team performing the roll (for coloring)
    value: number | number[]; // Raw dice result(s)
    total: number; // Sum or relevant total
    description: string; // Text outcome e.g. "Nice Weather", "Scatter"
    passed?: boolean; // For tests (Armor, Agility, Dodge)
  };

  // Sandbox
  [GameEventNames.GameStateRestored]: GameState;
  [GameEventNames.RefreshBoard]: void;

  // Camera
  [GameEventNames.Camera_TrackBall]: {
    ballSprite: any; // Phaser.GameObjects.Container
    animationDuration: number; // How long to track the ball
  };
  [GameEventNames.Camera_Reset]: {
    duration?: number; // Optional reset duration
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
  [GameEventNames.UI_ActionSelected]: { action: ActionType; playerId: string };
  [GameEventNames.UI_ConfirmAction]: { actionId: string };
  [GameEventNames.UI_CancelAction]: void;
  [GameEventNames.UI_EndTurn]: void;

  // Setup
  [GameEventNames.UI_PlacePlayer]: { playerId: string; x: number; y: number };
  [GameEventNames.UI_RemovePlayer]: { playerId: string };
  [GameEventNames.UI_ConfirmSetup]: void;

  // Navigation
  [GameEventNames.UI_SceneChange]: { scene: string; data?: any };
  [GameEventNames.UI_LoadScenario]: { scenarioId: string };

  // Game Start
  [GameEventNames.UI_StartGame]: { team1: Team; team2: Team };

  // Coin Flip
  [GameEventNames.UI_StartCoinFlip]: { team1: Team; team2: Team };
  [GameEventNames.UI_CoinFlipComplete]: {
    kickingTeam: Team;
    receivingTeam: Team;
  };
  [GameEventNames.UI_RequestCoinFlipState]: void;

  // Setup Controls
  [GameEventNames.UI_ShowSetupControls]: {
    subPhase: SubPhase;
    activeTeam: { id: string; name: string };
  };
  [GameEventNames.UI_HideSetupControls]: void;
  [GameEventNames.UI_SetupComplete]: boolean;
  [GameEventNames.UI_SetupAction]: { action: string };

  // Common UI
  [GameEventNames.UI_Notification]: string;
  [GameEventNames.UI_GameLog]: string;

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

  [GameEventNames.UI_SelectPushDirection]: {
    defenderId: string;
    attackerId: string;
    validDirections: { x: number; y: number }[];
    canFollowUp: boolean;
    resultType?: string;
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
 * Action types available in the game
 */
export type ActionType =
  | "move"
  | "block"
  | "blitz"
  | "pass"
  | "handoff"
  | "foul"
  | "standUp"
  | "throwTeamMate"
  | "secureBall"
  | "special"
  | "forgoe";

/**
 * Helper type for event handlers
 */
export type EventHandler<K extends keyof AllEvents> = (
  data: AllEvents[K]
) => void;
