import { Player, PositionKeyWord } from "@/types/Player";
import {
  FormationPosition,
  SetupPlayerLimits,
  SetupState,
  SetupTeamStatus,
} from "@/types/SetupTypes";
import { SetupValidator } from "../validators/SetupValidator";

/** A team's Swarming roll and the formation it confirmed before rolling. */
type SwarmAllowance = NonNullable<SetupState["swarming"]>["teams"][string];

/** Reserve Linemen Swarming could add: available and not in the formation. */
function swarmReserveCount(swarm: SwarmAllowance, eligible: Player[]): number {
  return eligible.filter(
    (player) =>
      !swarm.basePlayerIds.includes(player.id) &&
      player.keywords.includes(PositionKeyWord.LINEMAN)
  ).length;
}

/** How many players a Swarming team may field; undefined outside Swarming. */
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

/** The status a team has before setup has looked at it. */
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

/**
 * One team's setup status: the formation's restrictions, the Team Captain
 * and concession rules on top, and whether the coach may confirm.
 */
export function teamSetupStatus(input: {
  teamId: string;
  isTeam1: boolean;
  positions: FormationPosition[];
  /** The players the team can field this drive. */
  eligible: Player[];
  /** The Team Captain, when they are able to play. */
  captain: Player | undefined;
  setup: SetupState;
  validator: SetupValidator;
}): SetupTeamStatus {
  const { teamId, positions, eligible, captain, setup } = input;
  const swarm = setup.swarming?.teams[teamId];
  const availablePlayerCount = eligible.length;
  const validation = input.validator.validateFormation(
    positions,
    input.isTeam1,
    availablePlayerCount,
    swarmPlayerLimits(setup, teamId, eligible)
  );
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
    ...(swarm
      ? {
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
        }
      : {}),
  };
}
