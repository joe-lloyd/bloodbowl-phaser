import {
  BlockResolutionService,
  type BlockRollData,
} from "../services/BlockResolutionService";
import { GameEventNames } from "../types/events";
import { getSkill, SkillType } from "../types/Skills";
import type { MatchFixture } from "./fixtures";
import { livePlayer, type Opener } from "./matchStage";
import { later } from "./variantHelpers";

interface Block {
  attacking?: 1 | 2;
  strength: [number, number];
}

const PUSH = BlockResolutionService.mapRollToResult(3);

function sides(fx: MatchFixture, attacking: 1 | 2 = 1) {
  const attacker = livePlayer(fx, attacking, 0);
  const defender = livePlayer(fx, attacking === 1 ? 2 : 1, 0);
  return { attacker, defender };
}

export const openBlock =
  ({ attacking, strength }: Block): Opener =>
  (fx) => {
    const { gameService } = fx.services;
    const { attacker, defender } = sides(fx, attacking);
    attacker.stats.ST = strength[0];
    defender.stats.ST = strength[1];
    const state = gameService.getState();
    state.activeTeamId = attacker.teamId;
    state.turn.teamId = attacker.teamId;
    gameService.declareAction({ playerId: attacker.id, action: "block" });
    gameService.previewBlock(attacker.id, defender.id);
  };

type Roll = Pick<BlockRollData, "numDice" | "isAttackerChoice">;

export const rollBlock =
  (block: Block, roll: Roll): Opener =>
  (fx) => {
    openBlock(block)(fx);
    const { attacker, defender } = sides(fx, block.attacking);
    void fx.services.gameService.rollBlockDice({
      attackerId: attacker.id,
      defenderId: defender.id,
      ...roll,
    });
  };

export const everyReroll =
  (next: Opener): Opener =>
  (fx) => {
    fx.team1.rerolls = 2;
    sides(fx).attacker.skills.push(
      getSkill(SkillType.PRO),
      getSkill(SkillType.BRAWLER)
    );
    next(fx);
  };

async function pushDefender(fx: MatchFixture): Promise<void> {
  const { attacker, defender } = sides(fx);
  const { gameService } = fx.services;
  await gameService.rollBlockDice({
    attackerId: attacker.id,
    defenderId: defender.id,
    numDice: 2,
    isAttackerChoice: true,
  });
  await gameService.resolveBlock(attacker.id, defender.id, PUSH);
}

export const pushed: Opener = (fx) => {
  openBlock({ strength: [4, 3] })(fx);
  void pushDefender(fx);
};

export const followUp: Opener = (fx) => {
  fx.bus.on(GameEventNames.UI_SelectPushDirection, (push) => {
    const [direction] = push.validDirections;
    if (!direction) return;
    later(100, () => {
      void fx.services.gameService.executePush({
        attackerId: push.attackerId,
        defenderId: push.defenderId,
        direction,
        resultType: push.resultType ?? "push",
        followUp: false,
      });
    });
  });
  pushed(fx);
};
