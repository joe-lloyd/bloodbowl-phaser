import { type Formation, type FormationPosition } from "../../types/SetupTypes";
import { getLineOfScrimmageX, SEVENS_GEOMETRY } from "../../config/GameConfig";
import { activeLayout } from "../variants/activeMatch";
import { SetupValidator } from "../validators/SetupValidator";
import {
  DEPLOYMENTS,
  type DeploymentUse,
  deploymentSquares,
  settleSquares,
} from "../setup/deployment";

function settleFormation(
  positions: FormationPosition[],
  isTeam1: boolean
): FormationPosition[] {
  return settleSquares({ layout: activeLayout(), isTeam1 }, positions);
}

export interface FormationEntry {
  name: string;

  builtIn: boolean;

  use: DeploymentUse;

  positions: FormationPosition[];
}

export class FormationManager {
  private storageKey = "bloodbowl_formations";

  getBuiltInFormations(
    isTeam1: boolean
  ): { name: string; use: DeploymentUse; positions: FormationPosition[] }[] {
    const area = { layout: activeLayout(), isTeam1 };
    const validator = new SetupValidator();
    return DEPLOYMENTS.map((deployment) => ({
      name: deployment.name,
      use: deployment.use,
      positions: deploymentSquares(area, deployment),
    })).filter(
      ({ positions }) =>
        validator.validateFormation({
          positions,
          isTeam1,
          availablePlayerCount: positions.length,
        }).valid
    );
  }

  listAllFormations(teamKey: string, isTeam1: boolean): FormationEntry[] {
    return [
      ...this.getBuiltInFormations(isTeam1).map((f) => ({
        ...f,
        builtIn: true,
      })),
      ...(this.getAllFormations()[teamKey] ?? []).map((f) => ({
        name: f.name,
        builtIn: false,
        use: "any" as const,
        positions: f.positions,
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
    return DEPLOYMENTS.some((deployment) => deployment.name === name);
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
