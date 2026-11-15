/**
 * useTeamLibrary - the coach's saved teams, kept current.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  TeamLibraryStatus,
  getTeamLibraryStatus,
  loadTeams,
  onTeamRepositoryChanged,
} from "../../game/managers/TeamManager";
import { Team } from "../../types/Team";

/**
 * The teams, and a reload for after the page changes them itself. A
 * signed-in coach's library arrives from the cloud after the app loads, so
 * a page that mounted first picks it up when it does. Until the library is
 * loaded there are no teams to show (see TeamLibraryStatus).
 */
export function useTeamLibrary(): [Team[], () => void] {
  const [teams, setTeams] = useState<Team[]>(loadTeams);
  useEffect(() => {
    const reload = () => setTeams(loadTeams());
    const unsubscribe = onTeamRepositoryChanged(reload);
    // The library may have changed between the first render and now.
    reload();
    return () => {
      unsubscribe();
    };
  }, []);
  return [teams, () => setTeams(loadTeams())];
}

/**
 * Whether the coach's library is loaded, still loading, or failed. Read as
 * an external store so a change between render and subscribing is not
 * missed.
 */
export function useTeamLibraryStatus(): TeamLibraryStatus {
  return useSyncExternalStore(onTeamRepositoryChanged, getTeamLibraryStatus);
}
