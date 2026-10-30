/**
 * withRerollOffer - the single fold point every rerollable roll goes
 * through. Roll once; on a failure, gather the player's reroll sources
 * (a skill rule declaring this roll kind, and/or the team reroll), pause on
 * a reroll decision, and reroll through the same seeded dice path when the
 * coach accepts. A declined offer consumes nothing — the original failure
 * stands and dice determinism is preserved.
 */

import { Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { RerollableRollKind, RerollSource } from "../../types/decisions";
import { SkillRegistry } from "./SkillRegistry";
import { TeamRerollGateContext } from "./SkillRule";
import { IGameService } from "../../services/interfaces/IGameService";
import { VETERAN_REROLL_KINDS } from "../rules/veteran";
import { d6Target } from "../rules/rollOdds";

export interface RollLike {
  success: boolean;
  roll: number;
  needed?: number;
  target?: number;
  modifiers?: number;
}

export interface RerollDeps {
  gameService: IGameService;
  eventBus: IEventBus;
}

/** First of the player's skills whose rule can reroll this kind and is unspent. */
function findSkillSource(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind
): SkillType | undefined {
  const arbiter = deps.gameService.getRerollArbiter();
  for (const skill of player.skills) {
    const rule = SkillRegistry.get(skill.type);
    if (
      rule?.rerollable?.includes(rollKind) &&
      arbiter.skillRerollAvailable(player, skill.type)
    ) {
      return skill.type;
    }
  }
  return undefined;
}

/** Legal sources shared by the failed-roll offer and the step preview. */
export function availableRerolls(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind,
  skillAllowed = true
) {
  const arbiter = deps.gameService.getRerollArbiter();
  const skillSource = !skillAllowed
    ? undefined
    : findSkillSource(deps, player, rollKind);
  const sources: RerollSource[] = [];
  if (skillSource) sources.push("skill");
  if (arbiter.teamRerollAvailable(player.teamId)) sources.push("team");
  // Pro: a die-level reroll during the player's OWN activation only. Every
  // rollKind offered through this seam qualifies (Armour/Injury/Casualty
  // rolls never come through here); the active-player check excludes rolls
  // made on the player's behalf outside their activation (e.g. catching an
  // opponent's pass on the opponent's turn). Once per activation, 3+ to use.
  if (
    SkillRegistry.has(SkillType.PRO) &&
    hasSkill(player.skills, SkillType.PRO) &&
    deps.gameService.getState().activePlayer?.id === player.id &&
    arbiter.onceAvailable(player, SkillType.PRO)
  ) {
    sources.push("pro");
  }
  if (
    VETERAN_REROLL_KINDS.includes(rollKind) &&
    arbiter.veteranRerollAvailable(player)
  ) {
    sources.push("veteran");
  }
  return { sources, skillSource };
}

export async function withRerollOffer<T extends RollLike>(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind,
  doRoll: () => T,
  opts?: {
    /** A trigger may deny the skill reroll (Tackle vs Dodge) */
    skillAllowed?: boolean;
    /** The roll's own name for the coach, e.g. "Bone Head". */
    rollName?: string;
  }
): Promise<T> {
  const first = doRoll();
  if (first.success) return first;

  const arbiter = deps.gameService.getRerollArbiter();
  const { sources, skillSource } = availableRerolls(
    deps,
    player,
    rollKind,
    opts?.skillAllowed
  );
  if (sources.length === 0) return first;

  const answer = await deps.gameService.getDecisionService().request({
    type: "reroll",
    playerId: player.id,
    chooserTeamId: player.teamId,
    rollKind,
    ...(opts?.rollName ? { rollName: opts.rollName } : {}),
    sources,
    skill: skillSource ? String(skillSource) : undefined,
    roll: first.roll,
    needed:
      first.needed ??
      (first.target === undefined
        ? undefined
        : d6Target(first.target, first.modifiers)),
  });
  if (!answer.accept) return first;

  const chosen: RerollSource =
    answer.source && sources.includes(answer.source)
      ? answer.source
      : sources[0];
  if (chosen === "pro") {
    // Book: once attempted, the roll is locked against every other source
    arbiter.consumeOnce(player, SkillType.PRO);
    const gate = deps.gameService
      .getDiceController()
      .rollSkillCheck("Pro", 3, 0, player.playerName);
    if (!gate.success) {
      deps.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill: String(SkillType.PRO),
        effect: "Pro: the attempt fails — no other re-roll may be used",
      });
      return first;
    }
    deps.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: String(SkillType.PRO),
      effect: `Pro: re-roll the failed ${rollKind}`,
    });
  } else if (chosen === "skill" && skillSource) {
    arbiter.consumeSkillReroll(player, skillSource);
    deps.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: String(skillSource),
      effect: `${String(skillSource)}: reroll the failed ${rollKind}`,
    });
  } else if (chosen === "veteran") {
    arbiter.consumeVeteranReroll(player);
  } else if (!spendTeamReroll(deps, player)) {
    return first;
  }

  const second = doRoll();
  deps.eventBus.emit(GameEventNames.RerollUsed, {
    playerId: player.id,
    source: chosen,
    rollKind,
    skill: chosen === "skill" && skillSource ? String(skillSource) : undefined,
    before: first.roll,
    after: second.roll,
  });
  return second;
}

/**
 * Spend the player's team's Team Re-roll. Loner-class rules may gate the
 * spend; the re-roll is lost either way. Returns whether the dice may be
 * re-rolled.
 */
export function spendTeamReroll(deps: RerollDeps, player: Player): boolean {
  const gateCtx: TeamRerollGateContext = {
    player,
    dice: deps.gameService.getDiceController(),
    allowed: true,
    triggers: [],
  };
  for (const skill of player.skills) {
    SkillRegistry.get(skill.type)?.onTeamRerollGate?.(gateCtx, player);
  }
  for (const t of gateCtx.triggers) {
    deps.eventBus.emit(GameEventNames.SkillTriggered, t);
  }
  deps.gameService.getRerollArbiter().consumeTeamReroll(player.teamId);
  return gateCtx.allowed;
}
