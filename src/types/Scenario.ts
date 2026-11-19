import { GamePhase, SubPhase } from "./GameState";
import { PlayerStatus, type PlayerStats, PlayerCondition } from "./Player";
import { RosterName } from "./Team";
import { SkillType } from "./Skills";
import type { Weather } from "../game/rules/weather";
import type { DesperateMeasure } from "../game/inducements/desperateMeasures";

type PlacementSkill =
  | SkillType
  | { type: SkillType; parameter: string | number };

export interface PlayerPlacement {
  playerIndex: number;
  x: number;
  y: number;
  status?: PlayerStatus;

  skills?: PlacementSkill[];

  stats?: Partial<PlayerStats>;

  conditions?: PlayerCondition[];

  veteran?: true;

  teamCaptain?: true;

  hasBall?: true;
}

export interface ScenarioSetup {
  team1Placements: PlayerPlacement[];
  team2Placements: PlayerPlacement[];

  ballPosition?: { x: number; y: number };
  activeTeam: "team1" | "team2";
  turn?: number;
  phase: GamePhase;
  subPhase: SubPhase;
  team1Roster?: RosterName;
  team2Roster?: RosterName;

  weather?: Weather;

  teamRerolls?: { team1?: number; team2?: number };

  measures?: { team1?: DesperateMeasure[]; team2?: DesperateMeasure[] };

  bribes?: { team1?: number; team2?: number };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  setup: ScenarioSetup;
  seed?: number;
  expectedOutcome?: string;
}
