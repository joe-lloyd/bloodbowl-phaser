import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { foulAddingAllAssists } from "../utils/test-helpers";
import { SkillType } from "../../src/types/Skills";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";

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

function diceOf(
  events: EmittedEvent[],
  rollType: string
): (number[] | string[]) | undefined {
  const found = events.find(
    (e) =>
      e.name === "diceRoll" &&
      z
        .object({ rollType: z.string() })
        .parse(e.data)
        .rollType.startsWith(rollType)
  );
  return z
    .union([
      z.object({ value: z.union([z.number().array(), z.string().array()]) }),
      z.undefined(),
    ])
    .parse(found?.data)?.value;
}

async function foul(scenario: Scenario, seed: number) {
  const game = new HeadlessGame({ scenario, seed });
  const fouler = game.ctx.team1.players[0];
  const target = game.ctx.team2.players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(fouler).id,
    action: "foul",
  });
  const response = await foulAddingAllAssists(game, {
    type: "foul",
    playerId: fixtureValue(fouler).id,
    x: 11,
    y: 5,
  });
  return {
    target,
    armour: diceOf(response.events, "Foul Armour Roll"),
    injury: diceOf(response.events, "Injury Roll"),
  };
}

const THICK_SKULL_FOUL_SEED = 73;

const STUNTY_FOUL_SEED = 67;

const IRON_HARD_SKIN_FOUL_SEED = 2;

const STUNTY_CROWD_SEED = 5;

describe("a foul's injury roll", () => {
  it("lets Thick Skull turn an 8 into Stunned", async () => {
    const { target, armour, injury } = await foul(
      foulScenario(SkillType.THICK_SKULL),
      THICK_SKULL_FOUL_SEED
    );

    expect(armour).toEqual([5, 6]);
    expect(injury).toEqual([6, 2]);
    expect(fixtureValue(target).status).toBe(PlayerStatus.STUNNED);
    expect(playerBoxOf(fixtureValue(target))).toBe("pitch");
  });

  it("rolls on the Stunty Injury Table", async () => {
    const { target, armour, injury } = await foul(
      foulScenario(SkillType.STUNTY),
      STUNTY_FOUL_SEED
    );

    expect(armour).toEqual([6, 3]);
    expect(injury).toEqual([4, 3]);
    expect(playerBoxOf(fixtureValue(target))).toBe("ko");
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

    expect(fixtureValue(target).stats.AV).toBe(9);
    expect(armour).toEqual([5, 2]);
    expect(injury).toBeUndefined();
    expect(fixtureValue(target).status).toBe(PlayerStatus.PRONE);
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
    const game = new HeadlessGame({
      scenario: scenario,
      seed: STUNTY_CROWD_SEED,
    });
    const attacker = game.ctx.team1.players[0];
    const defender = game.ctx.team2.players[0];
    const events: EmittedEvent[] = [];
    const run = async (command: unknown): Promise<CommandResponse> => {
      const response = await game.execute(command);
      events.push(...response.events);
      return response;
    };

    await run({
      type: "declare-action",
      playerId: fixtureValue(attacker).id,
      action: "block",
    });
    await run({
      type: "block",
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
    });
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
    expect(playerBoxOf(fixtureValue(defender))).toBe("ko");
  });
});
