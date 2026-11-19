import { useEffect, useState, useSyncExternalStore } from "react";
import {
  type TeamLibraryStatus,
  getTeamLibraryStatus,
  loadTeams,
  onTeamRepositoryChanged,
} from "../../game/managers/TeamManager";
import { type Team } from "../../types/Team";

export function useTeamLibrary(): [Team[], () => void] {
  const [teams, setTeams] = useState<Team[]>(loadTeams);
  useEffect(() => {
    const reload = () => {
      setTeams(loadTeams());
    };
    const unsubscribe = onTeamRepositoryChanged(reload);

    reload();
    return () => {
      unsubscribe();
    };
  }, []);
  return [
    teams,
    () => {
      setTeams(loadTeams());
    },
  ];
}

export function useTeamLibraryStatus(): TeamLibraryStatus {
  return useSyncExternalStore(onTeamRepositoryChanged, getTeamLibraryStatus);
}
