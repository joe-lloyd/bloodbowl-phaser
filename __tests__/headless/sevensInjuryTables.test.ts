import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { InjuryOperation } from "../../src/game/operations/InjuryOperation";
import { GameOperation } from "../../src/game/core/GameOperation";
import { SCENARIOS } from "../../src/data/scenarios";
import { InjuryType, Player, PlayerStatus } from "../../src/types/Player";
import { SkillType, getSkill } from "../../src/types/Skills";

/**
 * Sevens injury tables I1-I5 (docs/SEVENS_RULES.md): one 2D6 roll decides
 * everything. There is no D16 Casualty Roll and no Lasting Injury.
 */

const scrimmage = SCENARIOS.find((s) => s.id === "basic-scrimmage")!;

async function injure(
  total: number,
  opts: { stunty?: boolean; modifier?: number; apothecary?: boolean } = {}
): Promise<{ game: HeadlessGame; player: Player; d16: number }> {
  const game = new HeadlessGame({ scenario: scrimmage, seed: 1 });
  const player = game.ctx.team1.players[0];
  if (opts.stunty) player.skills.push(getSkill(SkillType.STUNTY));
  game.ctx.team1.apothecary = !!opts.apothecary;
  const dice = game.ctx.gameService.getDiceController();
  vi.spyOn(dice, "roll2D6").mockReturnValue(total);
  const d16 = vi.spyOn(dice, "rollD16");

  const op: GameOperation = new InjuryOperation(player.id, {
    modifier: opts.modifier,
  });
  game.ctx.gameService.flowManager.add(op, true);
  for (let i = 0; i < 50 && !game.pendingDecision(); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { game, player, d16: d16.mock.calls.length };
}

type Outcome = [status: PlayerStatus, injuries: InjuryType[]];
const STUNNED: Outcome = [PlayerStatus.STUNNED, []];
const KO: Outcome = [PlayerStatus.KO, []];
const BADLY_HURT: Outcome = [PlayerStatus.INJURED, [InjuryType.BADLY_HURT]];
const SERIOUSLY_HURT: Outcome = [
  PlayerStatus.INJURED,
  [InjuryType.MISS_NEXT_GAME],
];
const DEAD: Outcome = [PlayerStatus.DEAD, [InjuryType.DEAD]];

describe("Sevens injury tables", () => {
  const standard: [number, Outcome][] = [
    [2, STUNNED],
    [7, STUNNED],
    [8, KO],
    [9, KO],
    [10, BADLY_HURT],
    [11, SERIOUSLY_HURT],
    [12, DEAD],
  ];
  for (const [total, [status, injuries]] of standard) {
    it(`standard table: ${total} is ${status} ${injuries.join("")}`, async () => {
      const { player, d16 } = await injure(total);
      expect(player.status).toBe(status);
      expect(player.injuries).toEqual(injuries);
      expect(d16).toBe(0);
    });
  }

  const stunty: [number, Outcome][] = [
    [6, STUNNED],
    [7, KO],
    [8, KO],
    [9, BADLY_HURT],
    [10, BADLY_HURT],
    [11, SERIOUSLY_HURT],
    [12, DEAD],
  ];
  for (const [total, [status, injuries]] of stunty) {
    it(`Stunty table: ${total} is ${status} ${injuries.join("")}`, async () => {
      const { player, d16 } = await injure(total, { stunty: true });
      expect(player.status).toBe(status);
      expect(player.injuries).toEqual(injuries);
      expect(d16).toBe(0);
    });
  }

  it("a modified total above 12 is Dead (Mighty Blow on a natural 12)", async () => {
    const { player } = await injure(12, { modifier: 1 });
    expect(player.status).toBe(PlayerStatus.DEAD);
    expect(player.injuries).toEqual([InjuryType.DEAD]);
  });

  it("the Apothecary is offered on Seriously Hurt and patches the player to Reserves on a 4+", async () => {
    const { game, player } = await injure(11, { apothecary: true });
    const pending = game.pendingDecision();
    expect(pending?.type === "apothecary" && pending.casualtyType).toBe(
      "seriously-hurt"
    );
    vi.spyOn(game.ctx.gameService.getDiceController(), "rollD6").mockReturnValue(4);
    const response = await game.execute({ type: "use-apothecary", accept: true });
    expect(response.ok).toBe(true);
    expect(player.status).toBe(PlayerStatus.RESERVE);
  });
});
