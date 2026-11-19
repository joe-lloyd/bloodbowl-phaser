import { type Formation, type FormationPosition } from "../../types/SetupTypes";
import { getLineOfScrimmageX, SEVENS_GEOMETRY } from "../../config/GameConfig";

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
    const at = (index: number, x: number, y: number): FormationPosition => ({
      playerId: String(index),
      x,
      y,
    });

    return [
      {
        name: "Balanced",
        positions: [
          at(0, los, 4),
          at(1, los, 5),
          at(2, los, 6),
          at(3, depth(2), 2),
          at(4, depth(2), 8),
          at(5, depth(4), 4),
          at(6, depth(4), 6),
        ],
      },
      {
        name: "Spread",
        positions: [
          at(0, los, 3),
          at(1, los, 5),
          at(2, los, 7),
          at(3, depth(2), 0),
          at(4, depth(2), 10),
          at(5, depth(4), 2),
          at(6, depth(4), 8),
        ],
      },
      {
        name: "Bunker",
        positions: [
          at(0, los, 4),
          at(1, los, 5),
          at(2, los, 6),
          at(3, depth(1), 4),
          at(4, depth(1), 6),
          at(5, depth(2), 5),
          at(6, depth(4), 5),
        ],
      },
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

    return [
      { playerId: "0", x: losX, y: 4 },
      { playerId: "1", x: losX, y: SEVENS_GEOMETRY.CENTRE_FIELD_ROWS.min },
      { playerId: "2", x: losX, y: 6 },

      { playerId: "3", x: losX, y: 5 },
      { playerId: "4", x: backX, y: 1 },
      { playerId: "5", x: backX, y: 9 },
      { playerId: "6", x: losX - (isTeam1 ? 1 : -1), y: 5 },
    ];
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
