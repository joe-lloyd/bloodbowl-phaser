import { readStoredTeam } from "../data/persistence/teamPersistence";
import { teamSchema } from "./schemas/Team";

export function readCloudTeam(value: unknown) {
  const { team, warnings } = readStoredTeam(value);
  return { team: teamSchema.parse(team), warnings };
}
