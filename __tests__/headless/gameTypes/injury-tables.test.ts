import { z } from "zod";
import { describe, it, expect } from "vitest";
import { InjuryOperation } from "../../../src/game/operations/InjuryOperation";
import { InjuryType, PlayerStatus } from "../../../src/types/Player";
import { SkillType, getSkill } from "../../../src/types/Skills";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { duel, session } from "./harness";

async function settle(s: ReturnType<typeof session>): Promise<void> {
  for (let i = 0; i < 50 && !s.game.pendingDecision(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function injure(
  gameType: GameType,
  dice: number[],
  prepare: (player: ReturnType<ReturnType<typeof session>["player"]>) => void = () => undefined
) {
  const s = session(gameType, duel([{}], [{}]), dice);
  const player = s.player(2);
  prepare(player);
  s.game.ctx.gameService.flowManager.add(
    new InjuryOperation(player.id, { causedById: s.player(1).id, cause: "block" }),
    true
  );
  await settle(s);
  return { s, player };
}

const casualtyRolls = (s: ReturnType<typeof session>) =>
  s.rolls().filter((r) => r.startsWith("Casualty Roll"));

describe("SB-M13, GB-M14: the 2025 rulebook injury tables", () => {
  for (const gameType of ["street-bowl", "gutter-bowl"] as const) {
    it(`${gameType}: 9 is Knocked-out with no Casualty roll`, async () => {
      const { s, player } = await injure(gameType, [4, 5]);
      expect(player.status).toBe(PlayerStatus.KO);
      expect(casualtyRolls(s)).toEqual([]);
    });

    const grades: [number, number[], PlayerStatus, InjuryType[]][] = [
      [1, [], PlayerStatus.INJURED, [InjuryType.BADLY_HURT]],
      [8, [], PlayerStatus.INJURED, [InjuryType.BADLY_HURT]],
      [9, [], PlayerStatus.INJURED, [InjuryType.MISS_NEXT_GAME]],
      [
        11,
        [],
        PlayerStatus.INJURED,
        [InjuryType.NIGGLING_INJURY, InjuryType.MISS_NEXT_GAME],
      ],
      [
        13,
        [3],
        PlayerStatus.INJURED,
        [InjuryType.MISS_NEXT_GAME, InjuryType.STAT_DECREASE_MA],
      ],
      [16, [], PlayerStatus.DEAD, [InjuryType.DEAD]],
    ];
    for (const [d16, extra, status, injuries] of grades) {
      it(`${gameType}: 10 then a Casualty roll of ${String(d16)} records ${injuries.join(", ")}`, async () => {
        const { s, player } = await injure(gameType, [5, 5, d16, ...extra]);
        expect(casualtyRolls(s)).toHaveLength(1);
        expect(player.status).toBe(status);
        expect(player.injuries).toEqual(injuries);
      });
    }
  }

  it("a Smashed Knee takes a point of MA", async () => {
    const { player } = await injure("street-bowl", [6, 6, 14, 3]);
    expect(player.stats.MA).toBe(5);
  });

  it("a Head Injury takes a point of AV", async () => {
    const { player } = await injure("street-bowl", [6, 6, 14, 1]);
    expect(player.stats.AV).toBe(8);
    expect(player.injuries).toEqual([
      InjuryType.MISS_NEXT_GAME,
      InjuryType.STAT_DECREASE_AV,
    ]);
  });

  it("a Broken Arm makes Passing Ability one worse", async () => {
    const { player } = await injure("street-bowl", [6, 6, 14, 4]);
    expect(player.stats.PA).toBe(5);
    expect(player.injuries).toContain(InjuryType.STAT_DECREASE_PA);
  });

  it("a reduction that cannot apply is a Miss Next Game only", async () => {
    const { player } = await injure("street-bowl", [6, 6, 14, 3], (p) => {
      p.stats.MA = 1;
    });
    expect(player.stats.MA).toBe(1);
    expect(player.injuries).toEqual([InjuryType.MISS_NEXT_GAME]);
  });

  it("a Niggling Injury adds 1 to the Casualty roll", async () => {
    const { player } = await injure("street-bowl", [5, 5, 8], (p) => {
      p.injuries.push(InjuryType.NIGGLING_INJURY);
    });
    expect(player.injuries).toEqual([
      InjuryType.NIGGLING_INJURY,
      InjuryType.MISS_NEXT_GAME,
    ]);
  });

  it("Decay adds 1 to the Casualty roll", async () => {
    const { player } = await injure("gutter-bowl", [5, 5, 8], (p) => {
      p.skills.push(getSkill(SkillType.DECAY));
    });
    expect(player.injuries).toEqual([InjuryType.MISS_NEXT_GAME]);
  });

  it("the Stunty table makes 9 Badly Hurt with no Casualty roll", async () => {
    const { s, player } = await injure("gutter-bowl", [4, 5], (p) => {
      p.skills.push(getSkill(SkillType.STUNTY));
    });
    expect(player.injuries).toEqual([InjuryType.BADLY_HURT]);
    expect(casualtyRolls(s)).toEqual([]);
  });

  it("the Stunty table makes 10 a Casualty roll", async () => {
    const { s, player } = await injure("gutter-bowl", [5, 5, 15], (p) => {
      p.skills.push(getSkill(SkillType.STUNTY));
    });
    expect(casualtyRolls(s)).toHaveLength(1);
    expect(player.status).toBe(PlayerStatus.DEAD);
  });

  it("Sevens keeps its own table: 10 is Badly Hurt with no Casualty roll", async () => {
    const { s, player } = await injure("sevens", [5, 5]);
    expect(player.injuries).toEqual([InjuryType.BADLY_HURT]);
    expect(casualtyRolls(s)).toEqual([]);
  });
});

const casualtiesInflicted = (s: ReturnType<typeof session>) =>
  s.dataOf(
    "playerCasualtyInflicted",
    z.object({
      causerId: z.string().optional(),
      victimId: z.string(),
      cause: z.string(),
      sppEligible: z.boolean(),
    })
  );

describe("BB-M6: the Beach Bowl injury table", () => {
  it("7 is Stunned", async () => {
    const { player } = await injure("beach-bowl", [3, 4]);
    expect(player.status).toBe(PlayerStatus.STUNNED);
  });

  it("8 is a Mild Knock-out that is not a Casualty", async () => {
    const { s, player } = await injure("beach-bowl", [4, 4]);
    expect(player.status).toBe(PlayerStatus.KO);
    expect(s.game.ctx.gameService.getState().seriousKnockoutIds).toBeUndefined();
    expect(casualtiesInflicted(s)).toHaveLength(0);
  });

  it("12 is a Serious Knock-out that counts as a Casualty for SPP", async () => {
    const { s, player } = await injure("beach-bowl", [6, 6]);
    expect(player.status).toBe(PlayerStatus.KO);
    expect(player.injuries).toEqual([]);
    expect(s.game.ctx.gameService.getState().seriousKnockoutIds).toEqual([
      player.id,
    ]);
    expect(casualtiesInflicted(s)).toEqual([
      {
        causerId: s.player(1).id,
        victimId: player.id,
        cause: "block",
        sppEligible: true,
      },
    ]);
    expect(casualtyRolls(s)).toEqual([]);
  });

  it("Stunty players use the same table: 9 is a Mild Knock-out", async () => {
    const { player } = await injure("beach-bowl", [4, 5], (p) => {
      p.skills.push(getSkill(SkillType.STUNTY));
    });
    expect(player.status).toBe(PlayerStatus.KO);
  });

  it("Regeneration does nothing: a 12 stays Knocked-out", async () => {
    const { player } = await injure("beach-bowl", [6, 6], (p) => {
      p.skills.push(getSkill(SkillType.REGENERATION));
    });
    expect(player.status).toBe(PlayerStatus.KO);
  });

  const recoveries: [string, number[], number, PlayerStatus][] = [
    ["a Mild Knock-out recovers on a 3", [4, 4], 3, PlayerStatus.RESERVE],
    ["a Mild Knock-out stays out on a 2", [4, 4], 2, PlayerStatus.KO],
    ["a Serious Knock-out stays out on a 4", [5, 5], 4, PlayerStatus.KO],
    ["a Serious Knock-out recovers on a 5", [5, 5], 5, PlayerStatus.RESERVE],
  ];
  for (const [name, injury, recovery, status] of recoveries) {
    it(name, async () => {
      const { s, player } = await injure("beach-bowl", [...injury, recovery]);
      await s.game.ctx.gameService.rollKORecovery(() => Promise.resolve());
      expect(player.status).toBe(status);
    });
  }

  it("Sevens still recovers a Knock-out on a 4, not a 3", async () => {
    const { s, player } = await injure("sevens", [4, 4, 3]);
    await s.game.ctx.gameService.rollKORecovery(() => Promise.resolve());
    expect(player.status).toBe(PlayerStatus.KO);
  });
});
