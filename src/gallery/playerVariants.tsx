/**
 * Gallery variants for the player card, the action menu and the action
 * sequence.
 */
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { PlayerCondition, PlayerStatus, InjuryType } from "../types/Player";
import { getSidelineCrewInfo } from "../game/presentation/sidelineStaff";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { EndTurnButton } from "../ui/components/hud/EndTurnButton";
import { PlayerInfoPanel } from "../ui/components/hud/PlayerInfoPanel";
import { PlayerActionMenu } from "../ui/components/hud/PlayerActionMenu";
import { OtherCoachPrompt } from "../ui/components/hud/OtherCoachPrompt";
import { later } from "./variantHelpers";
import type { Variant } from "./variants";

export const PLAYER_VARIANTS: Variant[] = [
  // ---- Player card
  {
    id: "card-selected",
    section: "Player card",
    title: "Selected player",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const p = fx.player(1, 4);
        p.spp = 8;
        p.status = PlayerStatus.ACTIVE;
        fx.bus.emit(GameEventNames.PlayerSelected, { player: p });
      }),
  },
  {
    id: "card-compare",
    section: "Player card",
    title: "Selected, comparing a hovered opponent",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.player(1, 4).status = PlayerStatus.ACTIVE;
        fx.player(2, 5).status = PlayerStatus.ACTIVE;
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 4) });
        fx.bus.emit(GameEventNames.UI_ShowPlayerInfo, fx.player(2, 5));
      }),
  },
  {
    id: "card-injured",
    section: "Player card",
    title: "Long name, stunned, with a condition and injuries",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        const p = fx.player(2, 0);
        p.playerName = "Grimgutz Skullsplitta the Unwashed";
        p.status = PlayerStatus.STUNNED;
        p.injuries = [InjuryType.NIGGLING_INJURY];
        p.conditions = [{ type: PlayerCondition.DISTRACTED }];
        fx.bus.emit(GameEventNames.PlayerSelected, { player: p });
      }),
  },
  {
    id: "card-crew",
    section: "Player card",
    title: "Sideline crew",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_ShowInfo, {
          kind: "sidelineCrew",
          crew: getSidelineCrewInfo("coach", fx.team1),
        })
      ),
  },

  // ---- Action menu
  {
    id: "menu-block",
    section: "Action menu and sequence",
    title: "Next to an opponent: move, block, blitz",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <>
            <PlayerActionMenu
              eventBus={fx.bus}
              turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team2.id }}
            />
            <EndTurnButton
              phase={GamePhase.PLAY}
              activeTeamId={fx.team2.id}
              onClick={() => {}}
            />
          </>
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(2, 0).id)!,
        })
      ),
  },
  {
    id: "other-coach-prompt",
    section: "Action menu and sequence",
    title: "Waiting coach: the other coach's Rush prompt, read-only",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <div data-testid="decision-dock" className="w-full">
            <OtherCoachPrompt eventBus={fx.bus} />
          </div>
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.RemotePromptChanged, {
          playerId: fx.player(2, 0).id,
          rolls: [{ type: "rush", target: 2 }],
        })
      ),
  },
  {
    id: "menu-special",
    section: "Action menu and sequence",
    title: "A special action (Chainsaw)",
    fixture: { scenario: "chainsaw-loony" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <PlayerActionMenu
            eventBus={fx.bus}
            turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team1.id }}
          />
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(1, 4).id)!,
        })
      ),
  },
  {
    id: "menu-sequence",
    section: "Action menu and sequence",
    title: "Action sequence: Move, then Pass",
    fixture: { scenario: "throw-pickup-and-pass" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <>
            <PlayerActionMenu
              eventBus={fx.bus}
              turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team1.id }}
            />
            <EndTurnButton
              phase={GamePhase.PLAY}
              activeTeamId={fx.team1.id}
              onClick={() => {}}
            />
          </>
        }
      />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 0) });
        fx.bus.emit(GameEventNames.UI_UpdateActionSteps, {
          currentStepId: "pass",
          steps: [
            { id: "move", label: "Move" },
            { id: "pass", label: "Pass" },
          ],
        });
      }),
  },

  {
    id: "route-summary",
    section: "Action menu and sequence",
    title: "Route summary: a Dodge then two Rushes",
    fixture: { scenario: "throw-pickup-and-pass" },
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <PlayerActionMenu
            eventBus={fx.bus}
            turnData={{ phase: GamePhase.PLAY, activeTeamId: fx.team1.id }}
          />
        }
      />
    ),
    drive: (fx) => {
      const select = later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 0) });
        fx.bus.emit(GameEventNames.UI_UpdateActionSteps, {
          currentStepId: "move",
          steps: [{ id: "move", label: "Move" }],
        });
      });
      // The summary mounts with the action sequence, a render later
      const route = later(90, () =>
        fx.bus.emit(GameEventNames.UI_RoutePreview, {
          movementLeft: 0,
          riskySteps: 3,
          rolls: [
            { type: "dodge", target: 3, square: { x: 8, y: 3 } },
            { type: "rush", target: 2, square: { x: 9, y: 3 } },
            { type: "rush", target: 2, square: { x: 10, y: 3 } },
          ],
          rerolls: ["Dodge", "team 2 left"],
        })
      );
      return () => {
        select();
        route();
      };
    },
  },
];
