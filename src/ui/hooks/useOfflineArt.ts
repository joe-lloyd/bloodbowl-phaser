import { useEffect, useSyncExternalStore } from "react";
import {
  keepRosters,
  offlineArt,
  subscribeOfflineArt,
  wantModels,
  type OfflineArt,
} from "../../boundary/offlineArt";
import { runsInstalled } from "../../boundary/pwa";
import { rosterModels } from "../../game/presentation/playerArt";
import type { Team } from "../../types/Team";

function subscribeOnline(listener: () => void): () => void {
  addEventListener("online", listener);
  addEventListener("offline", listener);
  return () => {
    removeEventListener("online", listener);
    removeEventListener("offline", listener);
  };
}

export function useOfflineArt(): OfflineArt {
  return useSyncExternalStore(subscribeOfflineArt, offlineArt);
}

export function useOnline(): boolean {
  const art = useOfflineArt();
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine) && art.reachable;
}

export function rosterReady(art: OfflineArt, rosterName: string): boolean {
  return rosterModels(rosterName).every((model) => art.ready.has(model));
}

export function missingBytes(art: OfflineArt, rosterNames: readonly string[]): number {
  const models = new Set(rosterNames.flatMap((roster) => rosterModels(roster)));
  return [...models]
    .filter((model) => !art.ready.has(model))
    .reduce((sum, model) => sum + (art.bytes[model] ?? 0), 0);
}

export function useKeepOfflineArt(library: readonly Team[]): void {
  const art = useOfflineArt();
  const own = runsInstalled ? library.map((team) => team.rosterName) : [];
  const key = [...new Set([...own, ...art.rosters])]
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  useEffect(() => {
    wantModels(key ? key.split("|").flatMap((roster) => rosterModels(roster)) : []);
  }, [key]);
}

export function keepOpponentArt(rosterName: string): void {
  if (runsInstalled) keepRosters([rosterName]);
}
