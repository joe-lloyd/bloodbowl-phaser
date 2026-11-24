import { useState } from "react";
import type { Team } from "../../../types/Team";
import { diceTeam } from "../hud/diceTrayData";
import type { RollThrow } from "./rollThrows";

export function useRollTray(team: Team) {
  const [look] = useState(() => diceTeam(team, team.colors));
  const [shown, setShown] = useState<{
    id: number;
    throws: RollThrow[];
    then?: (() => void) | undefined;
  } | null>(null);
  const [rolling, setRolling] = useState(false);
  return {
    look,
    shown,
    rolling,
    roll: (throws: RollThrow[], then?: () => void) => {
      if (throws.length === 0) {
        then?.();
        return;
      }
      setShown((before) => ({ id: (before?.id ?? 0) + 1, throws, then }));
      setRolling(true);
    },
    landed: () => {
      setRolling(false);
      shown?.then?.();
    },
    clear: () => {
      setShown(null);
    },
  };
}

export type RollTrayState = ReturnType<typeof useRollTray>;
