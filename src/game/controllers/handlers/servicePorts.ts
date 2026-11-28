import type { IGameService } from "../../../services/interfaces/IGameService";
import type { ActionCommandService } from "./actionCommands";

export type KickoffService = ActionCommandService & Pick<IGameService, "getTeam" | "startGame">;
export type SetupService = Pick<IGameService, "getState" | "getSubPhase" | "getSetupStatus" |
  "beginMatch" | "startSetup" | "confirmSetup" | "resolveSetupConcession" | "applySetupFormation">;
export type OrchestratorService = KickoffService & SetupService & Pick<IGameService, "getActiveTeamId" | "isSetupComplete">;
