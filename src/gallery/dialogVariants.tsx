import { GameEventNames } from "../types/events";
import type {
  BiteTargetDecisionRequest,
  DecisionRequest,
  InducementChoiceDecisionRequest,
  RerollSource,
} from "../types/decisions";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { getSkill, SkillType } from "../types/Skills";
import type { BlockRollData } from "../services/BlockResolutionService";
import type { MatchFixture } from "./fixtures";
import { BLOCK_FACES, later, onlineMatch, rollBlock } from "./variantHelpers";
import { type Opener, playRows } from "./matchStage";
import type { Variant } from "./variant";

const STOP = "Stop here";

const ask = (fx: MatchFixture, request: DecisionRequest) =>
  fx.services.gameService.getDecisionService().request(request);

const reaction = (skill: string, prompt: string): Opener =>
  decision((fx) => ({
    type: "reaction",
    playerId: fx.player(1, 0).id,
    chooserTeamId: fx.team1.id,
    skill,
    prompt,
  }));

const biteTarget = ({
  purpose,
  targets = 1,
}: Pick<BiteTargetDecisionRequest, "purpose"> & { targets?: 1 | 2 }): Opener =>
  decision((fx) => ({
    type: "bite-target",
    playerId: fx.player(1, 0).id,
    chooserTeamId: fx.team1.id,
    targetIds: [fx.player(targets, 1).id, fx.player(targets, 2).id],
    ...(purpose ? { purpose } : {}),
  }));

const inducementChoice = (
  kind: InducementChoiceDecisionRequest["kind"],
  extra: Partial<InducementChoiceDecisionRequest>
): Opener =>
  decision((fx) => ({
    type: "inducement-choice",
    kind,
    chooserTeamId: fx.team1.id,
    playerIds: [fx.player(1, 4).id, fx.player(1, 5).id],
    optional: true,
    ...extra,
  }));

const decision =
  (make: (fx: MatchFixture) => DecisionRequest): Opener =>
  (fx) => {
    void ask(fx, make(fx));
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
  alternativeLabel?: string;
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
    void ask(fx, {
      type: "reroll",
      playerId: fx.player(1, 1).id,
      chooserTeamId: fx.team1.id,
      rollKind: "dodge",
      sources,
      ...(skill === undefined ? {} : { skill }),
      roll: 1,
      ...(needed === undefined ? {} : { needed }),
    });
  };

const bothDice: BlockRollData["results"] = [
  BLOCK_FACES.bothDown,
  BLOCK_FACES.skull,
];

const rolledBlock =
  (extra: Partial<BlockRollData>): Opener =>
  (fx) => {
    openBlock(fx, { dice: 2, uphill: false, st: [4, 3] });
    later(50, () => {
      rollBlock(fx, { results: bothDice, ...extra });
    });
  };

const sentOff =
  (steps: (fx: MatchFixture) => void): Opener =>
  (fx) => {
    fx.bus.emit(GameEventNames.RefereeCall, {
      step: "called",
      playerId: fx.player(1, 0).id,
      teamId: fx.team1.id,
      cause: "foul",
    });
    steps(fx);
  };

function refereeRules(fx: MatchFixture, bribed: boolean): void {
  const call = {
    playerId: fx.player(1, 0).id,
    teamId: fx.team1.id,
    cause: "foul",
  } as const;
  if (bribed)
    fx.bus.emit(GameEventNames.RefereeCall, {
      ...call,
      step: "bribed",
      roll: 4,
      works: true,
    });
  fx.bus.emit(GameEventNames.RefereeCall, {
    ...call,
    step: "outcome",
    result: bribed ? "bribed" : "sent-off",
    presentationId: "gallery-referee",
  });
}

const CONFIRM_ROWS = playRows("Confirmations", [
  {
    id: "confirm-dodge",
    title: "Dodge, no re-roll",
    open: confirm({
      title: "Blitzer: Dodge",
      message: "Dodge: 3+. A fall is a turnover.\nNo re-roll available.",
      confirmLabel: "Dodge!",
      cancelLabel: STOP,
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
      cancelLabel: STOP,
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
      cancelLabel: STOP,
      risky: true,
    }),
  },
  {
    id: "confirm-three",
    title: "Three answers",
    open: confirm({
      title: "Pick up the ball?",
      message: "Pick up: 3+. A drop is a turnover.",
      confirmLabel: "Pick up",
      cancelLabel: STOP,
      alternativeLabel: "Secure the ball",
      risky: true,
    }),
  },
  {
    id: "confirm-safe",
    title: "A plain confirmation",
    open: confirm({
      title: "End your turn?",
      message: "Two players have not acted yet.",
      confirmLabel: "End Turn",
      cancelLabel: "Keep playing",
      risky: false,
    }),
  },
]);

const BLOCK_ROWS = playRows("Blocks", [
  { id: "block-1", title: "1 die", open: block(1, false, [3, 3]) },
  { id: "block-2", title: "2 dice", open: block(2, false, [4, 3]) },
  {
    id: "block-3-uphill",
    title: "3 dice uphill, the defender chooses",
    open: block(3, true, [2, 6]),
  },
  {
    id: "block-rolled",
    title: "Rolled, with every re-roll offered",
    open: rolledBlock({
      teamRerollAvailable: true,
      proAvailable: true,
      brawlerAvailable: true,
    }),
  },
  {
    id: "block-rolled-plain",
    title: "Rolled, no re-roll to use",
    open: rolledBlock({}),
  },
  {
    id: "block-defender",
    title: "Online, the defending coach's view",
    open: (fx) => {
      setActiveOnlineMatch(onlineMatch(fx, { myTeamId: fx.team1.id }));
      fx.player(1, 0).skills.push(getSkill(SkillType.BLOCK));
      openBlock(fx, { dice: 2, uphill: true, st: [3, 4] });
    },
  },
  {
    id: "push-choice",
    title: "Choose a push square",
    open: (fx) => {
      fx.bus.emit(GameEventNames.UI_SelectPushDirection, {
        defenderId: fx.player(1, 0).id,
        attackerId: fx.player(2, 0).id,
        validDirections: [{ x: 1, y: 0 }],
        canFollowUp: true,
      });
    },
  },
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
]);

const REROLL_ROWS = playRows("Re-rolls and reactions", [
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
    title: "Re-roll: the Veteran",
    open: reroll({ sources: ["veteran"] }),
  },
  {
    id: "reaction",
    title: "A reactive skill",
    open: reaction(
      "Stand Firm",
      "Use Stand Firm to refuse the push and stay in place?"
    ),
  },
  {
    id: "interception",
    title: "Interception: pick a player",
    open: decision((fx) => ({
      type: "interception",
      chooserTeamId: fx.team2.id,
      passerId: fx.player(1, 0).id,
      candidates: [
        {
          playerId: fx.player(2, 0).id,
          playerName: fx.player(2, 0).playerName,
          modifier: -2,
        },
        {
          playerId: fx.player(2, 1).id,
          playerName: "Orc Big Un Blocker Lineman #12",
          modifier: -3,
        },
      ],
    })),
  },
  {
    id: "bite-target",
    title: "Bloodlust: choose a Thrall to bite",
    open: biteTarget({}),
  },
  {
    id: "bite-squig-knock",
    title: "Squig Rage: choose a team-mate to knock down",
    open: biteTarget({ purpose: "squig-knock-down" }),
  },
  {
    id: "bite-squig-block",
    title: "Squig Rage: choose an opponent to Block",
    open: biteTarget({ purpose: "squig-block", targets: 2 }),
  },
]);

const FOUL_ROWS = playRows("Fouls and injuries", [
  {
    id: "foul-assists",
    title: "How many Offensive Assists to add",
    open: decision((fx) => ({
      type: "foul-assists",
      playerId: fx.player(1, 0).id,
      targetId: fx.player(2, 0).id,
      chooserTeamId: fx.team1.id,
      available: 2,
      defensive: 1,
    })),
  },
  {
    id: "sent-off",
    title: "Sent off, before arguing",
    open: sentOff(() => undefined),
  },
  {
    id: "sent-off-bribe",
    title: "Sent off, a Bribe to use",
    open: sentOff((fx) => {
      fx.services.gameService.getState().bribes = { [fx.team1.id]: 1 };
      void ask(fx, {
        type: "reaction",
        playerId: fx.player(1, 0).id,
        chooserTeamId: fx.team1.id,
        skill: "Bribe",
        prompt: "Use a Bribe?",
      }).then((answer) => {
        refereeRules(fx, "accept" in answer && answer.accept);
      });
    }),
  },
  {
    id: "apothecary",
    title: "Apothecary after a casualty",
    open: decision((fx) => ({
      type: "apothecary",
      id: "x",
      chooserTeamId: fx.team1.id,
      playerId: fx.player(1, 1).id,
      resultKind: "casualty",
      casualtyType: "seriously-hurt",
    })),
  },
]);

const INDUCEMENT_ROWS = playRows("Inducement choices", [
  {
    id: "inducement-choice",
    title: "Intensive Training",
    open: inducementChoice("intensive-training", {
      skills: ["Block", "Dodge", "Sure Hands"],
    }),
  },
  {
    id: "inducement-wizard",
    title: "Sports Wizard",
    open: inducementChoice("sports-wizard", { spells: ["fireball", "zap"] }),
  },
]);

export const DIALOG_VARIANTS: Variant[] = [
  ...CONFIRM_ROWS,
  ...BLOCK_ROWS,
  ...REROLL_ROWS,
  ...FOUL_ROWS,
  ...INDUCEMENT_ROWS,
];
