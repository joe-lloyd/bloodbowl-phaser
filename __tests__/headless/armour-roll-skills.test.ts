import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario, PlayerPlacement } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import type { CommandResponse, EmittedEvent } from "../../src/headless/protocol";

/**
 * Skills that act on an Armour Roll, and which knockdowns they act on.
 * Seeds are committed, never searched (docs/E2E_TESTING.md); each test
 * asserts the dice its seed rolls first, so a dice-order change fails loudly.
 */

function scenario(
  attacker: Partial<PlayerPlacement>,
  target: Partial<PlayerPlacement>
): Scenario {
  return {
    id: "armour-roll-skills",
    name: "Armour roll skills",
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, ...attacker },
        // A spare player keeps team1's turn open after the activation.
        { playerIndex: 1, x: 2, y: 12 },
      ],
      team2Placements: [{ playerIndex: 0, x: 11, y: 5, ...target }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

function session(scenario: Scenario, seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const dataOf = <T>(name: string) =>
    events.filter((e) => e.name === name).map((e) => e.data as T);
  return {
    run,
    dice: () =>
      dataOf<{ description: string }>("diceRoll").map((d) => d.description),
    skills: () =>
      dataOf<{ effect: string }>("skillTriggered").map((d) => d.effect),
    attacker: game.ctx.team1.players[0],
    target: game.ctx.team2.players[0],
  };
}

/** Breathe Fire rolls a natural 6, then armour 6+3 = 9 against AV 10. */
const BREATHE_FIRE_SEED = 30;
/** A POW, then armour 3+6 = 9 against AV 10 and injury 5+2 = 7. */
const POW_SEED = 150;

describe("Mighty Blow and Claws", () => {
  it("stay out of a knockdown that is not a Block Action", async () => {
    const { run, dice, skills, attacker, target } = session(
      scenario(
        {
          skills: [
            SkillType.BREATHE_FIRE,
            SkillType.MIGHTY_BLOW,
            SkillType.CLAWS,
          ],
        },
        { stats: { AV: 10 } }
      ),
      BREATHE_FIRE_SEED
    );

    await run({
      type: "declare-action",
      playerId: attacker.id,
      action: "breatheFire",
    });
    await run({
      type: "special-action",
      action: "breatheFire",
      attackerId: attacker.id,
      defenderId: target.id,
    });

    expect(dice()).toEqual([
      "Breathe Fire (Human Lineman #1): 6 +0 = 6 (Target: 4+)",
      "Armour Roll (Human Lineman #1): 6 + 3 = 9",
    ]);
    expect(skills()).toEqual([
      "Breathe Fire: a gout of flame at Human Lineman #1",
    ]);
    expect(target.status).toBe(PlayerStatus.PRONE);
  });

  for (const order of [
    [SkillType.MIGHTY_BLOW, SkillType.CLAWS],
    [SkillType.CLAWS, SkillType.MIGHTY_BLOW],
  ]) {
    it(`saves Mighty Blow for the injury when Claws breaks armour (${order.join(", ")})`, async () => {
      const { run, dice, skills, attacker, target } = session(
        scenario({ skills: order }, { stats: { AV: 10 } }),
        POW_SEED
      );

      await run({ type: "declare-action", playerId: attacker.id, action: "block" });
      await run({ type: "block", attackerId: attacker.id, defenderId: target.id });
      await run({ type: "choose-block-result", index: 0 });
      await run({ type: "choose-push-direction", x: 12, y: 5 });
      await run({ type: "choose-follow-up", followUp: false });

      expect(dice()).toEqual([
        "Rolled 1 block dice: pow",
        "Armour Roll (Human Lineman #1): 3 + 6 = 9",
        "Injury Roll (Human Lineman #1): 5 + 2 = 7",
      ]);
      expect(skills()).toEqual(
        expect.arrayContaining([
          "Claws: natural 9 breaks armour regardless of AV",
          "Mighty Blow: +1 saved for the injury roll",
        ])
      );
      // 7 + 1 = 8: Knocked Out
      expect(playerBoxOf(target)).toBe("ko");
    });
  }
});
