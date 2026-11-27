import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";

function scenario(chained: SkillType): Scenario {
  return {
    id: `chain-push-${chained}`,
    name: `Chain push into ${chained}`,
    description: "",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 9, y: 5 },
        { playerIndex: 1, x: 2, y: 12 },
      ],
      team2Placements: [
        { playerIndex: 0, x: 10, y: 5 },
        { playerIndex: 1, x: 11, y: 4 },
        { playerIndex: 2, x: 11, y: 5, skills: [chained] },
        { playerIndex: 3, x: 11, y: 6 },
      ],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
      ballPosition: { x: 1, y: 1 },
    },
  };
}

const PUSH_SEED = 1;

const POW_SEED = 2;

async function chainInto(chained: SkillType, seed: number) {
  const game = new HeadlessGame({ scenario: scenario(chained), seed });
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const attacker = game.ctx.teams[0].players[0];
  const defender = game.ctx.teams[1].players[0];
  const chainedPlayer = game.ctx.teams[1].players[2];
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
  const reaction = await run({ type: "choose-push-direction", x: 11, y: 5 });
  const dice = () =>
    events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
  return { game, run, dice, reaction, attacker, defender, chainedPlayer };
}

describe("a chain-pushed Stand Firm player", () => {
  it("may refuse, and then nobody in the chain moves", async () => {
    const { run, dice, reaction, attacker, defender, chainedPlayer } =
      await chainInto(SkillType.STAND_FIRM, PUSH_SEED);
    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(chainedPlayer).id,
      skill: SkillType.STAND_FIRM,
    });

    const response = await run({ type: "use-reaction", accept: true });

    expect(dice()).toEqual(["Rolled 1 block dice: push"]);
    expect(response.pendingDecision).toBeNull();
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(chainedPlayer).gridPosition).toEqual({ x: 11, y: 5 });
    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 9, y: 5 });
    expect(response.snapshot.activePlayer).toBeNull();
  });

  it("still lets a POW knock the defender down in place", async () => {
    const { run, dice, defender, chainedPlayer } = await chainInto(
      SkillType.STAND_FIRM,
      POW_SEED
    );

    await run({ type: "use-reaction", accept: true });

    expect(dice()).toEqual([
      "Rolled 1 block dice: pow",
      "Armour Roll (Human Lineman #1): 2 + 2 = 4",
    ]);
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 10, y: 5 });
    expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(chainedPlayer).gridPosition).toEqual({ x: 11, y: 5 });
  });

  it("is pushed as normal when they decline", async () => {
    const { run, defender, chainedPlayer } = await chainInto(
      SkillType.STAND_FIRM,
      PUSH_SEED
    );

    const response = await run({ type: "use-reaction", accept: false });

    expect(response.pendingDecision).toMatchObject({
      type: "push-direction",
      defenderId: fixtureValue(chainedPlayer).id,
      chooserTeamId: "team1",
    });
    expect(fixtureValue(defender).gridPosition).toEqual({ x: 10, y: 5 });
  });
});

describe("a chain-pushed Sidestep player", () => {
  it("lets their own coach pick any open adjacent square", async () => {
    const { run, reaction, chainedPlayer } = await chainInto(
      SkillType.SIDESTEP,
      PUSH_SEED
    );
    expect(reaction.pendingDecision).toMatchObject({
      type: "reaction",
      playerId: fixtureValue(chainedPlayer).id,
      skill: SkillType.SIDESTEP,
    });

    const response = await run({ type: "use-reaction", accept: true });

    expect(response.pendingDecision).toMatchObject({
      type: "push-direction",
      defenderId: fixtureValue(chainedPlayer).id,
      chooserTeamId: "team2",
    });
    const options = z
      .object({ options: z.object({ x: z.number(), y: z.number() }).array() })
      .parse(response.pendingDecision).options;
    expect(options).toHaveLength(5);
    expect(options).toEqual(
      expect.arrayContaining([
        { x: 10, y: 4 },
        { x: 10, y: 6 },
        { x: 12, y: 4 },
        { x: 12, y: 5 },
        { x: 12, y: 6 },
      ])
    );
  });
});
