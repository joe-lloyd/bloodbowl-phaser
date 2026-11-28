import { souvenirModifier } from "../inducements/souvenirModifiers";
import { GameEventNames } from "../../types/events";
import { SkillType, hasSkill } from "../../types/Skills";
import type { FlowContext } from "../core/GameFlowManager";
import { type IGameService } from "../../services/interfaces/IGameService";
import type { Player } from "../../types/Player";
import { chooseInterceptor } from "./interceptionChoice";
import { lostBallHandling } from "../kickoff/ballConditions";
import { interceptModifiers } from "../rules/rollPreview";
import { chebyshev } from "../rules/chebyshev";

interface Flight {
  readonly target: { x: number; y: number };
  readonly accurate: boolean;
  readonly cloudBurster: boolean;
}

interface Group {
  readonly teamId: string;
  readonly players: readonly Player[];
  readonly nearest: number;
}

function settle<G>(tied: readonly G[], rollFor: (group: G) => number): G[] {
  if (tied.length < 2) return [...tied];
  const rolled = tied.map((group) => ({ group, roll: rollFor(group) }));
  const rolls = [...new Set(rolled.map(({ roll }) => roll))].sort((a, b) => b - a);
  return rolls.flatMap((roll) =>
    settle(
      rolled.filter((entry) => entry.roll === roll).map(({ group }) => group),
      rollFor
    )
  );
}

export function interferenceOrder<G extends { readonly nearest: number }>(
  groups: readonly G[],
  rollFor: (group: G) => number
): G[] {
  const distances = [...new Set(groups.map(({ nearest }) => nearest))].sort(
    (a, b) => a - b
  );
  return distances.flatMap((distance) =>
    settle(
      groups.filter(({ nearest }) => nearest === distance),
      rollFor
    )
  );
}

function eligibleInterceptors(
  gameService: IGameService,
  passer: Player,
  flight: Flight
): { player: Player; modifier: number }[] {
  if (!passer.gridPosition) return [];
  const eligible = gameService.getPassController().checkInterceptions({
    from: passer.gridPosition,
    target: flight.target,
    opponents: gameService.getOpponents(passer.teamId),
    isAccurate: flight.accurate,
  });
  const reaches = (player: Player) =>
    !flight.cloudBurster || hasSkill(player.skills, SkillType.VERY_LONG_LEGS);
  return eligible
    .map(({ playerId, modifier }) => ({
      player: gameService.getPlayerById(playerId),
      modifier,
    }))
    .filter(
      (entry): entry is { player: Player; modifier: number } =>
        entry.player !== undefined && reaches(entry.player)
    );
}

function groupByTeam(
  passer: Player,
  eligible: readonly { player: Player; modifier: number }[]
): (Group & { entries: typeof eligible })[] {
  const from = passer.gridPosition;
  const teamIds = [...new Set(eligible.map(({ player }) => player.teamId))];
  return teamIds.map((teamId) => {
    const entries = eligible.filter(({ player }) => player.teamId === teamId);
    const players = entries.map(({ player }) => player);
    const nearest = Math.min(
      ...players.map((player) =>
        from && player.gridPosition ? chebyshev(from, player.gridPosition) : Infinity
      )
    );
    return { teamId, players, nearest, entries };
  });
}

function candidatesOf(
  { gameService, eventBus }: FlowContext,
  entries: readonly { player: Player; modifier: number }[]
) {
  const state = gameService.getState();
  return entries.map(({ player, modifier }) => {
    const { base, marking, total } = interceptModifiers(
      player,
      modifier,
      gameService.getOpponents(player.teamId),
      state.weather
    );
    if (hasSkill(player.skills, SkillType.VERY_LONG_LEGS)) {
      eventBus.emit(GameEventNames.SkillTriggered, {
        playerId: player.id,
        skill: SkillType.VERY_LONG_LEGS,
        effect: "Very Long Legs: +2 to the interception (ignores Cloud Burster)",
      });
    }
    const lostBall = lostBallHandling(state);
    const souvenir = souvenirModifier(state, player.id, "intercept");
    return {
      playerId: player.id,
      playerName: player.playerName,
      base: base + lostBall,
      marking,
      modifier: total + lostBall + souvenir,
    };
  });
}

async function attempt(
  context: FlowContext,
  passer: Player,
  entries: readonly { player: Player; modifier: number }[]
): Promise<Player | undefined> {
  const { gameService, eventBus } = context;
  const chosen = await chooseInterceptor(
    gameService,
    passer.id,
    candidatesOf(context, entries)
  );
  const interceptor = chosen && gameService.getPlayerById(chosen.playerId);
  if (!chosen || !interceptor) return undefined;
  eventBus.emit(GameEventNames.InterceptionAttempted, {
    passerId: passer.id,
    interceptorId: interceptor.id,
    modifier: chosen.modifier,
  });
  const outcome = gameService.getPassController().attemptInterception(
    interceptor,
    chosen.base +
      souvenirModifier(gameService.getState(), interceptor.id, "intercept"),
    chosen.marking
  );
  if (outcome.success) return interceptor;
  eventBus.emit(GameEventNames.InterceptionFailed, {
    passerId: passer.id,
    interceptorId: interceptor.id,
    roll: outcome.roll,
  });
  return undefined;
}

export async function resolveInterception(
  context: FlowContext,
  passer: Player,
  flight: Flight
): Promise<Player | undefined> {
  const { gameService } = context;
  const groups = groupByTeam(passer, eligibleInterceptors(gameService, passer, flight));
  const dice = gameService.getDiceController();
  const order = interferenceOrder(groups, ({ teamId }) =>
    dice.rollD6("Interception roll-off", teamId)
  );
  for (const { entries } of order) {
    const interceptor = await attempt(context, passer, entries);
    if (interceptor) return interceptor;
  }
  return undefined;
}
