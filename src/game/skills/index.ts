/**
 * Skill rules entry point. Importing this module registers the built-in
 * rules with the SkillRegistry and exposes the fold helpers that roll paths
 * call. Add a rule by creating one file under rules/ and registering it here.
 */

import { SkillType } from "../../types/Skills";
import { Player, PlayerStatus } from "../../types/Player";
import { SkillRegistry } from "./SkillRegistry";
import { BlockResultContext } from "./SkillRule";
import { BlockRule } from "./rules/BlockRule";
import { DodgeRule } from "./rules/DodgeRule";
import { TackleRule } from "./rules/TackleRule";
import { SureHandsRule } from "./rules/SureHandsRule";
import { CatchRule } from "./rules/CatchRule";
import { PassRule } from "./rules/PassRule";
import { WrestleRule } from "./rules/WrestleRule";
import { StandFirmRule } from "./rules/StandFirmRule";
import { SureFeetRule } from "./rules/SureFeetRule";
import { SprintRule } from "./rules/SprintRule";
import { JumpUpRule } from "./rules/JumpUpRule";
import { TwoHeadsRule } from "./rules/TwoHeadsRule";
import { BreakTackleRule } from "./rules/BreakTackleRule";
import { BigHandRule } from "./rules/BigHandRule";
import { ExtraArmsRule } from "./rules/ExtraArmsRule";
import { NoBallRule } from "./rules/NoBallRule";
import { AccurateRule } from "./rules/AccurateRule";
import { CannoneerRule } from "./rules/CannoneerRule";
import { NervesOfSteelRule } from "./rules/NervesOfSteelRule";
import { SafePassRule } from "./rules/SafePassRule";
import { MightyBlowRule } from "./rules/MightyBlowRule";
import { ClawsRule } from "./rules/ClawsRule";
import { IronHardSkinRule } from "./rules/IronHardSkinRule";
import { ThickSkullRule } from "./rules/ThickSkullRule";
import { DecayRule } from "./rules/DecayRule";
import { RegenerationRule } from "./rules/RegenerationRule";

let registered = false;

/** Register every built-in skill rule (idempotent). */
export function registerBuiltinSkills(): void {
  if (registered) return;
  registered = true;
  SkillRegistry.register(SkillType.BLOCK, BlockRule);
  SkillRegistry.register(SkillType.DODGE, DodgeRule);
  SkillRegistry.register(SkillType.TACKLE, TackleRule);
  SkillRegistry.register(SkillType.SURE_HANDS, SureHandsRule);
  SkillRegistry.register(SkillType.CATCH, CatchRule);
  SkillRegistry.register(SkillType.PASS, PassRule);
  SkillRegistry.register(SkillType.WRESTLE, WrestleRule);
  SkillRegistry.register(SkillType.STAND_FIRM, StandFirmRule);
  SkillRegistry.register(SkillType.SURE_FEET, SureFeetRule);
  SkillRegistry.register(SkillType.SPRINT, SprintRule);
  SkillRegistry.register(SkillType.JUMP_UP, JumpUpRule);
  SkillRegistry.register(SkillType.TWO_HEADS, TwoHeadsRule);
  SkillRegistry.register(SkillType.BREAK_TACKLE, BreakTackleRule);
  SkillRegistry.register(SkillType.BIG_HAND, BigHandRule);
  SkillRegistry.register(SkillType.EXTRA_ARMS, ExtraArmsRule);
  SkillRegistry.register(SkillType.NO_BALL, NoBallRule);
  SkillRegistry.register(SkillType.ACCURATE, AccurateRule);
  SkillRegistry.register(SkillType.CANNONEER, CannoneerRule);
  SkillRegistry.register(SkillType.NERVES_OF_STEEL, NervesOfSteelRule);
  SkillRegistry.register(SkillType.SAFE_PASS, SafePassRule);
  SkillRegistry.register(SkillType.MIGHTY_BLOW, MightyBlowRule);
  SkillRegistry.register(SkillType.CLAWS, ClawsRule);
  SkillRegistry.register(SkillType.IRON_HARD_SKIN, IronHardSkinRule);
  SkillRegistry.register(SkillType.THICK_SKULL, ThickSkullRule);
  SkillRegistry.register(SkillType.DECAY, DecayRule);
  SkillRegistry.register(SkillType.REGENERATION, RegenerationRule);
}

// Register on first import so any consumer of the fold helpers is covered.
registerBuiltinSkills();

/** Trigger points a rule can hook (see SkillRule). */
export type TriggerHook =
  | "onDodgeDeclared"
  | "onBlockDeclared"
  | "onPush"
  | "onBlockResult"
  | "onFollowUp"
  | "onArmourBreak"
  | "onPickup"
  | "onCatch"
  | "onPassDeclared"
  | "onPassResult"
  | "onInjuryRoll"
  | "onCasualty"
  | "onCasualtyRoll";

/**
 * Deterministic all-participant gather: actor first, then target, then the
 * remaining relevant players (typically adjacents) ordered by board position
 * (top-to-bottom, left-to-right). Duplicates collapse to first appearance,
 * so multi-skill interactions replay identically.
 */
export function gatherParticipants(
  actor: Player,
  target?: Player,
  others: Player[] = []
): Player[] {
  const byPosition = [...others]
    .filter((p) => p.gridPosition)
    .sort(
      (a, b) =>
        a.gridPosition!.y - b.gridPosition!.y ||
        a.gridPosition!.x - b.gridPosition!.x
    );
  const seen = new Set<string>();
  const participants: Player[] = [];
  for (const p of [actor, ...(target ? [target] : []), ...byPosition]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      participants.push(p);
    }
  }
  return participants;
}

/** Standing players adjacent to a square — the usual "others" for a gather. */
export function adjacentStanding(
  square: { x: number; y: number },
  players: Player[]
): Player[] {
  return players.filter((p) => {
    if (!p.gridPosition || p.status !== PlayerStatus.ACTIVE) return false;
    const dx = Math.abs(p.gridPosition.x - square.x);
    const dy = Math.abs(p.gridPosition.y - square.y);
    return dx <= 1 && dy <= 1 && dx + dy > 0;
  });
}

/**
 * Fold every participant's registered rules over a trigger context, in
 * gather order. Async because a reaction hook may pause on a decision.
 * A rule without the hook is skipped; unregistered skills are inert.
 */
export async function foldTrigger(
  hook: TriggerHook,
  participants: Player[],
  ctx: unknown
): Promise<void> {
  for (const self of participants) {
    for (const skill of self.skills) {
      const rule = SkillRegistry.get(skill.type) as
        | Record<
            string,
            ((c: unknown, s: Player) => void | Promise<void>) | undefined
          >
        | undefined;
      await rule?.[hook]?.(ctx, self);
    }
  }
}

/**
 * Fold rules over a block result. Participants: attacker, defender, then
 * players adjacent to either (deterministic order via gatherParticipants).
 */
export async function foldBlockResult(
  ctx: BlockResultContext,
  allPlayers: Player[] = []
): Promise<void> {
  const adjacents = [
    ...(ctx.attacker.gridPosition
      ? adjacentStanding(ctx.attacker.gridPosition, allPlayers)
      : []),
    ...(ctx.defender.gridPosition
      ? adjacentStanding(ctx.defender.gridPosition, allPlayers)
      : []),
  ];
  await foldTrigger(
    "onBlockResult",
    gatherParticipants(ctx.attacker, ctx.defender, adjacents),
    ctx
  );
}

export { SkillRegistry } from "./SkillRegistry";
export { RerollArbiter } from "./RerollArbiter";
export { DecisionService } from "./DecisionService";
export { withRerollOffer } from "./rerolls";
export type { RollLike, RerollDeps } from "./rerolls";
export type {
  SkillRule,
  SkillTriggerRecord,
  FlowLike,
  BlockResultContext,
  DodgeDeclaredContext,
  BlockDeclaredContext,
  PushContext,
  FollowUpContext,
  ArmourBreakContext,
  PickupContext,
  CatchContext,
  PassDeclaredContext,
  PassResultContext,
  InjuryRollContext,
  CasualtyContext,
  CasualtyRollContext,
} from "./SkillRule";
export { rushAllowance, moveAllowance, standUpCost } from "./movement";
