import { type Formation, type FormationPosition } from "../../types/SetupTypes";
import {
  getLineOfScrimmageX,
  getSevensSetupZone,
  SEVENS_GEOMETRY,
} from "../../config/GameConfig";
import { activeLayout } from "../variants/activeMatch";
import { isPlayableSquare } from "../variants/pitchLayouts";

const squareKey = (x: number, y: number) => `${String(x)},${String(y)}`;

function nearestFreeSquare(
  wanted: FormationPosition,
  taken: Set<string>,
  isTeam1: boolean
): { x: number; y: number } {
  const layout = activeLayout();
  const zone = getSevensSetupZone(isTeam1);
  const free = (x: number, y: number) =>
    x >= zone.minX &&
    x <= zone.maxX &&
    isPlayableSquare(layout, { x, y }) &&
    !taken.has(squareKey(x, y));
  for (let reach = 0; reach < layout.cols; reach++) {
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const x = wanted.x + dx;
        const y = wanted.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) === reach && free(x, y))
          return { x, y };
      }
    }
  }
  return wanted;
}

function settleFormation(
  positions: FormationPosition[],
  isTeam1: boolean
): FormationPosition[] {
  const taken = new Set<string>();
  return positions.map((position) => {
    const square = nearestFreeSquare(position, taken, isTeam1);
    taken.add(squareKey(square.x, square.y));
    return { ...position, ...square };
  });
}

export interface FormationEntry {
  name: string;

  builtIn: boolean;
}

export class FormationManager {
  private storageKey = "bloodbowl_formations";

  getBuiltInFormations(
    isTeam1: boolean
  ): { name: string; positions: FormationPosition[] }[] {
    const los = getLineOfScrimmageX(isTeam1);
    const depth = (n: number) => (isTeam1 ? los - n : los + n);
    const { rows, centreRows } = activeLayout();
    const mid = Math.floor(rows / 2);
    const inCentre = (y: number) =>
      Math.min(centreRows.max, Math.max(centreRows.min, y));
    const shape = (
      name: string,
      squares: readonly (readonly [number, number])[]
    ) => ({
      name,
      positions: settleFormation(
        squares.map(([x, y], index) => ({ playerId: String(index), x, y })),
        isTeam1
      ),
    });

    return [
      shape("Balanced", [
        [los, mid - 1],
        [los, mid],
        [los, mid + 1],
        [depth(2), centreRows.min],
        [depth(2), centreRows.max],
        [depth(4), mid - 1],
        [depth(4), mid + 1],
      ]),
      shape("Spread", [
        [los, inCentre(mid - 2)],
        [los, mid],
        [los, inCentre(mid + 2)],
        [depth(2), 0],
        [depth(2), rows - 1],
        [depth(4), centreRows.min],
        [depth(4), centreRows.max],
      ]),
      shape("Bunker", [
        [los, mid - 1],
        [los, mid],
        [los, mid + 1],
        [depth(1), mid - 1],
        [depth(1), mid + 1],
        [depth(2), mid],
        [depth(4), mid],
      ]),
    ];
  }

  listAllFormations(teamKey: string, isTeam1: boolean): FormationEntry[] {
    return [
      ...this.getBuiltInFormations(isTeam1).map((f) => ({
        name: f.name,
        builtIn: true,
      })),
      ...this.listFormations(teamKey).map((name) => ({
        name,
        builtIn: false,
      })),
    ];
  }

  getFormation(
    teamKey: string,
    name: string,
    isTeam1: boolean
  ): FormationPosition[] | null {
    const custom = this.loadFormation(teamKey, name);
    if (custom) return custom;
    const builtIn = this.getBuiltInFormations(isTeam1).find(
      (f) => f.name === name
    );
    return builtIn ? builtIn.positions.map((p) => ({ ...p })) : null;
  }

  isBuiltIn(name: string): boolean {
    return this.getBuiltInFormations(true).some((f) => f.name === name);
  }

  saveFormation(
    teamId: string,
    positions: FormationPosition[],
    name: string
  ): void {
    const formations = this.getAllFormations();

    if (!formations[teamId]) {
      formations[teamId] = [];
    }

    formations[teamId] = formations[teamId].filter((f) => f.name !== name);

    formations[teamId].push({
      name,
      positions: positions.map((p) => ({ ...p })),
    });

    this.saveToStorage(formations);
  }

  loadFormation(teamId: string, name: string): FormationPosition[] | null {
    const formations = this.getAllFormations();

    if (!formations[teamId]) {
      return null;
    }

    const formation = formations[teamId].find((f) => f.name === name);
    return formation ? formation.positions.map((p) => ({ ...p })) : null;
  }

  listFormations(teamId: string): string[] {
    const formations = this.getAllFormations();
    return formations[teamId]?.map((f) => f.name) || [];
  }

  deleteFormation(teamId: string, name: string): boolean {
    const formations = this.getAllFormations();

    if (!formations[teamId]) {
      return false;
    }

    const initialLength = formations[teamId].length;
    formations[teamId] = formations[teamId].filter((f) => f.name !== name);

    if (formations[teamId].length < initialLength) {
      this.saveToStorage(formations);
      return true;
    }

    return false;
  }

  getDefaultFormation(isTeam1: boolean): FormationPosition[] {
    const losX = getLineOfScrimmageX(isTeam1);
    const backX = isTeam1
      ? Math.max(SEVENS_GEOMETRY.END_ZONE_X.team1, losX - 3)
      : Math.min(SEVENS_GEOMETRY.END_ZONE_X.team2, losX + 3);
    const { rows, centreRows, wideZoneRows } = activeLayout();
    const mid = Math.floor(rows / 2);

    return settleFormation(
      [
        { playerId: "0", x: losX, y: mid - 1 },
        { playerId: "1", x: losX, y: centreRows.min },
        { playerId: "2", x: losX, y: mid + 1 },

        { playerId: "3", x: losX, y: mid },
        { playerId: "4", x: backX, y: wideZoneRows.top.max },
        { playerId: "5", x: backX, y: wideZoneRows.bottom.min },
        { playerId: "6", x: losX - (isTeam1 ? 1 : -1), y: mid },
      ],
      isTeam1
    );
  }

  clearFormations(teamId: string): void {
    const formations = this.getAllFormations();
    delete formations[teamId];
    this.saveToStorage(formations);
  }

  private getAllFormations(): Record<string, Formation[]> {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("Failed to load formations:", error);
      return {};
    }
  }

  private saveToStorage(formations: Record<string, Formation[]>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(formations));
    } catch (error) {
      console.error("Failed to save formations:", error);
    }
  }
}
