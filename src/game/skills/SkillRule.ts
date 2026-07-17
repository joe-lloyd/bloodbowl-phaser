/**
 * SkillRule - a self-contained rule for one skill.
 *
 * Each rule exposes optional, narrowly-typed hooks that the roll paths fold
 * over at named trigger points. A rule mutates the context it is given; it
 * never controls flow directly (per the architecture rules). A skill with no
 * registered rule is inert — play is identical to a player without it.
 *
 * At every trigger point the engine gathers rules from ALL relevant players
 * (actor → target → adjacents by position), so a rule can react to an
 * opponent's action (Tackle, Stand Firm, Diving Tackle). Hooks may be async:
 * a reaction that needs the coach's choice awaits ctx.decisions.request(),
 * pausing the base action on the one decision channel. Effects that add or
 * replace steps enqueue a GameOperation via ctx.flow — never by mutating the
 * base rule inline.
 */

import { Player } from "../../types/Player";
import { BlockResultType } from "../../services/BlockResolutionService";
import { RerollableRollKind } from "../../types/decisions";
import { DecisionService } from "./DecisionService";
import { GameOperation } from "../core/GameOperation";

export interface SkillTriggerRecord {
  playerId: string;
  skill: string;
  effect: string;
}

/** The slice of GameFlowManager a rule may enqueue operations on. */
export interface FlowLike {
  add(operation: GameOperation, next?: boolean): void;
}

interface TriggerContextBase {
  /** Skill effects to announce (folded into SkillTriggered events) */
  triggers: SkillTriggerRecord[];
  /** Raise a reacting-team decision (pauses the base action) */
  decisions?: DecisionService;
  /** Enqueue flow-altering operations (extra block, pre-roll, …) */
  flow?: FlowLike;
}

/** A player is about to dodge out of one or more tackle zones. */
export interface DodgeDeclaredContext extends TriggerContextBase {
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Net dodge modifier; rules may worsen/improve it (Diving Tackle) */
  modifiers: number;
  /** Rules may deny the dodging player's skill reroll (Tackle) */
  skillRerollAllowed: boolean;
}

/** A block is declared, before the dice are rolled. */
export interface BlockDeclaredContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;
  /** Number of block dice; rules may adjust (Dauntless outcomes, Horns) */
  diceCount: number;
  isAttackerChoice: boolean;
}

/** A player is about to be pushed back. */
export interface PushContext extends TriggerContextBase {
  attacker: Player;
  pushed: Player;
  resultType: BlockResultType;
  /** Set true to refuse the push entirely (Stand Firm) */
  refused: boolean;
}

/** Outcome of a block result, mutated by rules before it is applied. */
export interface BlockResultContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;
  resultType: BlockResultType;
  /** Will the attacker be knocked down? (rules may flip to false) */
  attackerKnockedDown: boolean;
  /** Will the defender be knocked down? */
  defenderKnockedDown: boolean;
  /**
   * Downed players are "Placed Prone" instead of Knocked Down (Wrestle):
   * no armour rolls, and a turnover only if the active player carried the
   * ball (2025 rulebook p.42).
   */
  placedProne?: boolean;
}

/** The blocker may follow up into the vacated square. */
export interface FollowUpContext extends TriggerContextBase {
  attacker: Player;
  targetSquare: { x: number; y: number };
}

/** A player's armour roll has been made. */
export interface ArmourBreakContext extends TriggerContextBase {
  player: Player;
  roll: number;
  /** Rules may cancel or force the break (Thick Skull-style effects) */
  broken: boolean;
}

export interface SkillRule {
  /**
   * Roll kinds this skill lets its owner reroll (Dodge → dodge, Sure Hands
   * → pickup, …). The reroll machinery folds these into the offer; timing
   * constraints live in the RerollArbiter, never here.
   */
  rerollable?: RerollableRollKind[];

  onDodgeDeclared?(
    ctx: DodgeDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onBlockDeclared?(
    ctx: BlockDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onPush?(ctx: PushContext, self: Player): void | Promise<void>;
  /**
   * Fired while a block result is being resolved. `self` is the player who
   * holds this skill (attacker or defender); the rule reads the context and
   * may adjust the knock-down flags (e.g. Block ignores Both Down).
   */
  onBlockResult?(ctx: BlockResultContext, self: Player): void | Promise<void>;
  onFollowUp?(ctx: FollowUpContext, self: Player): void | Promise<void>;
  onArmourBreak?(ctx: ArmourBreakContext, self: Player): void | Promise<void>;
}
