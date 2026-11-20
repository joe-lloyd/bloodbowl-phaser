import type React from "react";
import { GameEventNames } from "../types/events";
import type { DecisionRequest, RerollSource } from "../types/decisions";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { getSkill, SkillType } from "../types/Skills";
import type { BlockRollData } from "../services/BlockResolutionService";
import { type MatchFixture } from "./fixtures";
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
import { BLOCK_FACES, onlineMatch, soon } from "./variantHelpers";
import type { Variant } from "./variants";

type Opener = (fx: MatchFixture) => void;

const SECTION = "Decision dialogs";

type Rows = { id: string; title: string; open: Opener }[];

function opened(view: Variant["view"], rows: Rows): Variant[] {
  return rows.map(({ id, title, open }) => ({
    id,
    section: SECTION,
    title,
    view,
    drive: soon(open),
  }));
}

const dialog = (
  Dialog: React.ComponentType<{ eventBus: MatchFixture["bus"] }>,
  rows: Rows
) => opened((fx) => <Dialog eventBus={fx.bus} />, rows);

const decision =
  (make: (fx: MatchFixture) => DecisionRequest): Opener =>
  (fx) => {
    fx.bus.emit(GameEventNames.DecisionRequested, make(fx));
  };

function openBlock(
  fx: MatchFixture,
  { dice, uphill, st }: { dice: number; uphill: boolean; st: [number, number] }
) {
  fx.bus.emit(GameEventNames.UI_BlockDialog, {
    attackerId: fx.player(2, 0).id,
    defenderId: fx.player(1, 0).id,
    analysis: {
      diceCount: dice,
      isUphill: uphill,
      attackerST: st[0],
      defenderST: st[1],
      barricadeCover: false,
      attackerAssists: [],
      defenderAssists: [],
    },
  });
}

const block =
  (dice: number, uphill: boolean, st: [number, number]): Opener =>
  (fx) => {
    openBlock(fx, { dice, uphill, st });
  };

interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  risky: boolean;
}

const confirm =
  (prompt: Confirmation): Opener =>
  (fx) => {
    fx.bus.emit(GameEventNames.UI_RequestConfirmation, {
      actionId: "gallery",
      ...prompt,
    });
  };

const reroll =
  ({
    sources,
    skill,
    needed,
  }: {
    sources: RerollSource[];
    skill?: string;
    needed?: number;
  }): Opener =>
  (fx) => {
    fx.team1.rerolls = 2;
    fx.services.gameService.getState().turn.teamId = fx.team1.id;
    fx.bus.emit(GameEventNames.DecisionRequested, {
      type: "reroll",
      playerId: fx.player(1, 4).id,
      chooserTeamId: fx.team1.id,
      rollKind: "dodge",
      sources,
      ...(skill === undefined ? {} : { skill }),
      roll: 1,
      ...(needed === undefined ? {} : { needed }),
    });
  };

const blockRolled: Opener = (fx) => {
  openBlock(fx, { dice: 2, uphill: false, st: [4, 3] });
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
  setTimeout(() => {
    fx.bus.emit(GameEventNames.BlockDiceRolled, rolled);
  }, 50);
};

export const DIALOG_VARIANTS: Variant[] = [
  ...dialog(ConfirmationModal, [
    {
      id: "confirm-dodge",
      title: "Dodge, no re-roll (risky)",
      open: confirm({
        title: "Blitzer: Dodge",
        message: "Dodge: 3+. A fall is a turnover.\nNo re-roll available.",
        confirmLabel: "Dodge!",
        cancelLabel: "Stop here",
        risky: true,
      }),
    },
    {
      id: "confirm-rush",
      title: "Rush with a team re-roll",
      open: confirm({
        title: "Blitzer: Rush",
        message: "Rush: 2+. A fall is a turnover.\nTeam re-roll available.",
        confirmLabel: "Rush!",
        cancelLabel: "Stop here",
        risky: true,
      }),
    },
    {
      id: "confirm-both",
      title: "Rush and Dodge in one step",
      open: confirm({
        title: "Human Blitzer #5: Rush & Dodge",
        message:
          "Rush: 2+, then Dodge: 4+. A fall on either is a turnover.\nNo re-roll available.",
        confirmLabel: "Rush & Dodge!",
        cancelLabel: "Stop here",
        risky: true,
      }),
    },
    {
      id: "confirm-safe",
      title: "A plain confirmation (not risky)",
      open: confirm({
        title: "End your turn?",
        message: "Two players have not acted yet.",
        confirmLabel: "End Turn",
        cancelLabel: "Keep playing",
        risky: false,
      }),
    },
  ]),
  ...dialog(BlockDiceDialog, [
    { id: "block-1", title: "Block: 1 die", open: block(1, false, [3, 3]) },
    { id: "block-2", title: "Block: 2 dice", open: block(2, false, [4, 3]) },
    {
      id: "block-3-uphill",
      title: "Block: 3 dice uphill, defender chooses",
      open: block(3, true, [2, 6]),
    },
    {
      id: "block-defender",
      title: "Block seen by the defending coach online",
      open: (fx) => {
        setActiveOnlineMatch(onlineMatch(fx, { myTeamId: fx.team1.id }));
        fx.player(1, 0).skills.push(getSkill(SkillType.BLOCK));
        openBlock(fx, { dice: 2, uphill: true, st: [3, 4] });
      },
    },
  ]),
  ...opened(
    (fx) => (
      <>
        <BlockDiceDialog eventBus={fx.bus} />
        <DiceTray eventBus={fx.bus} />
      </>
    ),
    [
      {
        id: "block-rolled",
        title: "Block rolled, re-rolls offered",
        open: blockRolled,
      },
    ]
  ),
  ...dialog(RerollDialog, [
    {
      id: "reroll-both",
      title: "Re-roll: skill or team",
      open: reroll({ sources: ["skill", "team"], skill: "Dodge", needed: 3 }),
    },
    {
      id: "reroll-pro",
      title: "Re-roll: Pro or team",
      open: reroll({ sources: ["pro", "team"], needed: 4 }),
    },
    {
      id: "reroll-team",
      title: "Re-roll: veteran, with no team re-rolls left",
      open: reroll({ sources: ["veteran"] }),
    },
  ]),
  ...dialog(FollowUpDialog, [
    {
      id: "follow-up",
      title: "Follow up",
      open: (fx) => {
        fx.bus.emit(GameEventNames.UI_FollowUpPrompt, {
          attackerId: fx.player(2, 0).id,
          targetSquare: { x: 10, y: 7 },
        });
      },
    },
  ]),
  ...dialog(ReactionDialog, [
    {
      id: "reaction",
      title: "A reactive skill (Stand Firm)",
      open: decision((fx) => ({
        type: "reaction",
        playerId: fx.player(1, 0).id,
        chooserTeamId: fx.team1.id,
        skill: "Stand Firm",
        prompt: "Use Stand Firm to refuse the push and stay in place?",
      })),
    },
  ]),
  ...dialog(FoulAssistsDialog, [
    {
      id: "foul-assists",
      title: "Foul: how many Offensive Assists to add",
      open: decision((fx) => ({
        type: "foul-assists",
        playerId: fx.player(1, 0).id,
        targetId: fx.player(2, 0).id,
        chooserTeamId: fx.team1.id,
        available: 2,
        defensive: 1,
      })),
    },
  ]),
  ...dialog(BiteTargetPrompt, [
    {
      id: "bite-target",
      title: "Bloodlust: click the Thrall Lineman to bite",
      open: decision((fx) => ({
        type: "bite-target",
        playerId: fx.player(1, 0).id,
        chooserTeamId: fx.team1.id,
        targetIds: [fx.player(1, 1).id, fx.player(1, 2).id],
      })),
    },
  ]),
  ...opened(
    (fx) => (
      <HUDLayout
        bottomRight={
          <div data-testid="decision-dock" className="w-full">
            <InterceptionDialog eventBus={fx.bus} />
          </div>
        }
      />
    ),
    [
      {
        id: "interception",
        title: "Interception: pick a player, in the dock",
        open: decision((fx) => ({
          type: "interception",
          chooserTeamId: fx.team2.id,
          passerId: fx.player(1, 0).id,
          candidates: [
            { playerId: "a", playerName: "Orc Blitzer #5", modifier: -2 },

            {
              playerId: "b",
              playerName: "Orc Big Un Blocker Lineman #12",
              modifier: -3,
            },
          ],
        })),
      },
    ]
  ),
  ...dialog(ApothecaryDialog, [
    {
      id: "apothecary",
      title: "Apothecary after a casualty",
      open: decision((fx) => ({
        type: "apothecary",
        id: "x",
        chooserTeamId: fx.team1.id,
        playerId: fx.player(1, 4).id,
        resultKind: "casualty",
        casualtyType: "seriously-hurt",
      })),
    },
  ]),
  ...dialog(InducementChoiceDialog, [
    {
      id: "inducement-choice",
      title: "Inducement choice: Intensive Training",
      open: decision((fx) => ({
        type: "inducement-choice",
        kind: "intensive-training",
        chooserTeamId: fx.team1.id,
        playerIds: [fx.player(1, 4).id, fx.player(1, 5).id],
        skills: ["Block", "Dodge", "Sure Hands"],
        optional: true,
      })),
    },
  ]),
  {
    id: "inducement-panel",
    section: SECTION,
    title: "Pre-match inducements",
    view: (fx) => (
      <InducementSelectionPanel teamId={fx.team1.id} onChanged={() => {}} />
    ),
  },
];
