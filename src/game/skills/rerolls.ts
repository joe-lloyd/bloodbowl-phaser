import { inducementCount } from "../inducements/inventory";
import { Inducement } from "../../types/Inducements";
import { type Player } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { type IEventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import {
  type RerollableRollKind,
  type RerollSource,
} from "../../types/decisions";
import { SkillRegistry } from "./SkillRegistry";
import { type TeamRerollGateContext } from "./SkillRule";
import { type IGameService } from "../../services/interfaces/IGameService";
import { VETERAN_REROLL_KINDS } from "../rules/veteran";
import { teamCaptain } from "../rules/teamCaptain";
import { requiredRoll } from "../rules/rollTargets";
import { teamRerollBarred } from "../kickoff/ballConditions";

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

export function availableRerolls(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind,
  skillAllowed = true
) {
  const arbiter = deps.gameService.getRerollArbiter();
  const skillSource = skillAllowed
    ? findSkillSource(deps, player, rollKind)
    : undefined;
  const sources: RerollSource[] = [];
  if (skillSource) sources.push("skill");
  const barred = teamRerollBarred(
    deps.gameService.getState(),
    rollKind === "pickup" ? "pickup" : "other"
  );
  if (arbiter.teamRerollAvailable(player.teamId) && !barred) {
    sources.push("team");
  }

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

function spendReroll(
  deps: RerollDeps,
  arbiter: ReturnType<IGameService["getRerollArbiter"]>,
  player: Player,
  choice: {
    chosen: RerollSource;
    skillSource: SkillType | undefined;
    rollKind: RerollableRollKind;
  }
): boolean {
  const { chosen, skillSource, rollKind } = choice;
  if (chosen === "pro") {
    arbiter.consumeOnce(player, SkillType.PRO);
    const gate = deps.gameService
      .getDiceController()
      .rollSkillCheck({ reason: "Pro",target: 3,modifier: 0,playerName: player.playerName });
    if (!gate.success) {
      deps.eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill: SkillType.PRO,
        effect: "Pro: the attempt fails — no other re-roll may be used",
      });
      return false;
    }
    deps.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: SkillType.PRO,
      effect: `Pro: re-roll the failed ${rollKind}`,
    });
  } else if (chosen === "skill" && skillSource) {
    arbiter.consumeSkillReroll(player, skillSource);
    deps.eventBus.emit(GameEventNames.SkillTriggered, {
      playerId: player.id,
      skill: skillSource,
      effect: `${skillSource}: reroll the failed ${rollKind}`,
    });
  } else if (chosen === "veteran") {
    arbiter.consumeVeteranReroll(player);
  } else if (!spendTeamReroll(deps, player)) {
    return false;
  }
  return true;
}

function neededFor(first: RollLike): number | undefined {
  return (
    first.needed ??
    (first.target === undefined
      ? undefined
      : requiredRoll(first.target, first.modifiers))
  );
}

export async function withRerollOffer<T extends RollLike>(
  deps: RerollDeps,
  player: Player,
  rollKind: RerollableRollKind,
  doRoll: () => T,
  opts?: {
    skillAllowed?: boolean;

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

  const needed = neededFor(first);
  const answer = await deps.gameService.getDecisionService().request({
    type: "reroll",
    playerId: player.id,
    chooserTeamId: player.teamId,
    rollKind,
    ...(opts?.rollName && { rollName: opts.rollName }),
    sources,
    ...(skillSource && { skill: skillSource }),
    roll: first.roll,
    ...(needed !== undefined && { needed }),
  });
  if (!answer.accept) return first;

  const [firstSource] = sources;
  if (!firstSource) return first;
  const chosen: RerollSource =
    answer.source && sources.includes(answer.source)
      ? answer.source
      : firstSource;
  if (!spendReroll(deps, arbiter, player, { chosen, skillSource, rollKind })) {
    return first;
  }

  const second = doRoll();
  deps.eventBus.emit(GameEventNames.RerollUsed, {
    playerId: player.id,
    source: chosen,
    rollKind,
    ...(chosen === "skill" && skillSource && { skill: skillSource }),
    before: first.roll,
    after: second.roll,
  });
  return second;
}

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
  const arbiter = deps.gameService.getRerollArbiter();
  if (
    teamCaptainFreesReroll(deps, player.teamId) ||
    snackStandFreesReroll(deps, player.teamId)
  ) {
    arbiter.markTeamRerollUsed(player.teamId);
  } else {
    arbiter.consumeTeamReroll(player.teamId);
  }
  return gateCtx.allowed;
}

function snackStandFreesReroll(deps: RerollDeps, teamId: string): boolean {
  const state = deps.gameService.getState();
  if (inducementCount(state, teamId, Inducement.SNACK_STAND) === 0)
    return false;
  const roll = deps.gameService
    .getDiceController()
    .rollD6("Snack Stand", teamId);
  if (roll === 6)
    deps.eventBus.emit(
      GameEventNames.UI_GameLog,
      "Snack Stand: a natural 6, the Team Re-roll is free"
    );
  return roll === 6;
}

function teamCaptainFreesReroll(deps: RerollDeps, teamId: string): boolean {
  const team = deps.gameService.getTeam(teamId);
  const captain = team && teamCaptain(team);
  if (!captain?.gridPosition) return false;
  const roll = deps.gameService
    .getDiceController()
    .rollD6("Team Captain", teamId);
  deps.eventBus.emit(GameEventNames.SkillTriggered, {
    playerId: captain.id,
    skill: "Team Captain",
    effect:
      roll === 6
        ? "Team Captain: a natural 6, the Team Re-roll is free"
        : `Team Captain: rolled ${String(roll)}, the Team Re-roll is spent`,
  });
  return roll === 6;
}
