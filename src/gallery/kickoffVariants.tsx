import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import {
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
} from "../game/kickoff/kickoffEvents";
import { readPlayground } from "../boundary/kickoffPlayground";
import {
  playgroundLanding,
  playgroundScenario,
} from "../data/kickoffPlayground";
import type { MatchFixture } from "./fixtures";
import { hud, onlineHud } from "./matchStage";
import { every, later, soon } from "./variantHelpers";
import { rows, type Variant } from "./variant";

const SECTION = "Kick-off steps";

const enterKickoff = (fx: MatchFixture) => {
  fx.services.gameService.getState().subPhase = SubPhase.ROLL_KICKOFF;
  fx.bus.emit(GameEventNames.PhaseChanged, {
    phase: GamePhase.KICKOFF,
    subPhase: SubPhase.ROLL_KICKOFF,
  });
};

interface Step {
  event?: KickoffEvent;
  picks?: number;
  play?: boolean;
  finished?: number;
}

const PLAYGROUND = readPlayground(new URLSearchParams());
const KICKOFF_SCENE = { scenario: playgroundScenario(PLAYGROUND) };
const LANDING = playgroundLanding(KICKOFF_SCENE.scenario, PLAYGROUND.kicking);

function pick(fx: MatchFixture, picks: number): string[] {
  const { gameService } = fx.services;
  return fx.team1.players.reduce<string[]>(
    (chosen, { id }) =>
      chosen.length < picks && gameService.selectKickoffEventPlayer(id)
        ? [...chosen, id]
        : chosen,
    []
  );
}

function answerStep(fx: MatchFixture, step: Step): void {
  const { gameService } = fx.services;
  const { picks = 0, play = false, finished = 0 } = step;
  const chosen = picks > 0 ? pick(fx, picks) : [];
  fx.bus.emit(GameEventNames.KickoffEventStepChanged, undefined);
  if (!play) return;
  gameService.confirmKickoffEventStep();
  chosen.slice(0, finished).forEach((id) => {
    gameService.finishActivation(id);
  });
}

const rehearse = (step: Step = {}) =>
  soon((fx) => {
    const answer = () => {
      fx.bus.off(GameEventNames.KickoffEventStepStarted, answer);
      later(50, () => {
        answerStep(fx, step);
      });
    };
    fx.bus.on(GameEventNames.KickoffEventStepStarted, answer);
    void fx.services.gameService.rehearseKickoffEvent({
      event: step.event ?? KickoffEvent.ALERT_DEFENCE,
      isTeam1Kicking: true,
      landing: LANDING,
      selectionLimit: 3,
    });
  });

const alertDefence = rehearse();

const STEPS = rows(
  { group: "Kick-off", section: SECTION, fixture: KICKOFF_SCENE, view: hud },
  [
    {
      id: "kickoff-aim",
      title: "Choosing a kicker and a square",
      drive: soon(enterKickoff),
    },
    {
      id: "kickoff-blitz",
      title: "Alert Defence: choose a player",
      drive: alertDefence,
    },
    {
      id: "kickoff-step-start",
      title: "Alert Defence: start",
      drive: rehearse({ picks: 3 }),
    },
    {
      id: "kickoff-step-move",
      title: "Alert Defence: move each player",
      drive: rehearse({ picks: 3, play: true }),
    },
    {
      id: "kickoff-highkick",
      title: "High Kick",
      drive: rehearse({ event: KickoffEvent.HIGH_KICK }),
    },
    {
      id: "kickoff-quick-snap",
      title: "Quick Snap",
      drive: rehearse({ event: KickoffEvent.QUICK_SNAP }),
    },
    {
      id: "kickoff-charge",
      title: "Charge: choose players",
      drive: rehearse({ event: KickoffEvent.CHARGE, picks: 1 }),
    },
    {
      id: "kickoff-charge-play",
      title: "Charge: play each player",
      drive: rehearse({
        event: KickoffEvent.CHARGE,
        picks: 2,
        play: true,
        finished: 1,
      }),
    },
    {
      id: "kickoff-waiting",
      title: "Online: waiting for the other coach",
      view: onlineHud({ myTeamId: "someone else", mayAct: () => false }),
      drive: alertDefence,
    },
  ]
);

const tableReady = (fx: MatchFixture) => {
  fx.bus.emit(GameEventNames.KickoffTableReady, {
    presentationId: "gallery-ready",
    kickingTeamId: fx.team1.id,
  });
};

const rollTable = (fx: MatchFixture) => {
  fx.bus.emit(GameEventNames.DiceRoll, {
    rollType: KICKOFF_TABLE_ROLL,
    diceType: "2d6",
    value: [5, 5],
    total: 10,
    description: "Kick-off: 10, Charge!",
    resultState: "none",
    teamId: fx.team1.id,
  });
  fx.bus.emit(GameEventNames.KickoffTableRolled, {
    presentationId: "gallery-rolled",
    roll: 10,
    event: KickoffEvent.CHARGE,
  });
};

const TABLE = rows(
  {
    group: "Kick-off",
    section: "Kick-off table",
    fixture: KICKOFF_SCENE,
    view: hud,
  },
  [
    {
      id: "kickoff-table",
      title: "Before the roll",
      drive: (fx) => {
        const answer = ({ id }: { id: string }) => {
          if (id === "gallery-ready") rollTable(fx);
        };
        fx.bus.on(GameEventNames.UI_PresentationAcknowledged, answer);
        const stop = soon(tableReady)(fx);
        return () => {
          stop();
          fx.bus.off(GameEventNames.UI_PresentationAcknowledged, answer);
        };
      },
    },
    {
      id: "kickoff-table-rolled",
      title: "Rolling, then the result (replays)",
      drive: (fx) => {
        const start = later(60, () => {
          tableReady(fx);
          later(300, () => {
            rollTable(fx);
          });
        });
        const stop = every(8000, () => {
          tableReady(fx);
          later(300, () => {
            rollTable(fx);
          });
        });
        return () => {
          start();
          stop();
        };
      },
    },
    {
      id: "kickoff-result",
      title: "The result banner (replays)",
      drive: (fx) =>
        every(4000, () => {
          fx.bus.emit(GameEventNames.UI_Announce, {
            kind: "kickoff-result",
            headline: "Charge!",
            subtitle: "Reikland Reavers move before the ball lands",
          });
        }),
    },
  ]
);

export const KICKOFF_VARIANTS: Variant[] = [...TABLE, ...STEPS];
