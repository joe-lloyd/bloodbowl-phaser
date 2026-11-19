import { GamePhase, SubPhase } from "../types/GameState";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { SetupValidator } from "../game/validators/SetupValidator";
import { SetupControls } from "../ui/components/hud/SetupControls";
import { LONG, showPlacing, showSetup, soon } from "./variantHelpers";
import type { MatchFixture } from "./fixtures";
import type { Variant } from "./variants";

function setupPanel(
  variant: Pick<Variant, "id" | "title" | "fixture">,
  open: (fx: MatchFixture) => void
): Variant {
  return {
    section: "Setup panel",
    ...variant,
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: soon(open),
  };
}

export const SETUP_VARIANTS: Variant[] = [
  setupPanel(
    {
      id: "setup-checklist",
      title: "Setup checklist with two players on the line",
      fixture: { phase: GamePhase.SETUP },
    },
    (fx) => {
      const restrictions = new SetupValidator().validateFormation({
        positions: [
          { playerId: fx.player(1, 0).id, x: 6, y: 3 },
          { playerId: fx.player(1, 1).id, x: 6, y: 5 },
          { playerId: fx.player(1, 2).id, x: 4, y: 0 },
        ],
        isTeam1: true,
        availablePlayerCount: 7,
      }).restrictions;
      showSetup(fx, {
        subPhase: SubPhase.SETUP_KICKING,
        activeTeam: fx.team1,
        status: { placedPlayerCount: 3, restrictions },
      });
    }
  ),

  setupPanel({ id: "setup-incomplete", title: "Placing players" }, (fx) => {
    showPlacing(fx, [
      { name: "Balanced", builtIn: true },
      { name: "My cage", builtIn: false },
    ]);
  }),
  setupPanel(
    { id: "setup-ready", title: "Ready to confirm, offense" },
    (fx) => {
      showSetup(fx, {
        subPhase: SubPhase.SETUP_RECEIVING,
        activeTeam: { id: fx.team2.id, name: fx.team2.name },
        status: { placedPlayerCount: 7, canConfirm: true },
      });
    }
  ),
  setupPanel(
    { id: "setup-short", title: "Short-handed: concede or play on" },
    (fx) => {
      showSetup(fx, {
        subPhase: SubPhase.SETUP_KICKING,
        activeTeam: { id: fx.team1.id, name: LONG.team1Name },
        status: {
          requiredPlayerCount: 4,
          availablePlayerCount: 4,
          concessionDecision: "pending",
        },
      });
    }
  ),
];
