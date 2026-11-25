import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import type {
  BiteTargetDecisionRequest,
  DecisionRequest,
  RerollableRollKind,
} from "../types/decisions";
import { PlayerStatus, type Player } from "../types/Player";
import { RosterName } from "../types/Team";
import type { Scenario } from "../types/Scenario";
import { offerApothecary } from "../game/inducements/apothecary";
import { CastSportsWizardOperation } from "../game/inducements/sportsWizard";
import { BloodlustBiteOperation } from "../game/operations/BloodlustBiteOperation";
import { SendOffOperation } from "../game/operations/SendOffOperation";
import { eligibleSkills } from "../game/progression/progression";
import { withRerollOffer } from "../game/skills/rerolls";
import {
  everyReroll,
  followUp,
  openBlock,
  pushed,
  rollBlock,
} from "./blockScenes";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { getSkill, SkillType } from "../types/Skills";
import type { MatchFixture } from "./fixtures";
import { onlineMatch } from "./variantHelpers";
import { livePlayer, type Opener, playRows, SCRIMMAGE } from "./matchStage";
import type { Variant } from "./variant";

const INTERCEPTION: Scenario = {
  id: "gallery-interception",
  name: "Interception",
  description: "A pass over two opponents",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 6, y: 7, hasBall: true },
      { playerIndex: 1, x: 12, y: 7 },
    ],
    team2Placements: [
      { playerIndex: 0, x: 9, y: 7 },
      { playerIndex: 1, x: 10, y: 7 },
    ],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
  },
};

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

const NIGHT_GOBLINS = { ...SCRIMMAGE, team1Roster: RosterName.NIGHT_GOBLIN };

const squigRage = (
  purpose: NonNullable<BiteTargetDecisionRequest["purpose"]>,
  team: 1 | 2
): Opener =>
  decision((fx) => {
    learn(SkillType.SQUIG_RAGE)(livePlayer(fx, 1, 0));
    return {
      type: "bite-target",
      playerId: fx.player(1, 0).id,
      chooserTeamId: fx.team1.id,
      targetIds: near(fx, team).map(({ id }) => id),
      purpose,
    };
  });

const decision =
  (make: (fx: MatchFixture) => DecisionRequest): Opener =>
  (fx) => {
    void ask(fx, make(fx));
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
  (
    kind: RerollableRollKind,
    needed: number,
    prepare: (player: Player) => void
  ): Opener =>
  (fx) => {
    const { gameService } = fx.services;
    const player = livePlayer(fx, 1, 1);
    prepare(player);
    gameService.declareAction({ playerId: player.id, action: "move" });
    let rolls = [1, 6];
    void withRerollOffer(gameService.getFlowContext(), player, kind, () => {
      const [roll = 6, ...rest] = rolls;
      rolls = rest;
      return { success: roll >= needed, roll, needed };
    });
  };

const teamRerolls = (fx: MatchFixture) => {
  fx.team1.rerolls = 2;
};

const learn =
  (...skills: SkillType[]) =>
  (player: Player) => {
    player.skills.push(...skills.map((skill) => getSkill(skill)));
  };

const bribeOffered: Opener = (fx) => {
  const { gameService } = fx.services;
  gameService.getState().bribes = { [fx.team1.id]: 1 };
  void new SendOffOperation(fx.player(1, 0).id, "Sent off").execute(
    gameService.getFlowContext()
  );
};

const near = (fx: MatchFixture, team: 1 | 2) =>
  [0, 1, 2]
    .map((index) => livePlayer(fx, team, index))
    .filter(({ id }) => id !== fx.player(1, 0).id);

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
  { id: "block-1", title: "1 die", open: openBlock({ strength: [3, 3] }) },
  { id: "block-2", title: "2 dice", open: openBlock({ strength: [4, 3] }) },
  {
    id: "block-3-uphill",
    title: "3 dice uphill, the defender chooses",
    open: openBlock({ strength: [2, 6] }),
  },
  {
    id: "block-rolled",
    title: "Rolled, with every re-roll offered",
    fixture: { ...SCRIMMAGE, seed: 12 },
    open: everyReroll(
      rollBlock({ strength: [4, 3] }, { numDice: 2, isAttackerChoice: true })
    ),
  },
  {
    id: "block-rolled-plain",
    title: "Rolled, no re-roll to use",
    open: rollBlock(
      { strength: [4, 3] },
      { numDice: 2, isAttackerChoice: true }
    ),
  },
  {
    id: "block-defender",
    title: "Online, the defending coach's view",
    open: (fx) => {
      setActiveOnlineMatch(
        onlineMatch(fx, { myTeamId: fx.team1.id, mayAct: () => false })
      );
      fx.player(1, 0).skills.push(getSkill(SkillType.BLOCK));
      openBlock({ attacking: 2, strength: [3, 4] })(fx);
    },
  },
  { id: "push-choice", title: "Choose a push square", open: pushed },
  { id: "follow-up", title: "Follow up", open: followUp },
]);

const REROLL_ROWS = playRows("Re-rolls and reactions", [
  {
    id: "reroll-both",
    title: "Re-roll: skill or team",
    open: (fx) => {
      teamRerolls(fx);
      reroll("dodge", 3, learn(SkillType.DODGE))(fx);
    },
  },
  {
    id: "reroll-pro",
    title: "Re-roll: Pro or team",
    open: (fx) => {
      teamRerolls(fx);
      reroll("dodge", 4, learn(SkillType.PRO))(fx);
    },
  },
  {
    id: "reroll-team",
    title: "Re-roll: the Veteran",
    open: reroll("pickup", 3, (player) => {
      player.veteran = true;
    }),
  },
  {
    id: "reaction",
    title: "A reactive skill",
    open: (fx) => {
      learn(SkillType.STAND_FIRM)(livePlayer(fx, 1, 0));
      reaction(
        SkillType.STAND_FIRM,
        "Use Stand Firm to refuse the push and stay in place?"
      )(fx);
    },
  },
  {
    id: "interception",
    title: "Interception: pick a player",
    fixture: { scenario: INTERCEPTION, seed: 3 },
    open: (fx) => {
      livePlayer(fx, 2, 1).playerName = "Grimgutz Skullsplitta the Unwashed";
      const { gameService } = fx.services;
      const passerId = fx.player(1, 0).id;
      gameService.declareAction({ playerId: passerId, action: "pass" });
      void gameService.throwBall({ passerId, targetX: 12, targetY: 7 });
    },
  },
  {
    id: "bite-target",
    title: "Bloodlust: choose a Thrall to bite",
    fixture: { ...SCRIMMAGE, team1Roster: RosterName.VAMPIRE },
    open: (fx) => {
      learn(SkillType.BLOODLUST)(livePlayer(fx, 1, 0));
      void new BloodlustBiteOperation(
        fx.player(1, 0).id,
        "consequences",
        () => undefined
      ).execute(fx.services.gameService.getFlowContext());
    },
  },
  {
    id: "bite-squig-knock",
    title: "Squig Rage: choose a team-mate to knock down",
    fixture: NIGHT_GOBLINS,
    open: squigRage("squig-knock-down", 1),
  },
  {
    id: "bite-squig-block",
    title: "Squig Rage: choose an opponent to Block",
    fixture: NIGHT_GOBLINS,
    open: squigRage("squig-block", 2),
  },
]);

const FOUL_ROWS = playRows("Fouls and injuries", [
  {
    id: "foul-assists",
    title: "How many Offensive Assists to add",
    fixture: { scenario: "ux-foul-preview" },
    open: (fx) => {
      const { gameService } = fx.services;
      const foulerId = fx.player(1, 0).id;
      gameService.declareAction({ playerId: foulerId, action: "foul" });
      void gameService.foulPlayer(foulerId, 10, 5);
    },
  },
  {
    id: "sent-off",
    title: "Sent off, before arguing",
    open: (fx) => {
      fx.bus.emit(GameEventNames.RefereeCall, {
        step: "called",
        playerId: fx.player(1, 0).id,
        teamId: fx.team1.id,
        cause: "foul",
      });
    },
  },
  {
    id: "sent-off-bribe",
    title: "Sent off, a Bribe to use",
    open: bribeOffered,
  },
  {
    id: "apothecary",
    title: "Apothecary after a casualty",
    open: (fx) => {
      const player = livePlayer(fx, 1, 1);
      player.status = PlayerStatus.INJURED;
      void offerApothecary(fx.services.gameService, fx.bus, player, {
        resultKind: "casualty",
        casualtyType: "seriously-hurt",
      });
    },
  },
]);

const INDUCEMENT_ROWS = playRows("Inducement choices", [
  {
    id: "inducement-choice",
    title: "Intensive Training",
    open: decision((fx) => {
      const player = livePlayer(fx, 1, 1);
      return {
        type: "inducement-choice",
        kind: "intensive-training",
        chooserTeamId: fx.team1.id,
        playerIds: [player.id],
        skills: eligibleSkills(player, player.primary ?? []),
        optional: false,
      };
    }),
  },
  {
    id: "inducement-wizard",
    title: "Sports Wizard",
    fixture: { scenario: "sports-wizard-spells" },
    open: (fx) => {
      void new CastSportsWizardOperation(fx.team1.id).execute(
        fx.services.gameService.getFlowContext()
      );
    },
  },
]);

export const DIALOG_VARIANTS: Variant[] = [
  ...CONFIRM_ROWS,
  ...BLOCK_ROWS,
  ...REROLL_ROWS,
  ...FOUL_ROWS,
  ...INDUCEMENT_ROWS,
];
