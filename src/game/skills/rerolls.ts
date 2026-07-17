/**
 * withRerollOffer - the single fold point every rerollable roll goes
 * through. Roll once; on a failure, gather the player's reroll sources
 * (a skill rule declaring this roll kind, and/or the team reroll), pause on
 * a reroll decision, and reroll through the same seeded dice path when the
 * coach accepts. A declined offer consumes nothing — the original failure
 * stands and dice determinism is preserved.
 */

import { Player } from "../../types/Player";
import { SkillType } from "../../types/Skills";
import { IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  RerollableRollKind,
  RerollSource,
  RerollDecisionAnswer,
} from "../../types/decisions";
import { SkillRegistry } from "./SkillRegistry";
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
  if (sources.length === 0) return first;

  const answer: RerollDecisionAnswer = await deps.gameService
    .getDecisionService()
    .request({
      type: "reroll",
      playerId: player.id,
      chooserTeamId: player.teamId,
      rollKind,
      sources,
      skill: skillSource ? String(skillSource) : undefined,
      roll: first.roll,
    });
  if (!answer.accept) return first;

  const chosen: RerollSource =
    answer.source && sources.includes(answer.source)
      ? answer.source
      : sources[0];
  if (chosen === "skill" && skillSource) {
    arbiter.consumeSkillReroll(player, skillSource);
    deps.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: String(skillSource),
      effect: `${String(skillSource)}: reroll the failed ${rollKind}`,
    });
  } else {
    arbiter.consumeTeamReroll(player.teamId);
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
