/**
 * Gallery variants for the decision dialogs: confirmations, block dice,
 * re-rolls and the rest.
 */
import { GameEventNames } from "../types/events";
import type { RerollSource } from "../types/decisions";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { getSkill, SkillType } from "../types/Skills";
import type { BlockRollData } from "../services/BlockResolutionService";
import { MatchFixture } from "./fixtures";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { DiceTray } from "../ui/components/hud/DiceTray";
import { ConfirmationModal } from "../ui/components/hud/ConfirmationModal";
import { BlockDiceDialog } from "../ui/components/hud/BlockDiceDialog";
import { RerollDialog } from "../ui/components/hud/RerollDialog";
import { FollowUpDialog } from "../ui/components/hud/FollowUpDialog";
import { ReactionDialog } from "../ui/components/hud/ReactionDialog";
import { FoulAssistsDialog } from "../ui/components/hud/FoulAssistsDialog";
import { BiteTargetPrompt } from "../ui/components/hud/BiteTargetPrompt";
import { InterceptionDialog } from "../ui/components/hud/InterceptionDialog";
import { ApothecaryDialog } from "../ui/components/hud/ApothecaryDialog";
import { InducementChoiceDialog } from "../ui/components/hud/InducementChoiceDialog";
import { InducementSelectionPanel } from "../ui/components/hud/InducementSelectionPanel";
import { BLOCK_FACES, later, onlineMatch } from "./variantHelpers";
import type { Variant } from "./variants";

function blockAnalysis(
  diceCount: number,
  isUphill: boolean,
  a: number,
  d: number
) {
  return {
    diceCount,
    isUphill,
    attackerST: a,
    defenderST: d,
    attackerAssists: [],
    defenderAssists: [],
  };
}

function openBlock(
  fx: MatchFixture,
  dice: number,
  uphill = false,
  st: [number, number] = [4, 3]
) {
  fx.bus.emit(GameEventNames.UI_BlockDialog, {
    attackerId: fx.player(2, 0).id,
    defenderId: fx.player(1, 0).id,
    analysis: blockAnalysis(dice, uphill, st[0], st[1]),
  });
}

function confirm(
  fx: MatchFixture,
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  risky: boolean
) {
  fx.bus.emit(GameEventNames.UI_RequestConfirmation, {
    actionId: "gallery",
    title,
    message,
    confirmLabel,
    cancelLabel,
    risky,
  });
}

function reroll(
  fx: MatchFixture,
  sources: RerollSource[],
  skill?: string,
  needed?: number
) {
  // The engine offers "team" only when a re-roll can be spent: give team 1
  // the turn and two to spend
  fx.team1.rerolls = 2;
  fx.services.gameService.getState().turn.teamId = fx.team1.id;
  fx.bus.emit(GameEventNames.DecisionRequested, {
    type: "reroll",
    playerId: fx.player(1, 4).id,
    chooserTeamId: fx.team1.id,
    rollKind: "dodge",
    sources,
    skill,
    roll: 1,
    needed,
  });
}

export const DIALOG_VARIANTS: Variant[] = [
  // ---- Confirmations
  {
    id: "confirm-dodge",
    section: "Decision dialogs",
    title: "Dodge, no re-roll (risky)",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Blitzer: Dodge",
          "Dodge: 3+. A fall is a turnover.\nNo re-roll available.",
          "Dodge!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-rush",
    section: "Decision dialogs",
    title: "Rush with a team re-roll",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Blitzer: Rush",
          "Rush: 2+. A fall is a turnover.\nTeam re-roll available.",
          "Rush!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-both",
    section: "Decision dialogs",
    title: "Rush and Dodge in one step",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "Human Blitzer #5: Rush & Dodge",
          "Rush: 2+, then Dodge: 4+. A fall on either is a turnover.\nNo re-roll available.",
          "Rush & Dodge!",
          "Stop here",
          true
        )
      ),
  },
  {
    id: "confirm-safe",
    section: "Decision dialogs",
    title: "A plain confirmation (not risky)",
    view: (fx) => <ConfirmationModal eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        confirm(
          fx,
          "End your turn?",
          "Two players have not acted yet.",
          "End Turn",
          "Keep playing",
          false
        )
      ),
  },
  {
    id: "block-1",
    section: "Decision dialogs",
    title: "Block: 1 die",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 1, false, [3, 3])),
  },
  {
    id: "block-2",
    section: "Decision dialogs",
    title: "Block: 2 dice",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 2, false, [4, 3])),
  },
  {
    id: "block-3-uphill",
    section: "Decision dialogs",
    title: "Block: 3 dice uphill, defender chooses",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => openBlock(fx, 3, true, [2, 6])),
  },
  {
    id: "block-defender",
    section: "Decision dialogs",
    title: "Block seen by the defending coach online",
    view: (fx) => <BlockDiceDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () => {
        // This coach owns the defender, player 1 of team 1
        setActiveOnlineMatch(onlineMatch(fx, { myTeamId: fx.team1.id }));
        fx.player(1, 0).skills.push(getSkill(SkillType.BLOCK));
        openBlock(fx, 2, true, [3, 4]);
      }),
  },
  {
    id: "block-rolled",
    section: "Decision dialogs",
    title: "Block rolled, re-rolls offered",
    view: (fx) => (
      <>
        <BlockDiceDialog eventBus={fx.bus} />
        <DiceTray eventBus={fx.bus} />
      </>
    ),
    drive: (fx) =>
      later(30, () => {
        openBlock(fx, 2, false, [4, 3]);
        // The engine sends the full BlockRollData, re-roll offers included
        const rolled: BlockRollData = {
          attackerId: fx.player(2, 0).id,
          defenderId: fx.player(1, 0).id,
          numDice: 2,
          isAttackerChoice: true,
          results: [BLOCK_FACES.bothDown, BLOCK_FACES.skull],
          teamRerollAvailable: true,
          proAvailable: true,
          brawlerAvailable: true,
        };
        setTimeout(
          () => fx.bus.emit(GameEventNames.BlockDiceRolled, rolled),
          50
        );
      }),
  },
  {
    id: "reroll-both",
    section: "Decision dialogs",
    title: "Re-roll: skill or team",
    view: (fx) => <RerollDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => reroll(fx, ["skill", "team"], "Dodge", 3)),
  },
  {
    id: "reroll-pro",
    section: "Decision dialogs",
    title: "Re-roll: Pro or team",
    view: (fx) => <RerollDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => reroll(fx, ["pro", "team"], undefined, 4)),
  },
  {
    id: "reroll-team",
    section: "Decision dialogs",
    title: "Re-roll: veteran, with no team re-rolls left",
    view: (fx) => <RerollDialog eventBus={fx.bus} />,
    drive: (fx) => later(30, () => reroll(fx, ["veteran"])),
  },
  {
    id: "follow-up",
    section: "Decision dialogs",
    title: "Follow up",
    view: (fx) => <FollowUpDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.UI_FollowUpPrompt, {
          attackerId: fx.player(2, 0).id,
          targetSquare: { x: 10, y: 7 },
        })
      ),
  },
  {
    id: "reaction",
    section: "Decision dialogs",
    title: "A reactive skill (Stand Firm)",
    view: (fx) => <ReactionDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "reaction",
          playerId: fx.player(1, 0).id,
          chooserTeamId: fx.team1.id,
          skill: "Stand Firm",
          prompt: "Use Stand Firm to refuse the push and stay in place?",
        })
      ),
  },
  {
    id: "foul-assists",
    section: "Decision dialogs",
    title: "Foul: how many Offensive Assists to add",
    view: (fx) => <FoulAssistsDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "foul-assists",
          playerId: fx.player(1, 0).id,
          targetId: fx.player(2, 0).id,
          chooserTeamId: fx.team1.id,
          available: 2,
          defensive: 1,
        })
      ),
  },
  {
    id: "bite-target",
    section: "Decision dialogs",
    title: "Bloodlust: click the Thrall Lineman to bite",
    view: (fx) => <BiteTargetPrompt eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "bite-target",
          playerId: fx.player(1, 0).id,
          chooserTeamId: fx.team1.id,
          targetIds: [fx.player(1, 1).id, fx.player(1, 2).id],
        })
      ),
  },
  {
    id: "interception",
    section: "Decision dialogs",
    title: "Interception: pick a player, in the dock",
    view: (fx) => (
      <HUDLayout
        bottomRight={
          <div data-testid="decision-dock" className="w-full">
            <InterceptionDialog eventBus={fx.bus} />
          </div>
        }
      />
    ),
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "interception",
          chooserTeamId: fx.team2.id,
          passerId: fx.player(1, 0).id,
          candidates: [
            { playerId: "a", playerName: "Orc Blitzer #5", modifier: -2 },
            // Long enough to cut: the number stays whole
            {
              playerId: "b",
              playerName: "Orc Big Un Blocker Lineman #12",
              modifier: -3,
            },
          ],
        })
      ),
  },
  {
    id: "apothecary",
    section: "Decision dialogs",
    title: "Apothecary after a casualty",
    view: (fx) => <ApothecaryDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "apothecary",
          id: "x",
          chooserTeamId: fx.team1.id,
          playerId: fx.player(1, 4).id,
          resultKind: "casualty",
          casualtyType: "seriously-hurt",
        })
      ),
  },
  {
    id: "inducement-choice",
    section: "Decision dialogs",
    title: "Inducement choice: Intensive Training",
    view: (fx) => <InducementChoiceDialog eventBus={fx.bus} />,
    drive: (fx) =>
      later(30, () =>
        fx.bus.emit(GameEventNames.DecisionRequested, {
          type: "inducement-choice",
          kind: "intensive-training",
          chooserTeamId: fx.team1.id,
          playerIds: [fx.player(1, 4).id, fx.player(1, 5).id],
          skills: ["Block", "Dodge", "Sure Hands"],
          optional: true,
        })
      ),
  },
  {
    id: "inducement-panel",
    section: "Decision dialogs",
    title: "Pre-match inducements",
    view: () => <InducementSelectionPanel onDone={() => {}} />,
  },
];
