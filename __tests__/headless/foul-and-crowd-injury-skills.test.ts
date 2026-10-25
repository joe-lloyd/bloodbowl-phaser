import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import type { CommandResponse, EmittedEvent } from "../../src/headless/protocol";

/**
 * Fouls and crowd pushes roll their own Armour and Injury dice, and used to
 * read the standard Injury Table directly, skipping the rules that act on
 * those rolls: Thick Skull, Stunty and Iron Hard Skin. Seeds are committed,
 * never searched (see docs/E2E_TESTING.md); each test first asserts the dice
 * its seed rolls, so a dice-order change fails loudly.
 */

function foulScenario(
  targetSkill: SkillType,
  fouler: { skills?: SkillType[]; assist?: boolean } = {}
): Scenario {
  return {
    id: `foul-${targetSkill}`,
    name: `Foul on a ${targetSkill} player`,
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 10, y: 5, skills: fouler.skills ?? [] },
        // A spare player keeps team1's turn open after the foul.
        { playerIndex: 2, x: 2, y: 12 },
        ...(fouler.assist ? [{ playerIndex: 1, x: 12, y: 5 }] : []),
      ],
      team2Placements: [
        {
          playerIndex: 0,
          x: 11,
          y: 5,
          status: PlayerStatus.PRONE,
          skills: [targetSkill],
        },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

function diceOf(events: EmittedEvent[], rollType: string): number[] | undefined {
  const found = events.find(
    (e) =>
      e.name === "diceRoll" &&
      String((e.data as { rollType: string }).rollType).startsWith(rollType)
  );
  return (found?.data as { value: number[] } | undefined)?.value;
}

async function foul(scenario: Scenario, seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const fouler = game.ctx.team1.players[0];
  const target = game.ctx.team2.players[0];
  await game.execute({ type: "declare-action", playerId: fouler.id, action: "foul" });
  const response = await game.execute({ type: "foul", playerId: fouler.id, x: 11, y: 5 });
  return {
    target,
    armour: diceOf(response.events, "Armor Check"),
    injury: diceOf(response.events, "Injury Roll"),
  };
}

/** Armour 5+6 breaks AV 9; injury 6+2 = 8, Thick Skull's Stunned. */
const THICK_SKULL_FOUL_SEED = 73;
/** Armour 6+3 breaks AV 9; injury 4+3 = 7, a KO on the Stunty table. */
const STUNTY_FOUL_SEED = 67;
/** Armour 5+2 = 7 against AV 9: breaks only with the assist and Dirty Player. */
const IRON_HARD_SKIN_FOUL_SEED = 2;
/** Push into the crowd; injury 5+2 = 7, a KO on the Stunty table. */
const STUNTY_CROWD_SEED = 5;

describe("a foul's injury roll", () => {
  it("lets Thick Skull turn an 8 into Stunned", async () => {
    const { target, armour, injury } = await foul(
      foulScenario(SkillType.THICK_SKULL),
      THICK_SKULL_FOUL_SEED
    );

    expect(armour).toEqual([5, 6]);
    expect(injury).toEqual([6, 2]);
    expect(target.status).toBe(PlayerStatus.STUNNED);
    expect(playerBoxOf(target)).toBe("pitch");
  });

  it("rolls on the Stunty Injury Table", async () => {
    const { target, armour, injury } = await foul(
      foulScenario(SkillType.STUNTY),
      STUNTY_FOUL_SEED
    );

    expect(armour).toEqual([6, 3]);
    expect(injury).toEqual([4, 3]);
    expect(playerBoxOf(target)).toBe("ko");
  });
});

describe("a foul's armour roll against Iron Hard Skin", () => {
  it("ignores the assist and the Dirty Player bonus", async () => {
    const { target, armour, injury } = await foul(
      foulScenario(SkillType.IRON_HARD_SKIN, {
        skills: [SkillType.DIRTY_PLAYER],
        assist: true,
      }),
      IRON_HARD_SKIN_FOUL_SEED
    );

    expect(target.stats.AV).toBe(9);
    expect(armour).toEqual([5, 2]);
    expect(injury).toBeUndefined();
    expect(target.status).toBe(PlayerStatus.PRONE);
  });
});

describe("Injury by the Crowd", () => {
  it("rolls on the Stunty Injury Table", async () => {
    const scenario: Scenario = {
      id: "crowd-stunty",
      name: "A Stunty player pushed into the crowd",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 5, y: 1 },
          { playerIndex: 1, x: 2, y: 12 },
        ],
        team2Placements: [
          { playerIndex: 0, x: 5, y: 0, skills: [SkillType.STUNTY] },
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 10 },
      },
    };
    const game = new HeadlessGame({ scenario: scenario, seed: STUNTY_CROWD_SEED });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    const events: EmittedEvent[] = [];
    const run = async (command: unknown): Promise<CommandResponse> => {
      const response = await game.execute(command);
      events.push(...response.events);
      return response;
    };

    await run({ type: "declare-action", playerId: attacker.id, action: "block" });
    await run({ type: "block", attackerId: attacker.id, defenderId: defender.id });
    await run({ type: "choose-block-result", index: 0 });
    let response = await run({ type: "choose-push-direction", x: 5, y: -1 });
    while (response.pendingDecision) {
      const pending = response.pendingDecision;
      if (pending.type === "follow-up") {
        response = await run({ type: "choose-follow-up", followUp: false });
      } else if (pending.type === "apothecary") {
        response = await run({ type: "use-apothecary", accept: false });
      } else {
        throw new Error(`unexpected decision ${pending.type}`);
      }
    }

    expect(diceOf(events, "Block Roll")).toEqual(["pow"]);
    expect(diceOf(events, "Injury by the Crowd")).toEqual([5, 2]);
    expect(playerBoxOf(defender)).toBe("ko");
  });
});
