import type { FormationEntry } from "../../game/managers/FormationManager";
import { GameEventNames } from "./names";
import { SubPhase } from "../GameState";
import { type Team } from "../Team";
import { type Player } from "../Player";
import { type SidelineCrewInfo } from "../../game/presentation/sidelineStaff";
import type { StepPrompt } from "./network";
import type { ActionType } from "./match";

export interface CommonUIEvents {
  [GameEventNames.UI_PlayerHired]: { position: string };
  [GameEventNames.UI_PlayerFired]: { playerId: string };
  [GameEventNames.UI_TeamSaved]: { team: Team };
  [GameEventNames.UI_TeamNameChanged]: { name: string };
  [GameEventNames.UI_TeamColorChanged]: { primary: number; secondary: number };
  [GameEventNames.UI_RerollPurchased]: void;

  [GameEventNames.UI_ActionSelected]: {
    action: ActionType;
    playerId: string;
    blockReplacement?: import("../BlockReplacement").BlockReplacement;

    razzleDazzle?: boolean;
  };
  [GameEventNames.UI_ConfirmAction]: { actionId: string };
  [GameEventNames.UI_CancelAction]: void;
  [GameEventNames.UI_EndActivation]: void;
  [GameEventNames.UI_EndTurn]: void;

  [GameEventNames.UI_PlacePlayer]: { playerId: string; x: number; y: number };
  [GameEventNames.UI_RemovePlayer]: { playerId: string };
  [GameEventNames.UI_ConfirmSetup]: void;

  [GameEventNames.UI_LoadScenario]: {
    scenarioId: string;

    seed?: number;

    outcomeId?: string;
  };

  [GameEventNames.UI_StartGame]: { team1: Team; team2: Team };

  [GameEventNames.UI_StartWeather]: { team1: Team; team2: Team };
  [GameEventNames.UI_WeatherComplete]: void;
  [GameEventNames.UI_RequestWeatherState]: void;

  [GameEventNames.UI_StartCoinFlip]: { team1: Team; team2: Team };
  [GameEventNames.UI_ShowCoinFlip]: void;
  [GameEventNames.UI_CoinFlipComplete]: {
    kickingTeam: Team;
    receivingTeam: Team;
  };
  [GameEventNames.UI_RequestCoinFlipState]: void;

  [GameEventNames.UI_ShowSetupControls]: {
    subPhase: SubPhase;
    activeTeam: { id: string; name: string };
    status?: import("../SetupTypes").SetupTeamStatus;
  };
  [GameEventNames.UI_HideSetupControls]: void;
  [GameEventNames.UI_SetupComplete]: boolean;
  [GameEventNames.UI_SetupAction]: { action: string; name?: string };

  [GameEventNames.UI_FormationsUpdated]: {
    formations: FormationEntry[];
    isTeam1: boolean;
  };

  [GameEventNames.UI_Notification]: string;
  [GameEventNames.UI_GameLog]: string;
  [GameEventNames.UI_LogEntry]: {
    category: LogEntryCategory;

    headline: string;

    detail?: string;

    roll?: number | number[];

    teamId?: string;
  };
  [GameEventNames.UI_Announce]: AnnouncementMoment;
  [GameEventNames.UI_PresentMoment]: MatchMoment | null;
  [GameEventNames.UI_SkipDriveSequence]: void;

  [GameEventNames.UI_RequestConfirmation]: {
    actionId: string;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    alternativeLabel?: string;
    risky?: boolean;
    chooserTeamId?: string;

    step?: StepPrompt;
  };

  [GameEventNames.UI_ConfirmationResult]: {
    confirmed: boolean;
    alternative?: true;
    actionId: string;
  };

  [GameEventNames.UI_Turnover]: {
    teamId: string;
    reason: string;
    playerName?: string;
  };

  [GameEventNames.UI_ShowPlayerInfo]: Player;
  [GameEventNames.UI_HidePlayerInfo]: void;
  [GameEventNames.UI_ShowInfo]: InfoPanelSubject;
  [GameEventNames.UI_DiceInAir]: {
    count: number;

    thrown: number;

    landedThrough: number;
  };

  [GameEventNames.UI_DiceThrow]: {
    seq: number;

    rollType: string;
    teamId?: string;

    total?: number;

    stage: "queued" | "thrown" | "landed" | "done" | "dropped";
  };

  [GameEventNames.UI_RerollResponse]: import("../decisions").RerollDecisionAnswer;
  [GameEventNames.UI_ReactionResponse]: import("../decisions").ReactionDecisionAnswer;
  [GameEventNames.UI_ApothecaryResponse]: import("../decisions").ApothecaryDecisionAnswer;

  [GameEventNames.UI_RoutePreview]:
    | import("../../game/rules/rollPreview").RoutePreview
    | null;
  [GameEventNames.UI_ActionPlan]:
    | import("../../game/rules/actionPlan").ActionPlanSummary
    | null;
  [GameEventNames.UI_GoMovePlan]: void;
  [GameEventNames.UI_ClearMovePlan]: void;
  [GameEventNames.UI_TargetRollPreview]:
    | (import("../../game/rules/rollPreview").TargetRollPreview & {
        anchor: { x: number; y: number };
      })
    | null;

  [GameEventNames.UI_UpdateActionSteps]: {
    currentStepId: string;
    steps: { id: string; label: string }[];
  };

  [GameEventNames.UI_WizardTargeting]: {
    spell: import("../decisions").WizardSpell | null;
  };

  [GameEventNames.UI_StepSelected]: {
    stepId: string;
  };
}

export type LogEntryCategory =
  | "weather"
  | "kickoff"
  | "skill"
  | "reroll"
  | "score"
  | "drive"
  | "action"
  | "info";

export type AnnouncementKind =
  | "team-intro"
  | "weather"
  | "time-up"
  | "turn-started"
  | "halftime"
  | "full-time"
  | "touchdown"
  | "kickoff-result"
  | "casualty"
  | "next-kicker";

interface AnnouncementMoment {
  kind: AnnouncementKind;
  headline: string;
  subtitle?: string;
}

export type MatchMoment =
  | AnnouncementMoment
  | { kind: "turnover"; reason: string };

type InfoPanelSubject =
  | { kind: "player"; player: Player }
  | { kind: "sidelineCrew"; crew: SidelineCrewInfo };
