import { Formation, FormationPosition } from "../types/SetupTypes";

/**
 * FormationManager - Pure logic for managing formations (save/load)
 * No Phaser dependencies - 100% unit testable
 */
export class FormationManager {
  private storageKey = "bloodbowl_formations";

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
