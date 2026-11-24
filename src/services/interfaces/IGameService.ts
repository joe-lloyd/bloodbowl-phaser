import type { KickoffRehearsal } from "@/game/kickoff/kickRecord";
import type { MoveReach } from "../../game/validators/jumpReach";
import type * as SetupTypes from "@/types/SetupTypes";
import type * as InducementTypes from "@/types/Inducements";
import { GamePhase, type GameState, SubPhase } from "@/types/GameState";
import { type Player } from "@/types/Player";
import { type Team } from "@/types/Team";
import { type BlockResult } from "../../services/BlockResolutionService";
import { PassController } from "@/game/controllers/PassController";
import { CatchController } from "@/game/controllers/CatchController";
import { BallMovementController } from "@/game/controllers/BallMovementController";
import { DiceController } from "@/game/controllers/DiceController";
import { ArmourController } from "@/game/controllers/ArmourController";
import { InjuryController } from "@/game/controllers/InjuryController";
import { type NextHalf } from "@/game/managers/TurnManager";
import type { MoveStep } from "../../headless/protocol";

export interface IGameService {
  getState(): GameState;
  getPhase(): GamePhase;
  getSubPhase(): SubPhase | undefined;
  getActiveTeamId(): string | null;
  getTurnNumber(teamId: string): number;

  seedTurnCounts(turnNumber: number): void;
  captureTurnManagerState(): import("@/game/managers/TurnManager").TurnManagerState;
  restoreTurnManagerState(
    snapshot: import("@/game/managers/TurnManager").TurnManagerState
  ): void;

  resyncSetupFromTeams(): void;

  getPassController(): PassController;
  getCatchController(): CatchController;
  getBallMovementController(): BallMovementController;
  getDiceController(): DiceController;
  getArmourController(): ArmourController;
  getInjuryController(): InjuryController;
  getFoulController(): import("@/game/controllers/FoulController").FoulController;
  getFlowContext(): import("@/game/core/GameFlowManager").FlowContext;

  getDecisionService(): import("@/game/skills").DecisionService;
  getRerollArbiter(): import("@/game/skills").RerollArbiter;

  answerReroll(
    accept: boolean,
    source?: import("@/types/decisions").RerollSource
  ): boolean;

  answerReaction(accept: boolean): boolean;

  answerBiteTarget(targetId?: string): boolean;

  answerInterception(playerId?: string): boolean;

  answerApothecary(accept: boolean): boolean;

  answerInducementChoice(
    answer: import("@/types/decisions").InducementChoiceDecisionAnswer
  ): boolean;

  answerFoulAssists(count: number): boolean;

  commitInducements(
    profile: InducementTypes.InducementRuleProfile,
    budgets: Record<string, number>,
    inventory: InducementTypes.InducementInventoryEntry[]
  ): void;

  getInducementOffer(): InducementTypes.InducementOffer;

  selectInducement(
    teamId: string,
    inducement: InducementTypes.Inducement,
    quantity: number
  ): InducementTypes.InducementCommandResponse;
  removeInducement(
    teamId: string,
    inducement: InducementTypes.Inducement
  ): InducementTypes.InducementCommandResponse;

  confirmInducements(teamId: string): InducementTypes.InducementCommandResponse;

  readonly runsCommandsLater?: boolean;

  startSetup(startingTeamId?: string): void;
  placePlayer(playerId: string, x: number, y: number): boolean;
  removePlayer(playerId: string): void;
  swapPlayers(player1Id: string, player2Id: string): boolean;
  confirmSetup(teamId: string): boolean;
  isSetupComplete(teamId: string): boolean;
  getSetupStatus(teamId: string): SetupTypes.SetupTeamStatus | undefined;
  getLastSetupError(): string | null;

  isSetupEligible(playerId: string): boolean;
  applySetupFormation(
    teamId: string,
    formation: SetupTypes.FormationPosition[]
  ): SetupTypes.SetupFormationResult;
  resolveSetupConcession(teamId: string, concede: boolean): boolean;
  getSetupZone(teamId: string): SetupTypes.SetupZone | undefined;

  startKickoff(): void;
  selectKicker(playerId: string): void;
  kickBall({
    isTeam1Kicking,
    playerId,
    targetX,
    targetY,
  }: {
    isTeam1Kicking: boolean;
    playerId: string;
    targetX: number;
    targetY: number;
  }): Promise<void>;

  awardTouchback(playerId: string): boolean;
  isTouchbackPending(): boolean;

  kickoffBounceTouchback(to: { x: number; y: number }): boolean;

  isKickoffTableResolving(): boolean;

  getKickoffEventStep():
    | import("@/game/kickoff/KickoffEventManager").KickoffEventStepState
    | null;
  selectKickoffEventPlayer(playerId: string): boolean;
  moveKickoffEventPlayer(playerId: string, x: number, y: number): boolean;
  placeKickoffEventPlayer(playerId: string, x: number, y: number): boolean;
  confirmKickoffEventStep(): boolean;
  skipKickoffEventStep(): boolean;
  reselectKickoffEventPlayers(): boolean;
  kickInTheAir(): Promise<void> | null;
  resumeKick(): Promise<void>;
  rehearseKickoffEvent(
    rehearsal: KickoffRehearsal & {
      isTeam1Kicking: boolean;
      landing: { x: number; y: number };
    }
  ): Promise<void>;

  startGame(kickingTeamId: string): void;
  startTurn(teamId: string): void;
  endTurn(): void;
  canActivate(playerId: string): boolean;
  hasPlayerActed(playerId: string): boolean;
  declareAction({
    playerId,
    action,
    blockReplacement,
    options,
  }: {
    playerId: string;
    action: import("@/types/events").ActionType;
    blockReplacement?: import("@/types/BlockReplacement").BlockReplacement;
    options?: { razzleDazzle?: boolean };
  }): boolean;

  cancelAction(playerId: string): boolean;

  commitAction(playerId: string): void;
  movePlayer(playerId: string, path: MoveStep[]): Promise<void>;

  dropBallWithFumblerooski(
    playerId: string,
    square: { x: number; y: number }
  ): boolean;
  jumpPlayer(playerId: string, target: { x: number; y: number }): Promise<void>;
  standUp(playerId: string): Promise<void>;

  previewBlock(attackerId: string, defenderId: string): void;

  multipleBlock(
    attackerId: string,
    defender1Id: string,
    defender2Id: string
  ): Promise<void>;

  rollBlockDice({
    attackerId,
    defenderId,
    numDice,
    isAttackerChoice,
  }: {
    attackerId: string;
    defenderId: string;
    numDice: number;
    isAttackerChoice: boolean;
  }): void | Promise<void>;

  resolveBlock(
    attackerId: string,
    defenderId: string,
    result: BlockResult
  ): void | Promise<void>;

  keepBlockDice(attackerId: string): void;
  teamRerollBlock(attackerId: string): void;

  proRerollBlockDie(attackerId: string, dieIndex: number): void;

  brawlerRerollBlockDie(attackerId: string): void;
  veteranRerollBlock(attackerId: string): void;
  executePush({
    attackerId,
    defenderId,
    direction,
    resultType,
    followUp,
  }: {
    attackerId: string;
    defenderId: string;
    direction: { x: number; y: number };
    resultType: string;
    followUp: boolean;
  }): void | Promise<void>;

  throwBall({
    passerId,
    targetX,
    targetY,
    hailMary,
  }: {
    passerId: string;
    targetX: number;
    targetY: number;
    hailMary?: boolean;
  }): Promise<{ success: boolean; result?: string }>;

  handOffBall(
    passerId: string,
    targetPlayerId: string
  ): Promise<{ success: boolean; result?: string }>;

  puntBall(playerId: string, facingX: number, facingY: number): Promise<void>;
  foulPlayer(foulerId: string, targetX: number, targetY: number): Promise<void>;

  stabPlayer(attackerId: string, targetId: string): Promise<boolean>;

  throwTeammate({
    throwerId,
    teammateId,
    x,
    y,
    mode,
    swoopFacing,
  }: {
    throwerId: string;
    teammateId: string;
    x: number;
    y: number;
    mode?: "throw" | "kick";
    swoopFacing?: import("../../game/rules/throwTeammate").SwoopFacing;
  }): Promise<void>;

  throwBomb(throwerId: string, x: number, y: number): Promise<void>;

  ballAndChain(
    fanaticId: string,
    facingX: number,
    facingY: number
  ): Promise<void>;

  ballAndChainCollision(
    square: import("../../game/operations/BallAndChainOperation").BallAndChainSquare,
    targetId: string
  ): Promise<void>;

  performSpecialAction(
    kind: import("@/types/BlockReplacement").BlockReplacement | "gaze",
    attackerId: string,
    targetId: string
  ): Promise<boolean>;

  attemptPickup(player: Player, position: { x: number; y: number }): boolean;
  throwInBall(
    from: { x: number; y: number },
    toward?: { x: number; y: number },
    kickoff?: boolean
  ): void;

  followUpPush(
    attackerId: string,
    targetSquare: { x: number; y: number }
  ): void | Promise<void>;
  triggerTurnover(reason: string): void;

  isTurnoverInProgress(): boolean;

  readyForWeather(teamId: string): boolean;

  beginCoinFlip(): void;

  checkForTouchdown(playerId: string): boolean;
  endDrive(reason: "touchdown" | "halftime", next: NextHalf): void;
  resetDriveState(): void;

  rollKORecovery(beat?: () => Promise<void>): Promise<void>;
  canCoinFlip(): boolean;

  tossCoin(): string;

  getPlayerById(playerId: string): Player | undefined;
  getPlayerAt(x: number, y: number): Player | undefined;
  getOpponents(teamId: string): Player[];

  getTeammates(playerId: string): Player[];
  getTeam(teamId: string): Team | undefined;

  getTeams(): [Team, Team];
  getMovementUsed(playerId: string): number;

  finishBlockActivation(playerId: string): void;

  finishStabActivation(playerId: string): Promise<void>;

  chargeBlitzBlockSquare(attackerId: string): Promise<boolean>;

  hasUsedBlitzBlock(playerId: string): boolean;
  getAvailableMovements(
    playerId: string,
    reach?: MoveReach
  ): { x: number; y: number; cost?: number }[];
  setBallPosition(x: number, y: number): void;
  finishActivation(playerId: string): void;
}
