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
  rollBlockDice(
    attackerId: string,
    defenderId: string,
    numDice: number,
    isAttackerChoice: boolean
  ): void;
  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void;
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

  attemptPickup(player: Player, position: { x: number; y: number }): boolean;
  triggerTurnover(reason: string): void;

  // State Queries & Helpers
  getPlayerById(playerId: string): Player | undefined;
  getPlayerAt(x: number, y: number): Player | undefined;
  getOpponents(teamId: string): Player[];
  getTeam(teamId: string): Team | undefined;
  getMovementUsed(playerId: string): number;
  getAvailableMovements(
    playerId: string
  ): { x: number; y: number; cost?: number }[];
  setBallPosition(x: number, y: number): void;
  finishActivation(playerId: string): void;
}
