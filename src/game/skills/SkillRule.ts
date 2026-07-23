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
import { ActionType } from "../../types/events";
import {
  BlockResult,
  BlockResultType,
} from "../../services/BlockResolutionService";
import { RerollableRollKind } from "../../types/decisions";
import { DecisionService } from "./DecisionService";
import { RerollArbiter } from "./RerollArbiter";
import { GameOperation } from "../core/GameOperation";
import { DiceController } from "../controllers/DiceController";
import {
  InjuryResult,
  InjuryTableKind,
} from "../controllers/InjuryController";

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
  /**
   * The (negative) share of `modifiers` that comes from opponents Marking
   * the destination square. Rules that ignore or soften marking (Stunty,
   * Titchy) adjust BOTH fields, so each marker's -1 is only forgiven once.
   */
  markingPenalty: number;
  /** Rules may deny the dodging player's skill reroll (Tackle) */
  skillRerollAllowed: boolean;
  /**
   * The dodger is held fast: they never leave the square, no Agility Test
   * is rolled, and their activation ends — not a turnover (Tentacles).
   */
  escapeCancelled?: boolean;
}

/**
 * The dodge Agility Test has been rolled and any re-rolls applied. Markers
 * of the vacated square may still react: worsen the result and drop prone
 * in the vacated square (Diving Tackle) or chase into it (Shadowing).
 */
export interface DodgeResolvedContext extends TriggerContextBase {
  player: Player;
  /** The square the dodger left (where reactions land) */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The natural D6 (a 6 always succeeds — no modifier can flip it) */
  naturalRoll: number;
  target: number;
  /** Net modifiers applied to the test; reactions may worsen (Diving Tackle) */
  modifiers: number;
  /** The final outcome; reactions may flip it to a failure */
  success: boolean;
  /** This player is placed Prone in the vacated square (Diving Tackle) */
  proneInVacated?: string;
  /** This player follows into the vacated square (Shadowing) */
  followInto?: string;
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
  /** Everyone on the pitch (Trickster's occupancy check). */
  allPlayers: Player[];
  /**
   * The defender slips to this square before the dice are determined
   * (Trickster); BlockManager applies it and re-runs the assist analysis.
   */
  relocateDefenderTo?: { x: number; y: number };
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
  /**
   * The blocker chooses any unoccupied square adjacent to the pushed player,
   * not just the three behind them (Grab).
   */
  grabPush: boolean;
  /**
   * The PUSHED player's coach chooses any unoccupied square adjacent to
   * them to be pushed into (Sidestep — cancelled when the blocker has
   * Grab).
   */
  sideStepPush: boolean;
  /**
   * The pushed player's coach makes the blocker Follow-up whether the
   * blocker wants to or not (Taunt).
   */
  forceFollowUp: boolean;
}

/** Outcome of a block result, mutated by rules before it is applied. */
export interface BlockResultContext extends TriggerContextBase {
  attacker: Player;
  defender: Player;
  resultType: BlockResultType;
  /** The block is thrown as part of a Blitz Action (Juggernaut). */
  isBlitz: boolean;
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
  /**
   * Treat a Both Down as a Push Back instead: the defender is pushed, nobody
   * is knocked down, and there is no turnover (Juggernaut on a Blitz).
   */
  treatAsPush?: boolean;
  /**
   * The blocker ignores the defender's block-result reactions — Wrestle is
   * cancelled (Juggernaut on a Blitz).
   */
  suppressReactions?: boolean;
  /** Saboteur replaced the defender's knockdown/Armour with an automatic KO. */
  saboteurExploded?: boolean;
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
  origin?: "pass" | "handoff" | "throw-in" | "kick-off" | "bounce";
  /** True when this catcher occupies the declared target square of a Pass. */
  isPassTarget?: boolean;
  /** The ball landed in an adjacent Tackle Zone rather than this square. */
  divingCatch?: boolean;
}

/** A pass is declared, before the Passing Ability Test. */
export interface PassDeclaredContext extends TriggerContextBase {
  player: Player;
  passType: string;
  /** Opponents marking the passer */
  marking: number;
  /** Extra modifier added to the PA test (Accurate, Nerves of Steel, …) */
  modifiers: number;
  /** The intended receiver, when the target square holds a team-mate. */
  targetPlayer?: Player;
  /**
   * Refuse the throw outright: the activation ends, the ball stays put,
   * no turnover (Animosity's 1).
   */
  refused?: boolean;
  /**
   * Opponents may not attempt to Intercept this pass at all — a hard
   * suppression not even Very Long Legs bypasses (Hail Mary Pass).
   */
  suppressInterception?: boolean;
  /**
   * Cloud Burster: opponents may not Intercept — EXCEPT a Very Long Legs
   * player, who "ignores the Cloud Burster Skill". Softer than
   * suppressInterception; PassOperation still offers the interception to any
   * Very Long Legs interceptor.
   */
  cloudBurster?: boolean;
  /**
   * An Accurate result is treated as Inaccurate — the ball scatters from the
   * target square (Hail Mary Pass).
   */
  downgradeAccurate?: boolean;
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
  /** What put the player down — "dodge" enables Arm Bar. */
  cause?: "block" | "dodge";
  /** The square the player fell leaving (a failed Dodge/Leap/Jump). */
  vacatedSquare?: { x: number; y: number };
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

/**
 * A player's injury roll has been made. Rules declare independent,
 * order-agnostic effects (which table applies, downgrade requests); the
 * operation resolves them together after the fold, so stacked skills like
 * Stunty + Thick Skull compose without knowing about each other.
 */
export interface InjuryRollContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  /** Natural 2D6 total */
  roll: number;
  /** Net injury modifier (from Mighty Blow via the armour fold, …) */
  modifier: number;
  /** Which Injury Table resolves the roll (Stunty switches it). */
  table: InjuryTableKind;
  /**
   * Request to treat the active table's LOWEST Knocked-out total as a
   * Stunned result (Thick Skull: the 8 on the standard table, the 7 on the
   * Stunty table). The trigger record is announced only if it bites.
   */
  koDowngrade?: SkillTriggerRecord;
  /** Resolved from `table` + `koDowngrade` by the operation after the fold. */
  result: InjuryResult;
  /**
   * The casualty is automatic Badly Hurt — no Casualty Roll is made (the
   * Stunty Injury Table's 9). Resolved by the operation after the fold.
   */
  casualtyAutoBadlyHurt?: boolean;
}

/** A casualty is about to be rolled (Regeneration's save happens here). */
export interface CasualtyContext extends TriggerContextBase {
  player: Player;
  causedBy?: Player;
  cause?: "block" | "special";
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

/**
 * An action is being declared for a player, after the generic legality
 * checks. Folded synchronously (declaration gating is passive - no
 * decisions, dice, or flow); a rule may refuse the declaration outright
 * (Unsteady vs Secure the Ball; later My Ball).
 */
export interface ActionDeclaredContext {
  /** The player the action is being declared for. */
  player: Player;
  /** The action being declared ("move", "secureBall", ...). */
  action: ActionType;
  /** Is the declaring player standing on the ball? (My Ball) */
  hasBall: boolean;
  /** Set true to refuse the declaration; nothing is declared. */
  refused: boolean;
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

/** Failure effect an activation-gate rule declares (applied by the operation). */
export type ActivationGateFailure =
  | { kind: "distracted" }
  | { kind: "endActivation" }
  | { kind: "rooted" }
  | { kind: "lashOut" }
  | { kind: "bloodlust" };

/** One negatrait's roll-to-act, rolled by ActivationGateOperation in order. */
export interface ActivationGate {
  skill: string;
  /** Unmodified D6 target (Bone Head 2, Really Stupid 4, …). */
  target: number;
  /** Modifier the rule computed (Really Stupid's +2 helper, …). */
  modifier: number;
  onFail: ActivationGateFailure;
}

/**
 * An action has been declared and the player's negatraits roll before it
 * is performed. Rules PUSH a gate; ActivationGateOperation rolls each in
 * fold order (team-rerollable, natural 1 fails) and applies the first
 * failure.
 */
export interface ActivationDeclaredContext extends TriggerContextBase {
  player: Player;
  action: ActionType;
  /** On-pitch team-mates (Really Stupid's helper check). */
  teammates: Player[];
  gates: ActivationGate[];
}

/** A Rush (GFI) is about to be rolled; rules may modify it (Drunkard). */
export interface RushDeclaredContext extends TriggerContextBase {
  player: Player;
  modifiers: number;
}

/**
 * A player is about to make the Agility Test to Jump over a square (a Prone/
 * Stunned player by default; any square with Leap/Pogo). Rules adjust the
 * modifier: Leap softens the marking penalty, Pogo ignores it, Very Long Legs
 * adds a flat bonus. Kept as two fields so a Pogo (zero the penalty) and a
 * Very Long Legs (+1 bonus) compose regardless of fold order.
 */
export interface JumpDeclaredContext extends TriggerContextBase {
  player: Player;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The square being jumped over. */
  over: { x: number; y: number };
  /**
   * The (negative or zero) marking penalty = -max(markers of the from square,
   * markers of the to square). Leap raises it toward -1; Pogo zeroes it.
   */
  negativeModifier: number;
  /** Flat additions to the Agility Test (Very Long Legs +1). */
  bonusModifier: number;
}

/**
 * A player with MA < 3 rolls to stand up (4+, natural 1 fails); rules may
 * modify the roll (Timmm-ber!'s +1 per Open Standing adjacent team-mate).
 */
export interface StandUpRollContext extends TriggerContextBase {
  player: Player;
  /** On-pitch team-mates. */
  teammates: Player[];
  /** On-pitch opponents (to judge whether a helper is Open). */
  opponents: Player[];
  modifiers: number;
}

/**
 * The opposition's turn is ending, before the next turn starts. Folded
 * SYNCHRONOUSLY over the non-active team (Pick-Me-Up) — no decisions or
 * flow, only dice and context mutation.
 */
export interface TurnEndingContext {
  endingTeamId: string;
  /** On-pitch players of the reacting (non-active) team. */
  players: Player[];
  dice: DiceController;
  /** Prone players already rolled for this pass (one roll each). */
  rolledFor: Set<string>;
  /** Players to stand up once the fold completes (applied by the engine). */
  standUp: string[];
  triggers: SkillTriggerRecord[];
}

/**
 * A team reroll is about to be spent by this player; a rule may forbid it,
 * in which case the reroll is still lost (Loner). Folded synchronously
 * inside the reroll machinery.
 */
export interface TeamRerollGateContext {
  player: Player;
  dice: DiceController;
  /** Set false to lose the reroll without rerolling. */
  allowed: boolean;
  triggers: SkillTriggerRecord[];
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
  onDodgeResolved?(
    ctx: DodgeResolvedContext,
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
   * Negatrait roll between declaring and performing an action — the rule
   * pushes an ActivationGate; ActivationGateOperation rolls and applies it.
   */
  onActivationDeclared?(
    ctx: ActivationDeclaredContext,
    self: Player
  ): void | Promise<void>;
  /** A Rush is about to be rolled (Drunkard's -1). */
  onRushDeclared?(
    ctx: RushDeclaredContext,
    self: Player
  ): void | Promise<void>;
  /** A Jump/Leap Agility Test is about to be rolled (Leap, Pogo, Very Long Legs). */
  onJumpDeclared?(
    ctx: JumpDeclaredContext,
    self: Player
  ): void | Promise<void>;
  /** An MA < 3 player rolls to stand up (Timmm-ber!). */
  onStandUpRoll?(
    ctx: StandUpRollContext,
    self: Player
  ): void | Promise<void>;
  /**
   * The opposition's turn is ending (Pick-Me-Up). Synchronous — never
   * raises decisions or enqueues flow; the engine applies ctx.standUp.
   */
  onTurnEnding?(ctx: TurnEndingContext, self: Player): void;
  /**
   * A team reroll is about to be spent by this player (Loner's gate).
   * Synchronous; setting allowed=false loses the reroll unspent.
   */
  onTeamRerollGate?(ctx: TeamRerollGateContext, self: Player): void;
  /**
   * Passive declaration gate, folded synchronously when an action is being
   * declared for this player (Unsteady refuses Secure the Ball). Never
   * raises decisions or enqueues flow - it only mutates the context.
   */
  onActionDeclared?(ctx: ActionDeclaredContext, self: Player): void;
  /**
   * Passive assist-eligibility adjustment, folded synchronously while assists
   * are counted (Guard ignores marking; Defensive cancels an enemy's Guard).
   * Never raises decisions or enqueues flow — it only mutates the context.
   */
  onCountAssists?(ctx: CountAssistContext, self: Player): void;
}
