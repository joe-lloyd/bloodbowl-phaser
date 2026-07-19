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
import {
  BlockResult,
  BlockResultType,
} from "../../services/BlockResolutionService";
import { RerollableRollKind } from "../../types/decisions";
import { DecisionService } from "./DecisionService";
import { RerollArbiter } from "./RerollArbiter";
import { GameOperation } from "../core/GameOperation";
import { DiceController } from "../controllers/DiceController";
import { InjuryResult } from "../controllers/InjuryController";

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
  /** Once-per-turn usage ledger (Break Tackle's modifier, …) */
  arbiter?: RerollArbiter;
  /** Seeded dice for rules that roll their own dice (Regeneration, …) */
  dice?: DiceController;
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
  /** Number of block dice; recomputed from strength after the fold. */
  diceCount: number;
  isAttackerChoice: boolean;
  /** Effective attacker strength (assists included); rules may raise it. */
  attackerStrength: number;
  /** Effective defender strength (assists included). */
  defenderStrength: number;
  /** The block is thrown as part of a Blitz Action (Horns, Juggernaut). */
  isBlitz: boolean;
  /**
   * Cancel the block outright and end the attacker's activation (Foul
   * Appearance's failed roll — no dice are rolled).
   */
  cancelled: boolean;
}

/** Block dice have been rolled, before the coach selects a result. */
export interface BlockDiceRolledContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;
  /** The rolled results; a rule may reroll dice in place (Brawler). */
  results: BlockResult[];
  isAttackerChoice: boolean;
}

/** A player is about to be pushed back. */
export interface PushContext extends TriggerContextBase {
  attacker: Player;
  pushed: Player;
  resultType: BlockResultType;
  /** The block is thrown as part of a Blitz Action (Juggernaut). */
  isBlitz: boolean;
  /** Does the pushed player currently carry the ball? (Strip Ball) */
  pushedHasBall: boolean;
  /**
   * The blocker ignores the pushed player's push reactions — Fend and Stand
   * Firm are cancelled (Juggernaut on a Blitz, set as the attacker folds
   * first).
   */
  blockerIgnoresReactions: boolean;
  /** Set true to refuse the push entirely (Stand Firm) */
  refused: boolean;
  /** Deny the blocker their follow-up into the vacated square (Fend). */
  preventFollowUp: boolean;
  /**
   * The pushed carrier drops the ball in the square they are pushed into,
   * before they become Prone and after the follow-up choice (Strip Ball).
   */
  stripBall: boolean;
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

/** A player is about to roll to pick up the ball. */
export interface PickupContext extends TriggerContextBase {
  player: Player;
  /** Opponents marking the pickup square */
  marking: number;
  /** Net pickup modifier; rules may adjust (Big Hand, Extra Arms) */
  modifiers: number;
  /** Fail without rolling, as a natural 1 (No Ball) */
  autoFail?: boolean;
}

/** A player is about to roll to catch the ball. */
export interface CatchContext extends TriggerContextBase {
  player: Player;
  /** Opponents marking the catcher */
  marking: number;
  modifiers: number;
  autoFail?: boolean;
}

/** A pass is declared, before the Passing Ability Test. */
export interface PassDeclaredContext extends TriggerContextBase {
  player: Player;
  passType: string;
  /** Opponents marking the passer */
  marking: number;
  /** Extra modifier added to the PA test (Accurate, Nerves of Steel, …) */
  modifiers: number;
}

/** The Passing Ability Test has been rolled. */
export interface PassResultContext extends TriggerContextBase {
  player: Player;
  roll: number;
  fumbled: boolean;
  accurate: boolean;
  /**
   * Cancel the fumble: the passer keeps the ball, their activation ends,
   * no turnover (Safe Pass on a natural 1).
   */
  keepBall?: boolean;
}

/** The blocker may follow up into the vacated square. */
export interface FollowUpContext extends TriggerContextBase {
  attacker: Player;
  targetSquare: { x: number; y: number };
}

/**
 * A player's armour roll has been made. Fold order is causer first, then
 * the downed player (so defensive rules like Iron Hard Skin see and may
 * cancel what the attacker's rules applied), then adjacents.
 */
export interface ArmourBreakContext extends TriggerContextBase {
  player: Player;
  /** The blocker who knocked this player down (block-path armour only) */
  causedBy?: Player;
  /** Natural 2D6 total */
  roll: number;
  /** Net armour-roll modifier (Mighty Blow; cleared by Iron Hard Skin) */
  armourModifier: number;
  /** Carried into the injury roll (Mighty Blow choosing injury) */
  injuryModifier: number;
  /** Break regardless of AV (Claws on 8+; cancelled by Iron Hard Skin) */
  forcedBreak?: boolean;
  /** The unmodified outcome (roll vs AV) — recomputed after the fold */
  broken: boolean;
}

/** A player's injury roll has been made; rules may adjust the result. */
export interface InjuryRollContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  /** Natural 2D6 total */
  roll: number;
  /** Net injury modifier (from Mighty Blow via the armour fold, …) */
  modifier: number;
  result: InjuryResult;
}

/** A casualty is about to be rolled (Regeneration's save happens here). */
export interface CasualtyContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  /** Set true to ignore the casualty and go to Reserves (Regeneration) */
  regenerated?: boolean;
}

/**
 * A teammate is being considered as an assist for a Block or Foul. Folded
 * synchronously while assists are counted (no decisions/dice/flow — assist
 * counting is passive and runs during preview). Fold order is the assister
 * first (so Guard can ignore its markers), then the markers (so Defensive
 * can cancel that Guard).
 */
export interface CountAssistContext {
  /** The teammate offering the assist. */
  assister: Player;
  /** The block/foul opponent (never counts as a marker of the assister). */
  opponent: Player;
  /** Which action the assist supports — Guard only helps Blocks. */
  action: "block" | "foul";
  /** Whose turn it is (Defensive only bites on its opponent's turn). */
  activeTeamId: string | null;
  /** Enemies with a tackle zone marking the assister (excluding opponent). */
  markers: Player[];
  /** Does marking currently negate this assist? Rules mutate (Guard clears). */
  negated: boolean;
  /** Skill effects to announce. */
  triggers: SkillTriggerRecord[];
}

/** The casualty D16 has been rolled; rules may modify it (Decay). */
export interface CasualtyRollContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  roll: number;
  modifier: number;
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
  onPickup?(ctx: PickupContext, self: Player): void | Promise<void>;
  onCatch?(ctx: CatchContext, self: Player): void | Promise<void>;
  onPassDeclared?(
    ctx: PassDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onPassResult?(ctx: PassResultContext, self: Player): void | Promise<void>;
  onBlockDeclared?(
    ctx: BlockDeclaredContext,
    self: Player
  ): void | Promise<void>;
  onBlockDiceRolled?(
    ctx: BlockDiceRolledContext,
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
  onInjuryRoll?(ctx: InjuryRollContext, self: Player): void | Promise<void>;
  onCasualty?(ctx: CasualtyContext, self: Player): void | Promise<void>;
  onCasualtyRoll?(
    ctx: CasualtyRollContext,
    self: Player
  ): void | Promise<void>;
  /**
   * Passive assist-eligibility adjustment, folded synchronously while assists
   * are counted (Guard ignores marking; Defensive cancels an enemy's Guard).
   * Never raises decisions or enqueues flow — it only mutates the context.
   */
  onCountAssists?(ctx: CountAssistContext, self: Player): void;
}
