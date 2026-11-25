import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import {
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
} from "../game/kickoff/kickoffEvents";
import { type KickRecord, newKick } from "../game/kickoff/kickRecord";
import { openedKickoffTurn } from "../game/kickoff/kickoffTurn";
import type { MatchFixture } from "./fixtures";
import { hud, KICKOFF_SCENE, onlineHud } from "./matchStage";
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
  limit?: number;
  picked?: number[];
}

const LANDING = { x: 15, y: 5 };

const pickedIn = (fx: MatchFixture, { picked = [] }: Step) =>
  picked.map((index) => fx.player(1, index).id);

function startKick(fx: MatchFixture): KickRecord {
  enterKickoff(fx);
  const kick = newKick(fx.team1.id, "coach");
  fx.services.gameService.getState().kick = kick;
  return kick;
}

const choosing = (step: Step = {}) =>
  soon((fx) => {
    const { event = KickoffEvent.ALERT_DEFENCE, limit = 3 } = step;
    const choice = { event, teamId: fx.team1.id, selectionLimit: limit };
    startKick(fx).step = {
      ...choice,
      stage: "choose",
      selectedPlayerIds: pickedIn(fx, step),
      ...(event === KickoffEvent.HIGH_KICK ? { landingSquare: LANDING } : {}),
    };
    fx.bus.emit(GameEventNames.KickoffEventStepStarted, choice);
  });

const playing = (step: Step, moved: number[] = []) =>
  soon((fx) => {
    const { event = KickoffEvent.ALERT_DEFENCE, limit = 3 } = step;
    const teamId = fx.team1.id;
    const state = fx.services.gameService.getState();
    const kick = startKick(fx);
    const opened = openedKickoffTurn(
      state,
      {
        event,
        teamId,
        playerIds: pickedIn(fx, step),
        selectionLimit: limit,
      },
      [...fx.team1.players, ...fx.team2.players]
    );
    if (!opened) throw new Error(`${event} has no mini-turn.`);
    pickedIn(fx, { picked: moved }).forEach((id) =>
      opened.turn.activatedPlayerIds.add(id)
    );
    state.activeTeamId = teamId;
    state.turn = opened.turn;
    kick.step = opened.step;
    fx.bus.emit(GameEventNames.KickoffTurnStarted, { event, teamId });
  });

const alertDefence = choosing();

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
      drive: choosing({ picked: [0, 1, 2] }),
    },
    {
      id: "kickoff-step-move",
      title: "Alert Defence: move each player",
      drive: playing({ picked: [0, 1, 2] }),
    },
    {
      id: "kickoff-step-done",
      title: "Alert Defence: every player moved",
      drive: playing({ picked: [0, 1, 2] }, [0, 1, 2]),
    },
    {
      id: "kickoff-highkick",
      title: "High Kick",
      drive: choosing({ event: KickoffEvent.HIGH_KICK, limit: 1 }),
    },
    {
      id: "kickoff-quick-snap",
      title: "Quick Snap",
      drive: choosing({ event: KickoffEvent.QUICK_SNAP }),
    },
    {
      id: "kickoff-charge",
      title: "Charge: choose players",
      drive: choosing({ event: KickoffEvent.CHARGE, picked: [0] }),
    },
    {
      id: "kickoff-charge-play",
      title: "Charge: play each player",
      drive: playing({ event: KickoffEvent.CHARGE, picked: [0, 1] }, [0]),
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
    { id: "kickoff-table", title: "Before the roll", drive: soon(tableReady) },
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
