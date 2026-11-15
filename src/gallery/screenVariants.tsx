/**
 * Gallery variants for the sandbox explorer and the full-screen moments.
 */
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { SandboxOverlay } from "../ui/components/hud/SandboxOverlay";
import { MatchResultsScreen } from "../ui/components/hud/MatchResultsScreen";
import { LoadingScreen } from "../ui/components/hud/LoadingScreen";
import { later, routed, setScore } from "./variantHelpers";
import type { Variant } from "./variants";

export const SCREEN_VARIANTS: Variant[] = [
  // ---- Sandbox
  {
    id: "sandbox",
    section: "Sandbox explorer",
    title: "Core scenario loaded, with its seed",
    view: (fx) => <HUDLayout topRight={<SandboxOverlay eventBus={fx.bus} />} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.ScenarioLoaded, {
          name: "Block & Injury Test",
          seed: 10,
          expectedOutcome: "Defender will be stunned",
        })
      ),
  },

  // ---- Full screens
  {
    id: "results",
    section: "Full-screen moments",
    title: "Full time, no progression",
    fixture: { phase: GamePhase.GAME_OVER },
    view: () => routed(<MatchResultsScreen visible />),
    prepare: () => {},
    drive: (fx) => later(10, () => setScore(fx, 2, 1, true)),
  },
  {
    id: "results-progression",
    section: "Full-screen moments",
    title: "Full time, MVP and SPP to confirm",
    fixture: { phase: GamePhase.GAME_OVER, progression: true },
    view: (fx) => {
      setScore(fx, 1, 1, true);
      return routed(<MatchResultsScreen visible />);
    },
  },
  {
    id: "loading",
    section: "Full-screen moments",
    title: "Loading the stadium",
    view: (fx) => (
      <LoadingScreen
        eventBus={fx.bus}
        teams={{ team1: fx.team1, team2: fx.team2 }}
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_LoadProgress, { progress: 0.62 })
      ),
  },
];
