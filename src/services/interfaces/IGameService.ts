import { GamePhase, GameState, SubPhase } from "@/types/GameState";
import { Player } from "@/types/Player";
import { Team } from "@/types/Team";
import { BlockResult } from "../../services/BlockResolutionService";
import { PassController } from "@/game/controllers/PassController";
import { CatchController } from "@/game/controllers/CatchController";
import { BallMovementController } from "@/game/controllers/BallMovementController";
import { DiceController } from "@/game/controllers/DiceController";
import { ArmourController } from "@/game/controllers/ArmourController";
import { InjuryController } from "@/game/controllers/InjuryController";

export interface IGameService {
  getState(): GameState;
  getPhase(): GamePhase;
  getSubPhase(): SubPhase | undefined;
  getActiveTeamId(): string | null;
  getTurnNumber(teamId: string): number;
  /** Seed both teams' turn counters (sandbox scenarios starting mid-drive). */
  seedTurnCounts(turnNumber: number): void;
  captureTurnManagerState(): import("@/game/managers/TurnManager").TurnManagerState;
  restoreTurnManagerState(
    snapshot: import("@/game/managers/TurnManager").TurnManagerState
  ): void;

  // Controllers
  getPassController(): PassController;
  getCatchController(): CatchController;
  getBallMovementController(): BallMovementController;
  getDiceController(): DiceController;
  getArmourController(): ArmourController;
  getInjuryController(): InjuryController;
  getFoulController(): import("@/game/controllers/FoulController").FoulController;
  getFlowContext(): import("@/game/core/GameFlowManager").FlowContext;

  // Skill decisions (rerolls, reactions)
  getDecisionService(): import("@/game/skills").DecisionService;
  getRerollArbiter(): import("@/game/skills").RerollArbiter;
  /** Answer a pending reroll decision; false when none is pending */
  answerReroll(
    accept: boolean,
    source?: import("@/types/decisions").RerollSource
  ): boolean;
  /** Answer a pending reaction decision; false when none is pending */
  answerReaction(accept: boolean): boolean;
  /** Answer a pending interception decision; undefined playerId declines */
  answerInterception(playerId?: string): boolean;

  // Setup
  startSetup(startingTeamId?: string): void;
  placePlayer(playerId: string, x: number, y: number): boolean;
  removePlayer(playerId: string): void;
  swapPlayers(player1Id: string, player2Id: string): boolean;
  confirmSetup(teamId: string): boolean;
  isSetupComplete(teamId: string): boolean;
  getSetupStatus(
    teamId: string
  ): import("@/types/SetupTypes").SetupTeamStatus | undefined;
  getLastSetupError(): string | null;
  applySetupFormation(
    teamId: string,
    formation: import("@/types/SetupTypes").FormationPosition[]
  ): import("@/types/SetupTypes").SetupFormationResult;
  resolveSetupConcession(teamId: string, concede: boolean): boolean;
  getSetupZone(
    teamId: string
  ): import("@/types/SetupTypes").SetupZone | undefined;

  // Kickoff
  startKickoff(): void;
  selectKicker(playerId: string): void;
  kickBall(
    isTeam1Kicking: boolean,
    playerId: string,
    targetX: number,
    targetY: number
  ): Promise<void>;
  rollKickoff(): void;
  /** Touchback: receiving coach hands the ball to one of their players */
  awardTouchback(playerId: string): boolean;
  isTouchbackPending(): boolean;
  /** Interactive Sevens kickoff event currently awaiting its owning coach. */
  getKickoffEventStep(): import("@/game/kickoff/KickoffEventManager").KickoffEventStepState | null;
  selectKickoffEventPlayer(playerId: string): boolean;
  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean;
  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean;
  confirmKickoffEventStep(): boolean;
  skipKickoffEventStep(): boolean;

  // Game Actions
  startGame(kickingTeamId: string): void;
  startTurn(teamId: string): void;
  endTurn(): void;
  canActivate(playerId: string): boolean;
  hasPlayerActed(playerId: string): boolean;
  declareAction(
    playerId: string,
    action: import("@/types/events").ActionType,
    blockReplacement?: import("@/types/BlockReplacement").BlockReplacement
  ): boolean;
  /** Cancel a declaration only before movement/attack commitment. */
  cancelAction(playerId: string): boolean;
  movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void>;
  /** Leave the carried ball in a square vacated during this Move, no Turnover. */
  dropBallWithFumblerooski(
    playerId: string,
    square: { x: number; y: number }
  ): boolean;
  jumpPlayer(playerId: string, target: { x: number; y: number }): Promise<void>;
  standUp(playerId: string): Promise<void>;

  previewBlock(attackerId: string, defenderId: string): void;
  /** Multiple Block: resolve two marked opponents at -2 ST with no follow-up. */
  multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void>;
  /** May pause on a skill trigger decision — async engines await it */
  rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): void | Promise<void>;
  /** May pause on a skill trigger decision — async engines await it */
  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void | Promise<void>;
  /** Team Re-roll on a block: re-roll all the dice. */
  teamRerollBlock(attackerId: string): void;
  /** Pro on a block: re-roll a single die (3+ to use). */
  proRerollBlockDie(attackerId: string, dieIndex: number): void;
  executePush(
    attackerId: string,
    defenderId: string,
    direction: { x: number; y: number },
    resultType: string,
    followUp: boolean
  ): void;

  throwBall(
    passerId: string,
    targetX: number,
    targetY: number
  ): Promise<{ success: boolean; result?: string }>;
  /** Punt a carried ball in the chosen facing via the Throw-in Template. */
  puntBall(playerId: string, facingX: number, facingY: number): Promise<void>;
  foulPlayer(foulerId: string, targetX: number, targetY: number): Promise<void>;
  /** Stab Special Action: unmodifiable Armour Roll vs an adjacent Standing opponent */
  stabPlayer(attackerId: string, targetId: string): Promise<boolean>;
  /** Throw / Kick Team-mate Action: throw an eligible team-mate at an aim square */
  throwTeammate(
    throwerId: string,
    teammateId: string,
    x: number,
    y: number,
    mode?: "throw" | "kick"
  ): Promise<void>;
  /** Throw Bomb Special Action (Bombardier): lob a bomb at a target square */
  throwBomb(throwerId: string, x: number, y: number): Promise<void>;
  /** Ball & Chain Special Action (Fanatic): lurch up to MA in a chosen facing */
  ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void>;
  /** Special activation actions (Breathe Fire, Projectile Vomit, Hypnotic Gaze, Chomp) */
  performSpecialAction(
    kind: import("@/types/BlockReplacement").BlockReplacement | "gaze",
    attackerId: string,
    targetId: string
  ): Promise<boolean>;

  attemptPickup(player: Player, position: { x: number; y: number }): boolean;
  throwInBall(from: { x: number; y: number }): void;
  /** Free move into the vacated square after a push (no cost, no dice) */
  followUpPush(
    attackerId: string,
    targetSquare: { x: number; y: number }
  ): void | Promise<void>;
  triggerTurnover(reason: string): void;
  /** True after a turnover is latched, until the next turn begins. */
  isTurnoverInProgress(): boolean;

  /** Roll initial weather (seeded) without advancing the setup subphase */
  rollInitialWeather(): void;

  // Scoring / end of drive
  checkForTouchdown(playerId: string): boolean;
  endDrive(reason: "touchdown" | "halftime", nextKickingTeamId: string): void;
  resetDriveState(): void;
  /**
   * Roll KO recovery one player at a time. `beat` paces the sequence between
   * players; the promise resolves once every roll has been applied.
   */
  rollKORecovery(beat?: () => Promise<void>): Promise<void>;
  canCoinFlip(): boolean;

  // State Queries & Helpers
  getPlayerById(playerId: string): Player | undefined;
  getPlayerAt(x: number, y: number): Player | undefined;
  getOpponents(teamId: string): Player[];
  /** On-pitch team-mates of a player (any status), excluding the player. */
  getTeammates(playerId: string): Player[];
  getTeam(teamId: string): Team | undefined;
  /** Both teams in `team1`, `team2` order — the order snapshots use. */
  getTeams(): [Team, Team];
  getMovementUsed(playerId: string): number;
  /**
   * End or continue a blocker's activation once the block resolved. A plain
   * Block ends it; a Blitz block keeps the player active while MA+rush remains.
   */
  finishBlockActivation(playerId: string): void;
  /** The single block a Blitz allows has been spent this activation. */
  hasUsedBlitzBlock(playerId: string): boolean;
  getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[];
  setBallPosition(x: number, y: number): void;
  finishActivation(playerId: string): void;
}
