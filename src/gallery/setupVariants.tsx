import { FormationManager } from "../game/managers/FormationManager";
import { getRosterByRosterName } from "../data/RosterTemplates";
import { GamePhase } from "../types/GameState";
import { createPlayer, PlayerStatus } from "../types/Player";
import { RosterName } from "../types/Team";
import type { MatchFixture } from "./fixtures";
import { hud, type Opener, SETUP_SCENE } from "./matchStage";
import { GALLERY_FORMATIONS, later, LONG, soon } from "./variantHelpers";
import { rows, type Variant } from "./variant";

const inSetup = (open: Opener) =>
  soon((fx) => {
    fx.services.gameService.startSetup(fx.team1.id);
    open(fx);
  });

function formation(fx: MatchFixture, team: 1 | 2): void {
  const positions = new FormationManager().getDefaultFormation(team === 1);
  const { id } = team === 1 ? fx.team1 : fx.team2;
  fx.services.gameService.applySetupFormation(id, positions);
}

function saveCage(): void {
  const manager = new FormationManager();
  manager.saveFormation(
    GALLERY_FORMATIONS,
    manager.getDefaultFormation(true),
    "My cage"
  );
}

const placeSome = (fx: MatchFixture, squares: [number, number][]) => {
  squares.forEach(([x, y], index) => {
    fx.services.gameService.placePlayer(fx.player(1, index).id, x, y);
  });
};

function hireReserves(fx: MatchFixture): void {
  const lineman = getRosterByRosterName(
    fx.team1.rosterName
  ).playerTemplates.find(({ positionName }) =>
    positionName.includes("Lineman")
  );
  if (!lineman) return;
  [8, 9, 10].forEach((number) => {
    fx.team1.players.push(createPlayer(lineman, fx.team1.id, number));
  });
}

const receiving: Opener = (fx) => {
  formation(fx, 1);
  fx.services.gameService.confirmSetup(fx.team1.id);
  later(300, () => {
    formation(fx, 2);
  });
};

const swarming: Opener = (fx) => {
  receiving(fx);
  later(600, () => {
    fx.services.gameService.confirmSetup(fx.team2.id);
  });
};

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
      prepare: saveCage,
      drive: inSetup((fx) => {
        placeSome(fx, [
          [6, 3],
          [6, 5],
          [5, 4],
          [4, 5],
        ]);
      }),
    },
    {
      id: "setup-checklist",
      title: "Two rules still broken",
      drive: inSetup((fx) => {
        placeSome(fx, [
          [6, 3],
          [6, 5],
          [4, 0],
        ]);
      }),
    },
    {
      id: "setup-ready",
      title: "Ready to confirm, offense",
      drive: inSetup(receiving),
    },
    {
      id: "setup-short",
      title: "Short-handed: concede or play on",
      fixture: { phase: GamePhase.SETUP, ...LONG },
      drive: soon((fx) => {
        fx.team1.players.slice(3).forEach((player) => {
          player.status = PlayerStatus.INJURED;
        });
        fx.services.gameService.startSetup(fx.team1.id);
      }),
    },
    {
      id: "setup-swarming",
      title: "Swarming",
      fixture: { phase: GamePhase.SETUP, team1Roster: RosterName.SNOTLING },
      drive: (fx) => {
        hireReserves(fx);
        return inSetup(swarming)(fx);
      },
    },
  ]
);
