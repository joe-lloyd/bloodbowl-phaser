/**
 * Gallery variants for the whole HUD, and the score bug and turn tab above the
 * pitch.
 */
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { RosterName } from "../types/Team";
import { GameHUD } from "../ui/components/hud/GameHUD";
import { MatchStrip } from "../ui/components/hud/MatchStrip";
import { ScoreBoard } from "../ui/components/hud/ScoreBoard";
import { TurnIndicator } from "../ui/components/hud/TurnIndicator";
import {
  LONG,
  fillLog,
  later,
  routed,
  score,
  setScore,
} from "./variantHelpers";
import type { Variant } from "./variants";

export const HUD_VARIANTS: Variant[] = [
  // ---- Whole HUD
  {
    id: "hud-play",
    section: "Whole HUD",
    title: "In play, a player selected (sandbox)",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} mode="sandbox" />),
    drive: (fx) =>
      later(80, () => {
        setScore(fx, 1, 0);
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        });
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Block & Injury Test",
          seed: 10,
          expectedOutcome: "Defender will be stunned",
        });
        fillLog(fx, 1);
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player:
            fx.services.gameService.getPlayerById(fx.player(2, 0).id) ??
            fx.player(2, 0),
        });
      }),
  },
  {
    id: "hud-play-long-menu",
    section: "Whole HUD",
    title: "In play, a long action menu scrolls inside its corner",
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} mode="sandbox" />),
    drive: (fx) =>
      later(80, () => {
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.PLAY,
          subPhase: SubPhase.TURN_RECEIVING,
        });
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Basic Scrimmage",
          seed: 1,
        });
        fillLog(fx, 1);
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player:
            fx.services.gameService.getPlayerById(fx.player(1, 0).id) ??
            fx.player(1, 0),
        });
      }),
  },
  {
    id: "hud-setup",
    section: "Whole HUD",
    title: "Setup",
    fixture: { phase: GamePhase.SETUP },
    view: (fx) => routed(<GameHUD eventBus={fx.bus} />),
    drive: (fx) =>
      later(80, () => {
        fx.bus.emit(GameEventNames.PhaseChanged, {
          phase: GamePhase.SETUP,
          subPhase: SubPhase.SETUP_KICKING,
        });
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: fx.team1.name },
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 4,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions: [],
            canConfirm: false,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [
            { name: "Balanced", builtIn: true },
            { name: "Wedge", builtIn: true },
            { name: "My cage", builtIn: false },
          ],
        });
        fx.bus.emit(GameEventNames.UI_LogEntry, {
          category: "weather",
          headline: "Nice Weather",
          detail: "Perfect Blood Bowl weather.",
          roll: [3, 4],
        });
      }),
  },

  {
    id: "match-strip-effects",
    section: "Score bug and turn tab",
    title: "Weather, spent actions and drive effects",
    view: (fx) => (
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
        <ScoreBoard eventBus={fx.bus} />
        <MatchStrip eventBus={fx.bus}>
          <TurnIndicator turnNumber={5} phase={GamePhase.PLAY} />
        </MatchStrip>
      </div>
    ),
    drive: (fx) =>
      later(30, () => {
        const state = fx.services.gameService.getState();
        state.turn.turnNumber = 5;
        fx.services.gameService.seedTurnCounts(5);
        state.turn.hasBlitzed = true;
        state.turn.hasPassed = true;
        state.turn.hasHandedOff = true;
        state.turn.hasFouled = true;
        state.weather = "Pouring Rain";
        state.activeTeamId = fx.team1.id;
        state.driveEffects = {
          freeRerolls: { [fx.team1.id]: 1 },
          owedAssists: { [fx.team2.id]: { turn: 5, used: false } },
          playerModifiers: {
            [fx.player(1, 0).id]: { maModifier: -1, avModifier: -1 },
          },
        };
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },

  // ---- Score bug
  {
    id: "score-typical",
    section: "Score bug and turn tab",
    title: "Typical: home side active",
    height: 140,
    view: score,
    prepare: () => {},
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 1, 0);
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "score-long",
    section: "Score bug and turn tab",
    title: "Long team names, second half",
    height: 140,
    fixture: LONG,
    view: score,
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 2, 3, true);
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "score-colours",
    section: "Score bug and turn tab",
    title: "Other team colours: white and yellow, away side active",
    height: 140,
    fixture: {
      team1Color: 0xf2f2f2,
      team2Color: 0xf4c430,
      team1Name: "Elfheim Eagles",
      team2Name: "Sunfire Halflings",
      team1Roster: RosterName.ELVEN_UNION,
      team2Roster: RosterName.HALFLING,
    },
    view: score,
    drive: (fx) =>
      later(30, () => {
        setScore(fx, 0, 0);
        fx.services.gameService.getState().activeTeamId = fx.team2.id;
        fx.bus.emit(GameEventNames.TeamUpdated, { team: fx.team1 });
      }),
  },
  {
    id: "turn-tab",
    section: "Score bug and turn tab",
    title: "Turn tab: turn, setup, kickoff",
    height: 120,
    view: () => (
      <div className="flex h-full items-center justify-center gap-16">
        <TurnIndicator turnNumber={4} phase={GamePhase.PLAY} />
        <TurnIndicator turnNumber={1} phase={GamePhase.SETUP} />
        <TurnIndicator turnNumber={1} phase={GamePhase.KICKOFF} />
      </div>
    ),
  },
];
