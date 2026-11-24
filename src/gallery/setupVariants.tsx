import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { SetupValidator } from "../game/validators/SetupValidator";
import type { MatchFixture } from "./fixtures";
import { hud, type Opener, SETUP_SCENE } from "./matchStage";
import { LONG, showPlacing, showSetup, soon } from "./variantHelpers";
import { rows, type Variant } from "./variant";

const inSetup = (open: Opener) =>
  soon((fx) => {
    fx.bus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.SETUP,
      subPhase: SubPhase.SETUP_KICKING,
    });
    open(fx);
  });

const badFormation = (fx: MatchFixture) =>
  new SetupValidator().validateFormation({
    positions: [
      { playerId: fx.player(1, 0).id, x: 6, y: 3 },
      { playerId: fx.player(1, 1).id, x: 6, y: 5 },
      { playerId: fx.player(1, 2).id, x: 4, y: 0 },
    ],
    isTeam1: true,
    availablePlayerCount: 7,
  }).restrictions;

export const SETUP_VARIANTS: Variant[] = rows(
  {
    group: "Setup",
    section: "Setup menu",
    fixture: SETUP_SCENE,
    view: hud,
  },
  [
    {
      id: "setup-incomplete",
      title: "Placing players, with a saved formation",
      drive: inSetup(showPlacing),
    },
    {
      id: "setup-checklist",
      title: "Two rules still broken",
      drive: inSetup((fx) => {
        showSetup(fx, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: fx.team1,
          status: { placedPlayerCount: 3, restrictions: badFormation(fx) },
        });
      }),
    },
    {
      id: "setup-ready",
      title: "Ready to confirm, offense",
      drive: inSetup((fx) => {
        showSetup(fx, {
          subPhase: SubPhase.SETUP_RECEIVING,
          activeTeam: fx.team2,
          status: { placedPlayerCount: 7, canConfirm: true },
        });
      }),
    },
    {
      id: "setup-short",
      title: "Short-handed: concede or play on",
      drive: inSetup((fx) => {
        showSetup(fx, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: LONG.team1Name },
          status: {
            requiredPlayerCount: 4,
            availablePlayerCount: 4,
            concessionDecision: "pending",
          },
        });
      }),
    },
    {
      id: "setup-swarming",
      title: "Swarming",
      drive: inSetup((fx) => {
        showSetup(fx, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: fx.team1,
          status: {
            placedPlayerCount: 7,
            canConfirm: true,
            swarming: {
              roll: 2,
              maximumAdditionalPlayers: 2,
              additionalPlayerCount: 0,
            },
          },
        });
      }),
    },
  ]
);
