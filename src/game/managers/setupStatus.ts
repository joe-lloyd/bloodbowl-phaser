import { type Player, PositionKeyWord } from "@/types/Player";
import {
  type FormationPosition,
  type SetupPlayerLimits,
  type SetupState,
  type SetupTeamStatus,
} from "@/types/SetupTypes";
import { SetupValidator } from "../validators/SetupValidator";

type SwarmAllowance = NonNullable<SetupState["swarming"]>["teams"][string];

function swarmReserveCount(swarm: SwarmAllowance, eligible: Player[]): number {
  return eligible.filter(
    (player) =>
      !swarm.basePlayerIds.includes(player.id) &&
      player.keywords.includes(PositionKeyWord.LINEMAN)
  ).length;
}

export function swarmPlayerLimits(
  setup: SetupState | undefined,
  teamId: string,
  eligible: Player[]
): SetupPlayerLimits | undefined {
  const swarm = setup?.swarming?.teams[teamId];
  if (!swarm) return undefined;
  return {
    minimum: swarm.basePlayerIds.length,
    maximum: Math.min(
      swarm.basePlayerIds.length + swarm.roll,
      swarm.basePlayerIds.length + swarmReserveCount(swarm, eligible)
    ),
  };
}

export function emptySetupStatus(teamId: string): SetupTeamStatus {
  return {
    teamId,
    placedPlayerCount: 0,
    requiredPlayerCount: 0,
    availablePlayerCount: 0,
    restrictions: [],
    canConfirm: false,
    concessionDecision: "not-offered",
  };
}

export function teamSetupStatus(input: {
  teamId: string;
  isTeam1: boolean;
  positions: FormationPosition[];

  eligible: Player[];

  captain: Player | undefined;
  setup: SetupState;
  validator: SetupValidator;
}): SetupTeamStatus {
  const { teamId, positions, eligible, captain, setup } = input;
  const swarm = setup.swarming?.teams[teamId];
  const availablePlayerCount = eligible.length;
  const validation = input.validator.validateFormation({ positions: positions, isTeam1: input.isTeam1, availablePlayerCount: availablePlayerCount, limits: swarmPlayerLimits(setup, teamId, eligible) });
  const concessionDecision =
    setup.teams[teamId]?.concessionDecision ??
    (availablePlayerCount <= 3 ? "pending" : "not-offered");
  const restrictions = [...validation.restrictions];
  if (captain) {
    restrictions.push({
      id: "team-captain",
      summary: `Team Captain: ${captain.playerName}`,
      satisfied: positions.some((position) => position.playerId === captain.id),
      satisfiable: true,
      message: "The Team Captain must be set up while they are able to play.",
    });
  }
  if (concessionDecision === "pending") {
    restrictions.push({
      id: "concession-decision",
      satisfied: false,
      satisfiable: true,
      message: "Choose whether to concede without penalty or play on.",
    });
  }
  return {
    teamId,
    placedPlayerCount: positions.length,
    requiredPlayerCount:
      swarm?.basePlayerIds.length ?? Math.min(7, availablePlayerCount),
    availablePlayerCount,
    restrictions,
    canConfirm:
      restrictions.every(
        (restriction) => !restriction.satisfiable || restriction.satisfied
      ) && concessionDecision !== "pending",
    concessionDecision,
    ...(swarm && {
          swarming: {
            roll: swarm.roll,
            additionalPlayerCount: positions.filter(
              (position) => !swarm.basePlayerIds.includes(position.playerId)
            ).length,
            maximumAdditionalPlayers: Math.min(
              swarm.roll,
              swarmReserveCount(swarm, eligible)
            ),
          },
        }),
  };
}
