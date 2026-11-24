import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { PlayerCondition, PlayerStatus, InjuryType } from "../types/Player";
import { getSidelineCrewInfo } from "../game/presentation/sidelineStaff";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { EndTurnButton } from "../ui/components/hud/EndTurnButton";
import { PlayerInfoPanel } from "../ui/components/hud/PlayerInfoPanel";
import { PlayerActionMenu } from "../ui/components/hud/PlayerActionMenu";
import { OtherCoachPrompt } from "../ui/components/hud/OtherCoachPrompt";
import { ActionPlanCard } from "../ui/components/hud/ActionPlanCard";
import { later } from "./variantHelpers";
import type { Variant } from "./variants";
import type { MatchFixture } from "./fixtures";

const ACTION_SECTION = "Action menu and sequence";
const CARD_SECTION = "Player card";
const PASS_SCENARIO = "throw-pickup-and-pass";

const menuWithEndTurn = (fx: MatchFixture, activeTeamId: string) => (
  <HUDLayout
    bottomRight={
      <>
        <PlayerActionMenu
          eventBus={fx.bus}
          turnData={{ phase: GamePhase.PLAY, activeTeamId }}
        />
        <EndTurnButton
          phase={GamePhase.PLAY}
          activeTeamId={activeTeamId}
          onClick={() => {}}
        />
      </>
    }
  />
);

export const PLAYER_VARIANTS: Variant[] = [
  {
    id: "card-selected",
    section: CARD_SECTION,
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
    section: CARD_SECTION,
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
    section: CARD_SECTION,
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
    section: CARD_SECTION,
    title: "Sideline crew",
    view: (fx) => (
      <HUDLayout bottomLeft={<PlayerInfoPanel eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ShowInfo, {
          kind: "sidelineCrew",
          crew: getSidelineCrewInfo("coach", fx.team1),
        });
      }),
  },

  {
    id: "menu-block",
    section: ACTION_SECTION,
    title: "Next to an opponent: move, block, blitz",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => menuWithEndTurn(fx, fx.team2.id),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(2, 0).id)!,
        });
      }),
  },
  {
    id: "other-coach-prompt",
    section: ACTION_SECTION,
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
      later(30, () => {
        fx.bus.emit(GameEventNames.RemotePromptChanged, {
          playerId: fx.player(2, 0).id,
          rolls: [{ type: "rush", target: 2 }],
        });
      }),
  },
  {
    id: "menu-special",
    section: ACTION_SECTION,
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
      later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, {
          player: fx.services.gameService.getPlayerById(fx.player(1, 4).id)!,
        });
      }),
  },
  {
    id: "menu-sequence",
    section: ACTION_SECTION,
    title: "Action sequence: Move, then Pass",
    fixture: { scenario: PASS_SCENARIO },
    view: (fx) => menuWithEndTurn(fx, fx.team1.id),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.PlayerSelected, { player: fx.player(1, 0) });
        fx.bus.emit(GameEventNames.UI_UpdateActionSteps, {
          currentStepId: "pass",
          steps: [
            { id: "move", label: "Move", half: "jump" },
            { id: "pass", label: "Pass" },
          ],
        });
      }),
  },

  {
    id: "action-plan-blitz",
    section: ACTION_SECTION,
    title: "Action plan: a Bone-head Blitz with every roll before Go",
    fixture: { scenario: PASS_SCENARIO },
    view: (fx) => (
      <HUDLayout bottomRight={<ActionPlanCard eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(30, () => {
        fx.bus.emit(GameEventNames.UI_ActionPlan, {
          title: "Blitz",
          squares: 4,
          stages: [
            {
              label: "Before acting",
              rolls: [{ kind: "gate", name: "Bone-head", target: 2 }],
              notes: ["On a fail they are Distracted and the activation ends."],
            },
            {
              label: "Move 4 squares",
              rolls: [
                { kind: "dodge", name: "Dodge", target: 3 },
                { kind: "rush", name: "Rush", target: 2 },
              ],
              notes: [],
            },
            {
              label: "Block #5 Lineman",
              rolls: [],
              notes: [
                "2 dice, you pick",
                "Our ST 5 (4 +1) vs their ST 3",
                "Our assists: #2",
                "Their assists: none",
              ],
            },
          ],
          rerolls: ["team 2 left"],
          blocked: null,
        });
      }),
  },

  {
    id: "route-summary",
    section: ACTION_SECTION,
    title: "Route summary: a Dodge then two Rushes",
    fixture: { scenario: PASS_SCENARIO },
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

      const route = later(90, () => {
        fx.bus.emit(GameEventNames.UI_RoutePreview, {
          movementLeft: 0,
          riskySteps: 3,
          rolls: [
            { type: "dodge", target: 3, square: { x: 8, y: 3 } },
            { type: "rush", target: 2, square: { x: 9, y: 3 } },
            { type: "rush", target: 2, square: { x: 10, y: 3 } },
          ],
          rerolls: ["Dodge", "team 2 left"],
        });
      });
      return () => {
        select();
        route();
      };
    },
  },
];
