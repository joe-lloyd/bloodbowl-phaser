import type { DiceRollData } from "../../boundary/diceRoll";
import { GameEventNames } from "./names";
import { GamePhase, type GameState, SubPhase } from "../GameState";
import { type Player } from "../Player";
import type { TurnSpend } from "../../game/rules/turnSpend";

export interface MatchGameEvents {
  [GameEventNames.PhaseChanged]: {
    phase: GamePhase;
    subPhase?: SubPhase;
    activeTeamId?: string;
  };
  [GameEventNames.SetupConfirmed]: string;
  [GameEventNames.ReadyToStart]: void;

  [GameEventNames.TurnStarted]: {
    teamId: string;
    turnNumber: number;
    isHalf2?: boolean;
  };
  [GameEventNames.TurnEnded]: { teamId: string };
  [GameEventNames.ActionResolved]: { playerId: string };
  [GameEventNames.RazzleDazzleSecondAction]: { playerId: string };
  [GameEventNames.ActionMustBeRedeclared]: { playerId: string };
  [GameEventNames.TurnDataUpdated]: {
    spend: TurnSpend;
  };

  [GameEventNames.PlayerPlaced]: { playerId: string; x: number; y: number };
  [GameEventNames.PlayerRemoved]: string;
  [GameEventNames.PlayersSwapped]: { player1Id: string; player2Id: string };
  [GameEventNames.PlacementInvalid]: {
    playerId: string;
    x: number;
    y: number;
    reason: string;
  };
  [GameEventNames.SetupRestrictionsUpdated]: import("../SetupTypes").SetupTeamStatus;
  [GameEventNames.SetupConcessionOffered]: {
    teamId: string;
    availablePlayerCount: number;
  };
  [GameEventNames.SetupConcessionResolved]: {
    teamId: string;
    conceded: boolean;
    penaltyFree: true;
  };
  [GameEventNames.PlayerMoved]: {
    playerId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    path?: { x: number; y: number }[];
    followUpData?: {
      attackerId: string;
      targetSquare: { x: number; y: number };
    };

    ballFrom?: { x: number; y: number };

    ballPath?: { x: number; y: number }[];

    ballJoinStep?: number;

    thrown?: boolean;

    presentationId?: string;
  };
  [GameEventNames.PlayerActivated]: string;
  [GameEventNames.PlayerSelected]: { player: Player | null };
  [GameEventNames.PlayerStatusChanged]: Player;
  [GameEventNames.Turnover]: { teamId: string };

  [GameEventNames.SkillTriggered]: {
    playerId: string;
    skill: string;
    effect: string;
  };

  [GameEventNames.RefereeCall]: RefereeCallStep;

  [GameEventNames.RerollUsed]: {
    playerId: string;
    source: import("../decisions").RerollSource;
    rollKind: string;
    skill?: string;

    before: number | number[] | string[];
    after: number | number[] | string[];
  };

  [GameEventNames.DecisionRequested]: import("../decisions").DecisionRequest;
  [GameEventNames.DecisionResolved]: {
    type:
      | import("../decisions").DecisionRequest["type"]
      | "block-dice"
      | "push-direction"
      | "follow-up";

    result?: string;
  };

  [GameEventNames.PlayerStoodUp]: {
    playerId: string;
    cost: number;
  };

  [GameEventNames.Touchdown]: {
    teamId: string;
    score: number;

    scorerId?: string;
  };
  [GameEventNames.DriveEnded]: {
    reason: "touchdown" | "halftime";
    nextKickingTeamId: string | null;
  };
  [GameEventNames.MvpAwarded]: {
    teamId: string;
    playerId: string;
    roll: number;
  };
  [GameEventNames.AwardedTouchdownAssigned]: {
    teamId: string;
    playerId: string;
  };
  [GameEventNames.MatchSppApplied]: void;
  [GameEventNames.CompetitionResultRecorded]: {
    fixtureId: string;

    winnings?: Record<string, number>;

    fanFactors?: Record<string, number>;
  };

  [GameEventNames.ActionModeChanged]: {
    playerId: string;
    action: ActionType;
    blockReplacement?: import("../BlockReplacement").BlockReplacement;
    autoSelectMove: boolean;
  };
  [GameEventNames.PlayerMovedInAction]: {
    playerId: string;
  };

  [GameEventNames.DiceRoll]: DiceRollData;

  [GameEventNames.GameStateRestored]: GameState;
  [GameEventNames.RefreshBoard]: void;

  [GameEventNames.UI_LoadProgress]: { progress: number };
  [GameEventNames.ScenarioLoaded]: {
    name: string;
    seed?: number;
    expectedOutcome?: string;
  };

  [GameEventNames.Camera_ChooseNextPlayer]: {
    teamId: string;
    playerId: string;
  };
  [GameEventNames.Camera_TrackBall]: {
    playerId?: string;
    animationDuration: number;
  };
  [GameEventNames.Camera_Reset]: {
    duration?: number;
  };
  [GameEventNames.Camera_StateChanged]: {
    state: "neutral" | "active";

    duration: number;
  };
}

export type RefereeCallStep = {
  playerId: string;
  teamId: string;

  cause: "foul" | "secret-weapon";
} & (
  | { step: "called" }
  | {
      step: "argued";

      rolls: number[];
      swayed: boolean;
    }
  | { step: "bribed"; roll: number; works: boolean }
  | {
      step: "outcome";
      result: "swayed" | "bribed" | "sent-off";
      presentationId: string;
    }
);

export type ActionType =
  | "move"
  | "block"
  | "multipleBlock"
  | "blitz"
  | "pass"
  | "punt"
  | "handoff"
  | "foul"
  | "throwTeamMate"
  | "secureBall"
  | "special"
  | "stab"
  | "breatheFire"
  | "vomit"
  | "gaze"
  | "chomp"
  | "chainsaw"
  | "throwBomb"
  | "ballAndChain"
  | "forgoe";
