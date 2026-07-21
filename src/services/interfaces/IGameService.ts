import { GamePhase, GameState, SubPhase } from "@/types/GameState";
import { Player } from "@/types/Player";
import { Team } from "@/types/Team";
import { BlockResult } from "../../services/BlockResolutionService";
import { PassController } from "@/game/controllers/PassController";
import { CatchController } from "@/game/controllers/CatchController";
import { DiceController } from "@/game/controllers/DiceController";
import { ArmourController } from "@/game/controllers/ArmourController";
import { InjuryController } from "@/game/controllers/InjuryController";

export interface IGameService {
  getState(): GameState;
  getPhase(): GamePhase;
  getSubPhase(): SubPhase | undefined;
  getActiveTeamId(): string | null;
  getTurnNumber(teamId: string): number;

  // Controllers
  getPassController(): PassController;
  getCatchController(): CatchController;
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

  // Setup
  startSetup(startingTeamId?: string): void;
  placePlayer(playerId: string, x: number, y: number): boolean;
  removePlayer(playerId: string): void;
  swapPlayers(player1Id: string, player2Id: string): boolean;
  confirmSetup(teamId: string): void;
  isSetupComplete(teamId: string): boolean;
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
  ): void;
  rollKickoff(): void;
  /** Touchback: receiving coach hands the ball to one of their players */
  awardTouchback(playerId: string): boolean;
  isTouchbackPending(): boolean;

  // Game Actions
  startGame(kickingTeamId: string): void;
  startTurn(teamId: string): void;
  endTurn(): void;
  canActivate(playerId: string): boolean;
  hasPlayerActed(playerId: string): boolean;
  declareAction(
    playerId: string,
    action: import("@/types/events").ActionType
  ): boolean;
  movePlayer(playerId: string, path: { x: number; y: number }[]): Promise<void>;
  standUp(playerId: string): Promise<void>;

  previewBlock(attackerId: string, defenderId: string): void;
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
  foulPlayer(foulerId: string, targetX: number, targetY: number): Promise<void>;
  /** Stab Special Action: unmodifiable Armour Roll vs an adjacent Standing opponent */
  stabPlayer(attackerId: string, targetId: string): Promise<void>;
  /** Special activation actions (Breathe Fire, Projectile Vomit, Hypnotic Gaze, Chomp) */
  performSpecialAction(
    kind: "breatheFire" | "vomit" | "gaze" | "chomp",
    attackerId: string,
    targetId: string
  ): Promise<void>;

  attemptPickup(player: Player, position: { x: number; y: number }): boolean;
  throwInBall(from: { x: number; y: number }): void;
  /** Free move into the vacated square after a push (no cost, no dice) */
  followUpPush(
    attackerId: string,
    targetSquare: { x: number; y: number }
  ): void | Promise<void>;
  triggerTurnover(reason: string): void;

  /** Roll initial weather (seeded) without advancing the setup subphase */
  rollInitialWeather(): void;

  // Scoring / end of drive
  checkForTouchdown(playerId: string): boolean;
  endDrive(reason: "touchdown" | "halftime", nextKickingTeamId: string): void;
  resetDriveState(): void;
  rollKORecovery(): void;
  canCoinFlip(): boolean;

  // State Queries & Helpers
  getPlayerById(playerId: string): Player | undefined;
  getPlayerAt(x: number, y: number): Player | undefined;
  getOpponents(teamId: string): Player[];
  /** On-pitch team-mates of a player (any status), excluding the player. */
  getTeammates(playerId: string): Player[];
  getTeam(teamId: string): Team | undefined;
  getMovementUsed(playerId: string): number;
  getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[];
  setBallPosition(x: number, y: number): void;
  finishActivation(playerId: string): void;
}
