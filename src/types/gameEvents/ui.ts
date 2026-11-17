/**
 * Event payloads for the HUD and the pages around the match: team building,
 * setup, the coin toss, the log and announcements, confirmations, the info
 * panel, re-roll answers and route previews.
 */

import { GameEventNames } from "./names";
import { SubPhase } from "../GameState";
import { Team } from "../Team";
import { Player } from "../Player";
import { SidelineCrewInfo } from "../../game/presentation/sidelineStaff";
import type { StepPrompt } from "./network";
import type { ActionType } from "./match";

export interface CommonUIEvents {
  // Team Builder
  [GameEventNames.UI_PlayerHired]: { position: string };
  [GameEventNames.UI_PlayerFired]: { playerId: string };
  [GameEventNames.UI_TeamSaved]: { team: Team };
  [GameEventNames.UI_TeamNameChanged]: { name: string };
  [GameEventNames.UI_TeamColorChanged]: { primary: number; secondary: number };
  [GameEventNames.UI_RerollPurchased]: void;

  // Game Actions
  [GameEventNames.UI_ActionSelected]: {
    action: ActionType;
    playerId: string;
    blockReplacement?: import("../BlockReplacement").BlockReplacement;
    /** Use Razzle-Dazzle: the first of two Actions this activation. */
    razzleDazzle?: boolean;
  };
  [GameEventNames.UI_ConfirmAction]: { actionId: string };
  [GameEventNames.UI_CancelAction]: void;
  [GameEventNames.UI_EndActivation]: void;
  [GameEventNames.UI_EndTurn]: void;

  // Setup
  [GameEventNames.UI_PlacePlayer]: { playerId: string; x: number; y: number };
  [GameEventNames.UI_RemovePlayer]: { playerId: string };
  [GameEventNames.UI_ConfirmSetup]: void;

  [GameEventNames.UI_LoadScenario]: {
    /** A core scenario id or a rule-catalog configuration id */
    scenarioId: string;
    /** Seed override (e.g. found by the outcome seed search) */
    seed?: number;
    /** Rule-catalog outcome id whose name is surfaced after load */
    outcomeId?: string;
  };

  // Game Start
  [GameEventNames.UI_StartGame]: { team1: Team; team2: Team };

  // Opening weather
  [GameEventNames.UI_StartWeather]: { team1: Team; team2: Team };
  [GameEventNames.UI_WeatherComplete]: void;
  [GameEventNames.UI_RequestWeatherState]: void;

  // Coin Flip
  [GameEventNames.UI_StartCoinFlip]: { team1: Team; team2: Team };
  [GameEventNames.UI_ShowCoinFlip]: void;
  [GameEventNames.UI_CoinFlipComplete]: {
    kickingTeam: Team;
    receivingTeam: Team;
  };
  [GameEventNames.UI_RequestCoinFlipState]: void;

  // Setup Controls
  [GameEventNames.UI_ShowSetupControls]: {
    subPhase: SubPhase;
    activeTeam: { id: string; name: string };
    status?: import("../SetupTypes").SetupTeamStatus;
  };
  [GameEventNames.UI_HideSetupControls]: void;
  [GameEventNames.UI_SetupComplete]: boolean;
  [GameEventNames.UI_SetupAction]: { action: string; name?: string };
  /** The formations pickable for the team currently setting up */
  [GameEventNames.UI_FormationsUpdated]: {
    formations: { name: string; builtIn: boolean }[];
  };

  // Common UI
  /** @deprecated see the enum member's doc comment. */
  [GameEventNames.UI_Notification]: string;
  [GameEventNames.UI_GameLog]: string;
  [GameEventNames.UI_LogEntry]: {
    category: LogEntryCategory;
    /** Names the result, e.g. "Sweltering Heat", "Quick Snap". */
    headline: string;
    /** What the result means in play, authored by the resolving rule. */
    detail?: string;
    /** The roll that produced this outcome, when there was one. */
    roll?: number | number[];
    /** Set only when the outcome is attributable to one coach's team. */
    teamId?: string;
  };
  [GameEventNames.UI_Announce]: AnnouncementMoment;
  [GameEventNames.UI_PresentMoment]: MatchMoment | null;
  [GameEventNames.UI_SkipDriveSequence]: void;

  // Confirmation
  [GameEventNames.UI_RequestConfirmation]: {
    actionId: string;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    risky?: boolean;
    chooserTeamId?: string;
    /** Set for a Dodge, Rush or Pick up prompt; online, the other coach
     *  sees it read-only. */
    step?: StepPrompt;
  };

  [GameEventNames.UI_ConfirmationResult]: {
    confirmed: boolean;
    actionId: string;
  };

  // Turnover Visuals
  [GameEventNames.UI_Turnover]: { teamId: string; reason: string; playerName?: string };

  // Player Info
  [GameEventNames.UI_ShowPlayerInfo]: Player;
  [GameEventNames.UI_HidePlayerInfo]: void;
  [GameEventNames.UI_ShowInfo]: InfoPanelSubject;
  [GameEventNames.UI_DiceInAir]: {
    /** Rolls queued or tumbling now. */
    count: number;
    /** Rolls thrown since the tray mounted, numbered from 1. */
    thrown: number;
    /** Every roll up to this number has landed (or was dropped). */
    landedThrough: number;
  };

  [GameEventNames.UI_DiceThrow]: {
    /** The roll's type, as the engine named it ("Armour Roll (name)"). */
    rollType: string;
    teamId?: string;
    /** The dice total, when the roll has one. */
    total?: number;
    /** Thrown, landed, or its read is over and the tray moves on. */
    stage: "thrown" | "landed" | "done";
  };

  [GameEventNames.UI_RerollResponse]: import("../decisions").RerollDecisionAnswer;
  [GameEventNames.UI_ReactionResponse]: import("../decisions").ReactionDecisionAnswer;
  [GameEventNames.UI_ApothecaryResponse]: import("../decisions").ApothecaryDecisionAnswer;

  [GameEventNames.UI_RoutePreview]: import("../../game/rules/rollPreview").RoutePreview | null;
  [GameEventNames.UI_MovePlan]: (import("../../game/rules/rollPreview").RoutePreview & { squares: number }) | null;
  [GameEventNames.UI_GoMovePlan]: void;
  [GameEventNames.UI_ClearMovePlan]: void;
  [GameEventNames.UI_TargetRollPreview]: (import("../../game/rules/rollPreview").TargetRollPreview & { anchor: { x: number; y: number } }) | null;

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

/**
 * Categories for UI_LogEntry. "info" is the deprecated-alias catch-all for
 * text that has not (yet) been authored with a richer category.
 */
export type LogEntryCategory =
  | "weather"
  | "kickoff"
  | "skill"
  | "reroll"
  | "score"
  | "drive"
  | "action"
  | "info";

/**
 * The closed set of structural transitions the announcer may show. This
 * union is the entry point for banners queued in rule-event order.
 */
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

export interface AnnouncementMoment {
  kind: AnnouncementKind;
  headline: string;
  subtitle?: string;
}

/** One beat the moment queue plays: a banner, or the turnover takeover. */
export type MatchMoment =
  | AnnouncementMoment
  | { kind: "turnover"; reason: string };

/**
 * Discriminated subject for the info panel: a player, or a sideline crew
 * figure (a staff type, or the empty-rail placeholder). Kept as a sibling of
 * the `Player`-typed `UI_ShowPlayerInfo` payload rather than widening it, so
 * existing player-only subscribers do not have to narrow a union.
 */
export type InfoPanelSubject =
  | { kind: "player"; player: Player }
  | { kind: "sidelineCrew"; crew: SidelineCrewInfo };
