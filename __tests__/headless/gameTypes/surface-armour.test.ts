import { describe, it, expect } from "vitest";
import { PlayerStatus } from "../../../src/types/Player";
import { SkillType } from "../../../src/types/Skills";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { type PlayerPlacement } from "../../../src/types/Scenario";
import { duel, session } from "./harness";

const FAR_AWAY = { x: 16, y: 5 };

async function failedRush(gameType: GameType) {
  const s = session(
    gameType,
    duel([{ stats: { MA: 1 } }], [FAR_AWAY]),
    [1, 4, 4]
  );
  await s.run({
    type: "declare-action",
    playerId: s.player(1).id,
    action: "move",
  });
  await s.run({
    type: "move",
    playerId: s.player(1).id,
    path: [
      { x: 11, y: 3 },
      { x: 12, y: 3 },
    ],
  });
  return s;
}

async function failedDodge(gameType: GameType) {
  const s = session(gameType, duel([{}], [{}]), [1, 4, 4]);
  await s.run({
    type: "declare-action",
    playerId: s.player(1).id,
    action: "move",
  });
  await s.run({
    type: "move",
    playerId: s.player(1).id,
    path: [{ x: 10, y: 4 }],
  });
  return s;
}

async function blockKnockDown(
  gameType: GameType,
  attacker: Partial<PlayerPlacement>,
  defender: Partial<PlayerPlacement>
) {
  const s = session(gameType, duel([attacker], [defender]), [5, 4, 4]);
  await s.run({
    type: "declare-action",
    playerId: s.player(1).id,
    action: "block",
  });
  await s.run({
    type: "block",
    attackerId: s.player(1).id,
    defenderId: s.player(2).id,
  });
  await s.run({ type: "choose-block-result", index: 0 });
  await s.run({ type: "choose-push-direction", x: 12, y: 3 });
  await s.run({ type: "choose-follow-up", followUp: false });
  return s;
}

const FALL_TOTALS: [GameType, number][] = [
  ["sevens", 8],
  ["street-bowl", 9],
  ["beach-bowl", 7],
  ["gutter-bowl", 9],
];

const KNOCK_DOWN_TOTALS: [GameType, number][] = [
  ["sevens", 8],
  ["street-bowl", 9],
  ["beach-bowl", 9],
  ["gutter-bowl", 9],
];

describe("SB-M4, GB-M6, BB-M5: the surface changes the Armour roll", () => {
  for (const [gameType, total] of FALL_TOTALS) {
    it(`a failed Rush rolls 4 + 4 for ${String(total)} in ${gameType}`, async () => {
      const s = await failedRush(gameType);
      expect(s.player(1).status).not.toBe(PlayerStatus.ACTIVE);
      expect(s.armour()[0]?.roll).toBe(total);
    });

    it(`a failed Dodge rolls 4 + 4 for ${String(total)} in ${gameType}`, async () => {
      const s = await failedDodge(gameType);
      expect(s.player(1).status).not.toBe(PlayerStatus.ACTIVE);
      expect(s.armour()[0]?.roll).toBe(total);
    });
  }

  for (const [gameType, total] of KNOCK_DOWN_TOTALS) {
    it(`a Block that Knocks Down rolls 4 + 4 for ${String(total)} in ${gameType}`, async () => {
      const s = await blockKnockDown(gameType, {}, {});
      expect(s.armour()[0]?.roll).toBe(total);
    });
  }

  it("does not stack with a Chainsaw's +3 on the downed wielder (SB-M4)", async () => {
    const s = await blockKnockDown(
      "street-bowl",
      {},
      { skills: [SkillType.CHAINSAW] }
    );
    expect(s.armour()[0]?.roll).toBe(11);
  });

  it("does not stack with Claws (SB-M4)", async () => {
    const s = await blockKnockDown(
      "street-bowl",
      { skills: [SkillType.CLAWS] },
      { stats: { AV: 10 } }
    );
    expect(s.armour()[0]).toEqual({ roll: 8, broken: true });
  });
});

describe("BB-M8: Rush target", () => {
  const cases: [GameType, string, PlayerStatus][] = [
    ["sevens", "needs 2+", PlayerStatus.ACTIVE],
    ["street-bowl", "needs 2+", PlayerStatus.ACTIVE],
    ["gutter-bowl", "needs 2+", PlayerStatus.ACTIVE],
    ["beach-bowl", "needs 3+", PlayerStatus.PRONE],
  ];
  for (const [gameType, needs, status] of cases) {
    it(`a Rush roll of 2 ${needs} in ${gameType}`, async () => {
      const s = session(
        gameType,
        duel([{ stats: { MA: 1 } }], [FAR_AWAY]),
        [2, 1, 1]
      );
      await s.run({
        type: "declare-action",
        playerId: s.player(1).id,
        action: "move",
      });
      await s.run({
        type: "move",
        playerId: s.player(1).id,
        path: [
          { x: 11, y: 3 },
          { x: 12, y: 3 },
        ],
      });
      expect(s.rolls().find((r) => r.startsWith("Rush"))).toContain(needs);
      expect(s.player(1).status).toBe(status);
    });
  }
});
