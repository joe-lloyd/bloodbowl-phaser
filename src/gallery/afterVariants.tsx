import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import type { MatchFixture } from "./fixtures";
import { BLOCK_SCENE, hud, inPlay, onlineHud } from "./matchStage";
import { click, later, setScore } from "./variantHelpers";
import { rows, type Variant } from "./variant";

const halfTime = (fx: MatchFixture) => {
  setScore(fx, 1, 0);
  fx.player(2, 0).status = PlayerStatus.KO;
  fx.bus.emit(GameEventNames.DriveEnded, {
    reason: "halftime",
    nextKickingTeamId: fx.team2.id,
  });
  fx.bus.emit(GameEventNames.KORecoveryRolled, {
    playerId: fx.player(2, 0).id,
    roll: 5,
    recovered: true,
  });
};

const catchUp = (fx: MatchFixture) => {
  fx.services.gameService.getState().activeTeamId = fx.team2.id;
  const hurt = fx.player(1, 0);
  hurt.status = PlayerStatus.STUNNED;
  fx.bus.emit(GameEventNames.PlayerKnockedDown, { playerId: hurt.id });
  fx.bus.emit(GameEventNames.BallScattered, {
    from: { x: 10, y: 4 },
    to: { x: 11, y: 4 },
    reason: "bounce",
  });
  fx.bus.emit(GameEventNames.TurnStarted, {
    teamId: fx.team1.id,
    turnNumber: 4,
  });
};

const CARDS = rows(
  {
    group: "Half-time and post-match",
    section: "Cards over the match",
    fixture: BLOCK_SCENE,
    view: hud,
  },
  [
    { id: "half-time-card", title: "Half time", drive: inPlay(halfTime) },
    {
      id: "half-time-ready",
      title: "Half time, ready to set up",
      drive: inPlay((fx) => {
        halfTime(fx);
        later(60, () => {
          fx.bus.emit(GameEventNames.PhaseChanged, {
            phase: GamePhase.SETUP,
            subPhase: SubPhase.SETUP_KICKING,
          });
        });
      }),
    },
    {
      id: "catch-up-card",
      title: "Online: since your last turn",
      view: onlineHud(),
      drive: inPlay(catchUp),
    },
  ]
);

const finished =
  (then: () => void = () => undefined) =>
  (fx: MatchFixture) =>
    later(80, () => {
      setScore(fx, 2, 1, true);
      [
        ...fx.team1.players.slice(0, 7),
        ...fx.team2.players.slice(0, 7),
      ].forEach(({ id }) => {
        fx.bus.emit(GameEventNames.PlayerActivated, id);
      });
      fx.bus.emit(GameEventNames.PhaseChanged, {
        phase: GamePhase.GAME_OVER,
        subPhase: SubPhase.SETUP_KICKING,
      });
      later(200, then);
    });

const clearNominees = () => {
  const players = [
    ...document.querySelectorAll<HTMLButtonElement>("section button"),
  ].filter((button) => button.textContent.includes("#"));
  players.slice(0, 6).forEach((button, index) => {
    later(index * 30, () => {
      button.click();
    });
  });
};

const RESULTS = rows(
  {
    group: "Half-time and post-match",
    section: "Full time",
    fixture: { phase: GamePhase.GAME_OVER },
    view: hud,
  },
  [
    { id: "results", title: "A friendly", drive: finished() },
    {
      id: "results-progression",
      title: "A league game: name the MVP",
      fixture: { phase: GamePhase.GAME_OVER, progression: true },
      drive: finished(),
    },
    {
      id: "results-mvp-empty",
      title: "A league game: no nominees",
      fixture: { phase: GamePhase.GAME_OVER, progression: true },
      drive: finished(clearNominees),
    },
    {
      id: "results-mvp",
      title: "A league game: the MVP rolled",
      fixture: { phase: GamePhase.GAME_OVER, progression: true },
      drive: finished(() => {
        click("button", "Roll MVP D6");
      }),
    },
  ]
);

export const AFTER_VARIANTS: Variant[] = [...CARDS, ...RESULTS];
