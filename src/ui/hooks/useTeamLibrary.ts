/**
 * useTeamLibrary - the coach's saved teams, kept current.
 */

import { useEffect, useState } from "react";
import {
  loadTeams,
  onTeamRepositoryChanged,
} from "../../game/managers/TeamManager";
import { Team } from "../../types/Team";

/**
 * The teams, and a reload for after the page changes them itself. A
 * signed-in coach's library arrives from the cloud after the app loads, so
 * a page that mounted first picks it up when it does.
 */
export function useTeamLibrary(): [Team[], () => void] {
  const [teams, setTeams] = useState<Team[]>(loadTeams);
  useEffect(() => onTeamRepositoryChanged(() => setTeams(loadTeams())), []);
  return [teams, () => setTeams(loadTeams())];
}
