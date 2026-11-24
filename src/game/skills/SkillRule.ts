import { type Player } from "../../types/Player";
import { type ActionType } from "../../types/events";
import {
  type BlockResult,
  type BlockResultType,
} from "../../services/BlockResolutionService";
import { type RerollableRollKind } from "../../types/decisions";
import { DecisionService } from "./DecisionService";
import { RerollArbiter } from "./RerollArbiter";
import { GameOperation } from "../core/GameOperation";
import { DiceController } from "../controllers/DiceController";
import { InjuryResult } from "../controllers/InjuryController";
import { type InjuryTableKind } from "../rules/injuryTables";
import type { CasualtyCause } from "../rules/plagueRidden";

interface SkillTriggerRecord {
  playerId: string;
  skill: string;
  effect: string;
}

interface FlowLike {
  add(operation: GameOperation, next?: boolean): void;
}

interface TriggerContextBase {
  triggers: SkillTriggerRecord[];

  decisions?: DecisionService;

  flow?: FlowLike;

  arbiter?: RerollArbiter;

  dice?: DiceController;
}

export interface DodgeDeclaredContext extends TriggerContextBase {
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };

  modifiers: number;

  markingPenalty: number;

  skillRerollAllowed: boolean;

  escapeCancelled?: boolean;
}

export interface DodgeResolvedContext extends TriggerContextBase {
  player: Player;

  from: { x: number; y: number };
  to: { x: number; y: number };

  naturalRoll: number;
  target: number;

  modifiers: number;

  success: boolean;

  proneInVacated?: string;

  followInto?: string;
}

export interface BlockDeclaredContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;

  diceCount: number;
  isAttackerChoice: boolean;

  attackerStrength: number;

  defenderStrength: number;

  isBlitz: boolean;
  isBallAndChain: boolean;

  cancelled: boolean;

  allPlayers: Player[];

  relocateDefenderTo?: { x: number; y: number };
}

export interface BlockDiceRolledContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;

  results: BlockResult[];
  isAttackerChoice: boolean;

  rerolls: { skill: string; before: string[]; after: string[] }[];
}

export interface PushContext extends TriggerContextBase {
  attacker: Player;
  pushed: Player;
  resultType: BlockResultType;

  isBlitz: boolean;

  pushedHasBall: boolean;

  blockerIgnoresReactions: boolean;

  chainPush?: boolean;

  refused: boolean;

  preventFollowUp: boolean;

  stripBall: boolean;

  eyeGouge: boolean;

  grabPush: boolean;

  sideStepPush: boolean;

  forceFollowUp: boolean;
}

export interface BlockResultContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;
  resultType: BlockResultType;

  isBlitz: boolean;

  attackerKnockedDown: boolean;

  defenderKnockedDown: boolean;

  placedProne?: boolean;

  treatAsPush?: boolean;

  suppressReactions?: boolean;

  saboteurExploded?: boolean;
}

export interface PickupContext extends TriggerContextBase {
  player: Player;

  marking: number;

  weather: number;

  agilityTest: boolean;

  modifiers: number;

  autoFail?: boolean;
}

export interface CatchContext extends TriggerContextBase {
  player: Player;

  marking: number;
  modifiers: number;
  autoFail?: boolean;
  origin?: "pass" | "handoff" | "throw-in" | "kick-off" | "bounce";

  isPassTarget?: boolean;

  divingCatch?: boolean;
}

export interface PassDeclaredContext extends TriggerContextBase {
  player: Player;
  passType: string;

  hailMary: boolean;

  marking: number;

  modifiers: number;

  targetPlayer?: Player;

  refused?: boolean;

  suppressInterception?: boolean;

  cloudBurster?: boolean;
}

export interface HandoffDeclaredContext extends TriggerContextBase {
  player: Player;
  targetPlayer: Player;

  refused?: boolean;
}

export interface PassResultContext extends TriggerContextBase {
  player: Player;
  roll: number;
  fumbled: boolean;
  accurate: boolean;

  keepBall?: boolean;
}

export interface FollowUpContext extends TriggerContextBase {
  attacker: Player;
  targetSquare: { x: number; y: number };
}

export interface ArmourBreakContext extends TriggerContextBase {
  player: Player;

  causedBy?: Player;

  cause?: CasualtyCause;

  vacatedSquare?: { x: number; y: number };

  knockedDown: boolean;

  roll: number;

  armourModifier: number;

  injuryModifier: number;

  forcedBreak?: boolean;

  mightyBlow?: { playerId: string; bonus: number };

  modifiersLocked?: boolean;

  broken: boolean;
}

export interface InjuryRollContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;

  roll: number;

  modifier: number;

  table: InjuryTableKind;

  koDowngrade?: SkillTriggerRecord;

  result: InjuryResult;
}

export interface CasualtyContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  cause?: CasualtyCause;

  regenerated?: boolean;

  regenerationRoll?: number;
}

export interface CountAssistContext {
  assister: Player;

  opponent: Player;

  action: "block" | "foul";

  activeTeamId: string | null;

  markers: Player[];

  negated: boolean;

  triggers: SkillTriggerRecord[];
}

export interface ActionDeclaredContext {
  player: Player;

  action: ActionType;

  hasBall: boolean;

  refused: boolean;

  triggers: SkillTriggerRecord[];
}

type ActivationGateFailure =
  | { kind: "distracted" }
  | { kind: "endActivation" }
  | { kind: "rooted" }
  | { kind: "lashOut" }
  | { kind: "squigRage" }
  | { kind: "bloodlust" };

export interface ActivationGate {
  skill: string;

  target: number;

  modifier: number;
  onFail: ActivationGateFailure;
}

export interface ActivationDeclaredContext {
  player: Player;
  action: ActionType;

  teammates: Player[];
  gates: ActivationGate[];
}

export interface RushDeclaredContext extends TriggerContextBase {
  player: Player;
  modifiers: number;
}

export interface JumpDeclaredContext extends TriggerContextBase {
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };

  over: { x: number; y: number };

  negativeModifier: number;

  bonusModifier: number;

  escapeCancelled?: boolean;
}

export type JumpResolvedContext = Omit<DodgeResolvedContext, "followInto">;

export interface StandUpRollContext extends TriggerContextBase {
  player: Player;

  teammates: Player[];

  opponents: Player[];
  modifiers: number;
}

export interface TurnEndingContext {
  endingTeamId: string;

  players: Player[];
  dice: DiceController;

  rolledFor: Set<string>;

  standUp: string[];
  triggers: SkillTriggerRecord[];
}

export interface TeamRerollGateContext {
  player: Player;
  dice: DiceController;

  allowed: boolean;
  triggers: SkillTriggerRecord[];
}

export interface SkillRule {
  rerollable?: RerollableRollKind[];

  onDodgeDeclared?(
    ctx: DodgeDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onDodgeResolved?(
    ctx: DodgeResolvedContext,
    self: Player
  ): void | Promise<void>;

  onDodgeSucceeded?(
    ctx: DodgeResolvedContext,
    self: Player
  ): void | Promise<void>;
  onPickup?(ctx: PickupContext, self: Player): void | Promise<void>;
  onCatch?(ctx: CatchContext, self: Player): void | Promise<void>;
  onPassDeclared?(ctx: PassDeclaredContext, self: Player): void | Promise<void>;
  onPassResult?(ctx: PassResultContext, self: Player): void | Promise<void>;

  onHandoffDeclared?(
    ctx: HandoffDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onBlockDeclared?(
    ctx: BlockDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onBlockDiceRolled?(
    ctx: BlockDiceRolledContext,
    self: Player
  ): void | Promise<void>;
  onPush?(ctx: PushContext, self: Player): void | Promise<void>;

  onBlockResult?(ctx: BlockResultContext, self: Player): void | Promise<void>;
  onFollowUp?(ctx: FollowUpContext, self: Player): void | Promise<void>;
  onArmourBreak?(ctx: ArmourBreakContext, self: Player): void | Promise<void>;
  onInjuryRoll?(ctx: InjuryRollContext, self: Player): void | Promise<void>;
  onCasualty?(ctx: CasualtyContext, self: Player): void | Promise<void>;

  onActivationDeclared?(ctx: ActivationDeclaredContext, self: Player): void;

  onRushDeclared?(ctx: RushDeclaredContext, self: Player): void | Promise<void>;

  onJumpDeclared?(ctx: JumpDeclaredContext, self: Player): void | Promise<void>;

  onJumpResolved?(ctx: JumpResolvedContext, self: Player): void | Promise<void>;

  onStandUpRoll?(ctx: StandUpRollContext, self: Player): void | Promise<void>;

  onTurnEnding?(ctx: TurnEndingContext, self: Player): void;

  onTeamRerollGate?(ctx: TeamRerollGateContext, self: Player): void;

  onActionDeclared?(ctx: ActionDeclaredContext, self: Player): void;

  onCountAssists?(ctx: CountAssistContext, self: Player): void;
}
