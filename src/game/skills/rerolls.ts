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
import {
  RerollableRollKind,
  RerollSource,
  RerollDecisionAnswer,
} from "../../types/decisions";
import { SkillRegistry } from "./SkillRegistry";
import { TeamRerollGateContext } from "./SkillRule";
import { IGameService } from "../../services/interfaces/IGameService";

export interface RollLike {
  success: boolean;
  roll: number;
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

export async function withRerollOffer<T extends RollLike>(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind,
  doRoll: () => T,
  opts?: {
    /** A trigger may deny the skill reroll (Tackle vs Dodge) */
    skillAllowed?: boolean;
  }
): Promise<T> {
  const first = doRoll();
  if (first.success) return first;

  const arbiter = deps.gameService.getRerollArbiter();
  const skillSource =
    opts?.skillAllowed === false
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
  if (sources.length === 0) return first;

  const answer = (await deps.gameService.getDecisionService().request({
      type: "reroll",
      playerId: player.id,
      chooserTeamId: player.teamId,
      rollKind,
      sources,
      skill: skillSource ? String(skillSource) : undefined,
      roll: first.roll,
    })) as RerollDecisionAnswer;
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
  } else {
    // Loner-class rules may gate the spend; the reroll is lost either way
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
    arbiter.consumeTeamReroll(player.teamId);
    if (!gateCtx.allowed) return first;
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
