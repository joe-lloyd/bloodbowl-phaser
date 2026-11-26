import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type TeamLibraryStatus,
  getTeamLibraryStatus,
  loadTeams,
  onTeamRepositoryChanged,
} from "../../game/managers/TeamManager";
import { isTeamSaving, onTeamSaveSettled } from "./teamSaveLock";
import { type Team } from "../../types/Team";

export function useTeamLibrary(): [Team[], () => void] {
  const [teams, setTeams] = useState<Team[]>(loadTeams);
  const readWhileSaving = useRef(false);
  useEffect(() => {
    const reload = () => {
      readWhileSaving.current = isTeamSaving();
      setTeams(loadTeams());
    };
    const stops = [
      onTeamRepositoryChanged(reload),
      onTeamSaveSettled(() => {
        if (readWhileSaving.current) reload();
      }),
    ];
    reload();
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  }, []);
  return [
    teams,
    () => {
      readWhileSaving.current = isTeamSaving();
      setTeams(loadTeams());
    },
  ];
}

export function useTeamLibraryStatus(): TeamLibraryStatus {
  return useSyncExternalStore(onTeamRepositoryChanged, getTeamLibraryStatus);
}
