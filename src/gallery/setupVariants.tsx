/**
 * Gallery variants for the setup panel: the checklist, placing players and a
 * short squad.
 */
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { SetupValidator } from "../game/validators/SetupValidator";
import { SetupControls } from "../ui/components/hud/SetupControls";
import { LONG, later } from "./variantHelpers";
import type { Variant } from "./variants";

export const SETUP_VARIANTS: Variant[] = [
  {
    id: "setup-checklist",
    section: "Setup panel",
    title: "Setup checklist with two players on the line",
    fixture: { phase: GamePhase.SETUP },
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const restrictions = new SetupValidator().validateFormation(
          [
            { playerId: fx.player(1, 0).id, x: 6, y: 3 },
            { playerId: fx.player(1, 1).id, x: 6, y: 5 },
            { playerId: fx.player(1, 2).id, x: 4, y: 0 },
          ],
          true,
          7
        ).restrictions;
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: fx.team1,
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 3,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions,
            canConfirm: false,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },

  // ---- Setup
  {
    id: "setup-incomplete",
    section: "Setup panel",
    title: "Placing players",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
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
            { name: "My cage", builtIn: false },
          ],
        });
      }),
  },
  {
    id: "setup-ready",
    section: "Setup panel",
    title: "Ready to confirm, offense",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_RECEIVING,
          activeTeam: { id: fx.team2.id, name: fx.team2.name },
          status: {
            teamId: fx.team2.id,
            placedPlayerCount: 7,
            requiredPlayerCount: 7,
            availablePlayerCount: 7,
            restrictions: [],
            canConfirm: true,
            concessionDecision: "not-offered",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },
  {
    id: "setup-short",
    section: "Setup panel",
    title: "Short-handed: concede or play on",
    view: (fx) => (
      <HUDLayout bottomRight={<SetupControls eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowSetupControls, {
          subPhase: SubPhase.SETUP_KICKING,
          activeTeam: { id: fx.team1.id, name: LONG.team1Name },
          status: {
            teamId: fx.team1.id,
            placedPlayerCount: 0,
            requiredPlayerCount: 4,
            availablePlayerCount: 4,
            restrictions: [],
            canConfirm: false,
            concessionDecision: "pending",
          },
        });
        fx.bus.emit(GameEventNames.UI_FormationsUpdated, {
          formations: [{ name: "Balanced", builtIn: true }],
        });
      }),
  },
];
