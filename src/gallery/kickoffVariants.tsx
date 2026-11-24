import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import {
  KICKOFF_TABLE_ROLL,
  KickoffEvent,
} from "../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../game/kickoff/KickoffEventManager";
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

const ids = (fx: MatchFixture, ...players: number[]) =>
  players.map((index) => fx.player(1, index).id);

const step = (make: (fx: MatchFixture) => Partial<KickoffEventStepState>) =>
  soon((fx) => {
    enterKickoff(fx);
    const state: KickoffEventStepState = {
      event: KickoffEvent.ALERT_DEFENCE,
      teamId: fx.team1.id,
      selectionLimit: 3,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
      ...make(fx),
    };
    fx.services.gameService.getKickoffEventStep = () => state;
    fx.bus.emit(GameEventNames.KickoffEventStepStarted, {
      event: state.event,
      teamId: state.teamId,
      selectionLimit: state.selectionLimit,
    });
  });

const alertDefence = step(() => ({}));

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
      id: "kickoff-step-move",
      title: "Alert Defence: choose a square",
      drive: step((fx) => ({ selectedPlayerIds: ids(fx, 0) })),
    },
    {
      id: "kickoff-step-done",
      title: "Alert Defence: press Done",
      drive: step((fx) => ({
        selectedPlayerIds: ids(fx, 0, 1, 2),
        movedPlayerIds: ids(fx, 0, 1, 2),
      })),
    },
    {
      id: "kickoff-highkick",
      title: "High Kick",
      drive: step(() => ({
        event: KickoffEvent.HIGH_KICK,
        selectionLimit: 1,
        landingSquare: { x: 15, y: 5 },
      })),
    },
    {
      id: "kickoff-quick-snap",
      title: "Quick Snap",
      drive: step(() => ({ event: KickoffEvent.QUICK_SNAP })),
    },
    {
      id: "kickoff-charge",
      title: "Charge: choose players",
      drive: step((fx) => ({
        event: KickoffEvent.CHARGE,
        selectedPlayerIds: ids(fx, 0),
      })),
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
