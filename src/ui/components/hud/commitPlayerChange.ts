import type { Player } from "../../../types/Player";
import type { Team } from "../../../types/Team";
import { loadTeams, saveTeam } from "../../../game/managers/TeamManager";
import { dehydrateTeam } from "../../../data/persistence/teamPersistence";
import { restoreTeam } from "../../../headless/serialization";

const NOT_SAVED = "The team could not be saved, so nothing was changed.";

export async function commitPlayerChange(
  team: Team,
  playerId: string,
  change: (latestTeam: Team, latestPlayer: Player) => void
): Promise<void> {
  const stored = loadTeams().find((t) => t.id === team.id);
  const latestTeam = structuredClone(stored);
  const latestPlayer = latestTeam?.players.find((p) => p.id === playerId);
  if (!latestTeam || !latestPlayer) {
    throw new Error("This player could not be found in the saved team.");
  }
  change(latestTeam, latestPlayer);
  await commitTeam(team, latestTeam);
}

export async function commitTeam(team: Team, changed: Team): Promise<void> {
  try {
    await saveTeam(changed);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${NOT_SAVED} ${reason}`);
  }
  const stored = loadTeams().find((t) => t.id === team.id);
  if (
    !stored ||
    JSON.stringify(dehydrateTeam(stored)) !==
      JSON.stringify(dehydrateTeam(changed))
  ) {
    throw new Error(NOT_SAVED);
  }
  restoreTeam(team, changed);
}
