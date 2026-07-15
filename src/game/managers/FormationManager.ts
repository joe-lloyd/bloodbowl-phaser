import { Formation, FormationPosition } from "../../types/SetupTypes";

/** A formation as shown in the setup dropdown */
export interface FormationEntry {
  name: string;
  /** Built-in presets can be loaded but not overwritten or deleted */
  builtIn: boolean;
}

/**
 * FormationManager - Pure logic for managing formations (save/load)
 * No Phaser dependencies - 100% unit testable
 *
 * Two sources: a few built-in generic presets (generated per pitch side)
 * and named custom formations saved to localStorage per team key.
 * Positions store the player's roster index in `playerId` so a layout
 * survives fresh team instances between matches.
 */
export class FormationManager {
  private storageKey = "bloodbowl_formations";

  /**
   * Built-in presets, mirrored for the pitch side. LOS is x=6 (team 1) /
   * x=13 (team 2); the setup zone is 7 columns deep and y 0-10.
   */
  getBuiltInFormations(
    isTeam1: boolean
  ): { name: string; positions: FormationPosition[] }[] {
    // depth(n) = n squares behind the line of scrimmage
    const los = isTeam1 ? 6 : 13;
    const depth = (n: number) => (isTeam1 ? los - n : los + n);
    const at = (index: number, x: number, y: number): FormationPosition => ({
      playerId: String(index),
      x,
      y,
    });

    return [
      {
        // 3 on the line, 2 mid wings, 2 deep
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
        // wide line + sideline wings for coverage
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
        // tight cage around the middle, one deep safety
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

  /** Everything pickable in the dropdown: built-ins first, then customs. */
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

  /** Resolve a formation by name: custom saves win over built-in presets. */
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

  /**
   * Save a formation to localStorage
   */
  saveFormation(
    teamId: string,
    positions: FormationPosition[],
    name: string
  ): void {
    const formations = this.getAllFormations();

    if (!formations[teamId]) {
      formations[teamId] = [];
    }

    // Remove existing formation with same name
    formations[teamId] = formations[teamId].filter((f) => f.name !== name);

    // Add new formation
    formations[teamId].push({
      name,
      positions: positions.map((p) => ({ ...p })), // Deep copy
    });

    this.saveToStorage(formations);
  }

  /**
   * Load a formation from localStorage
   */
  loadFormation(teamId: string, name: string): FormationPosition[] | null {
    const formations = this.getAllFormations();

    if (!formations[teamId]) {
      return null;
    }

    const formation = formations[teamId].find((f) => f.name === name);
    return formation ? formation.positions.map((p) => ({ ...p })) : null;
  }

  /**
   * List all formation names for a team
   */
  listFormations(teamId: string): string[] {
    const formations = this.getAllFormations();
    return formations[teamId]?.map((f) => f.name) || [];
  }

  /**
   * Delete a formation
   */
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

  /**
   * Get default formation for a team
   * Simple 3-4 setup: 3 on line of scrimmage, 4 in backfield
   */
  getDefaultFormation(isTeam1: boolean): FormationPosition[] {
    const losX = isTeam1 ? 6 : 13; // Line of scrimmage
    const backX = isTeam1 ? 3 : 16; // Backfield

    return [
      // 3 on LOS (vertical line, spread across y-axis)
      { playerId: "0", x: losX, y: 4 }, // Center
      { playerId: "1", x: losX, y: 2 }, // Top
      { playerId: "2", x: losX, y: 6 }, // Bottom

      // 4 in backfield/wide zones
      { playerId: "3", x: losX, y: 5 }, // Center back
      { playerId: "4", x: backX, y: 1 }, // Top wide
      { playerId: "5", x: backX, y: 9 }, // Bottom wide
      { playerId: "6", x: losX - (isTeam1 ? 1 : -1), y: 5 }, // Support
    ];
  }

  /**
   * Clear all formations for a team
   */
  clearFormations(teamId: string): void {
    const formations = this.getAllFormations();
    delete formations[teamId];
    this.saveToStorage(formations);
  }

  // Private helper methods

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
