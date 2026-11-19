import { type Player } from "../../types/Player";
import { type RerollableRollKind } from "../../types/decisions";
import { type Team } from "../../types/Team";
import { type EditDecision } from "./teamEditLegality";
import { isLinemanPosition } from "./rosterLegality";
import { isActiveTeam } from "./teamLifecycle";

export const VETERAN_REROLL_KINDS: readonly RerollableRollKind[] = [
  "pickup",
  "catch",
  "pass",
];

function setVeteran(player: Player, veteran: boolean): void {
  if (!!player.veteran === veteran) return;
  if (veteran) {
    player.veteran = true;
    player.stats.MA -= 1;
  } else {
    delete player.veteran;
    player.stats.MA += 1;
  }
}

export function chooseVeteran(team: Team, playerId: string): EditDecision {
  if (isActiveTeam(team)) {
    return {
      allowed: false,
      reason: "The Veteran is chosen when drafting the team.",
    };
  }
  const chosen = team.players.find((player) => player.id === playerId);
  if (!chosen || !isLinemanPosition(chosen.keywords)) {
    return {
      allowed: false,
      reason: "The Veteran must be a player with the Lineman keyword.",
    };
  }
  team.players.forEach((player) => {
    setVeteran(player, player === chosen);
  });
  return { allowed: true };
}

export function chooseFirstLinemanAsVeteran(team: Team): void {
  const first = team.players.find((player) =>
    isLinemanPosition(player.keywords)
  );
  if (first)
    team.players.forEach((player) => {
      setVeteran(player, player === first);
    });
}
