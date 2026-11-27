import { z } from "zod";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, it, expect } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import type { ActionType } from "../../src/types/events";
import type {
  CommandResponse,
  EmittedEvent,
} from "../../src/headless/protocol";
import { Inducement } from "../../src/types/Inducements";
import { forceDice } from "../utils/test-helpers";
import { bought, commit } from "../utils/inducement-helpers";

const scenario: Scenario = {
  id: "pile-driver",
  name: "Pile Driver",
  description: "",
  setup: {
    team1Placements: [
      { playerIndex: 0, x: 10, y: 5, skills: [SkillType.PILE_DRIVER] },

      { playerIndex: 1, x: 2, y: 12 },
    ],
    team2Placements: [{ playerIndex: 0, x: 11, y: 5 }],
    activeTeam: "team1",
    phase: GamePhase.PLAY,
    subPhase: SubPhase.TURN_RECEIVING,
    ballPosition: { x: 1, y: 1 },
  },
};

const POW_SEED = 3;

async function knockDownAndFollowUp(
  action: ActionType,
  setup: Scenario = scenario
) {
  const game = new HeadlessGame({ scenario: setup, seed: POW_SEED });
  const events: EmittedEvent[] = [];
  const run = async (command: unknown): Promise<CommandResponse> => {
    const response = await game.execute(command);
    events.push(...response.events);
    return response;
  };
  const attacker = game.ctx.teams[0].players[0];
  const defender = game.ctx.teams[1].players[0];
  await run({
    type: "declare-action",
    playerId: fixtureValue(attacker).id,
    action,
  });
  await run({
    type: "block",
    attackerId: fixtureValue(attacker).id,
    defenderId: fixtureValue(defender).id,
  });
  await run({ type: "choose-block-result", index: 0 });
  await run({ type: "choose-push-direction", x: 12, y: 5 });
  const offer = await run({ type: "choose-follow-up", followUp: true });
  const dice = () =>
    events
      .filter((e) => e.name === "diceRoll")
      .map(
        (e) => z.object({ description: z.string() }).parse(e.data).description
      );
  return { game, run, dice, offer, attacker, defender };
}

const BLOCK_DICE = [
  "Rolled 1 block dice: pow",
  "Armour Roll (Human Lineman #1): 1 + 3 = 4",
];

describe("Pile Driver", () => {
  for (const action of ["block", "blitz"] as const) {
    it(`is offered after a ${action} knocks the target down`, async () => {
      const { offer, attacker } = await knockDownAndFollowUp(action);

      expect(offer.pendingDecision).toMatchObject({
        type: "reaction",
        playerId: fixtureValue(attacker).id,
        chooserTeamId: "team1",
        skill: SkillType.PILE_DRIVER,
      });
    });

    it(`fouls and lies the player down when accepted on a ${action}`, async () => {
      const { run, dice, attacker, defender } =
        await knockDownAndFollowUp(action);

      const response = await run({ type: "use-reaction", accept: true });

      expect(dice()).toEqual([
        ...BLOCK_DICE,
        "Foul Armour Roll (Human Lineman #1): 1 + 5 = 6 (AV 9+)",
      ]);
      expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
      expect(fixtureValue(defender).status).toBe(PlayerStatus.PRONE);
      expect(response.snapshot.activePlayer).toBeNull();
    });
  }

  it("ends a declined Block's activation with the player on their feet", async () => {
    const { run, dice, attacker } = await knockDownAndFollowUp("block");

    const response = await run({ type: "use-reaction", accept: false });

    expect(dice()).toEqual(BLOCK_DICE);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activePlayer).toBeNull();
  });

  it("drops the ball and turns the ball over when the carrier lies down", async () => {
    const carrying: Scenario = {
      ...scenario,
      setup: { ...scenario.setup, ballPosition: { x: 10, y: 5 } },
    };
    const { run, attacker } = await knockDownAndFollowUp("block", carrying);

    const response = await run({ type: "use-reaction", accept: true });

    expect(fixtureValue(attacker).status).toBe(PlayerStatus.PRONE);
    expect(response.events.some((e) => e.name === "turnover")).toBe(true);
    expect(response.snapshot.ballPosition).not.toEqual(
      fixtureValue(attacker).gridPosition
    );
  });

  it("starts the next drive when the dropped ball is caught for a touchdown", async () => {
    const scoring: Scenario = {
      ...scenario,
      setup: {
        ...scenario.setup,
        team1Placements: [
          { playerIndex: 0, x: 17, y: 5, skills: [SkillType.PILE_DRIVER] },
          { playerIndex: 1, x: 19, y: 4 },
          { playerIndex: 2, x: 19, y: 6 },
          { playerIndex: 3, x: 2, y: 2 },
        ],
        team2Placements: [{ playerIndex: 0, x: 18, y: 5 }],
        ballPosition: { x: 17, y: 5 },
      },
    };

    const game = new HeadlessGame({ scenario: scoring, seed: 3 });

    forceDice(game.ctx.rng, [6]);
    await commit(game, [
      bought(game.ctx.teams[0].id, Inducement.DESPERATE_MEASURES, 1),
    ]);
    const attacker = game.ctx.teams[0].players[0];
    const defender = game.ctx.teams[1].players[0];
    const events: EmittedEvent[] = [];
    let response: CommandResponse | undefined;
    for (const command of [
      {
        type: "declare-action",
        playerId: fixtureValue(attacker).id,
        action: "block",
      },
      {
        type: "block",
        attackerId: fixtureValue(attacker).id,
        defenderId: fixtureValue(defender).id,
      },
      { type: "choose-block-result", index: 0 },
      { type: "choose-push-direction", x: 19, y: 5 },
      { type: "choose-follow-up", followUp: true },
      { type: "use-reaction", accept: true },

      { type: "choose-foul-assists", count: 2 },
    ]) {
      response = await game.execute(command);
      events.push(...response.events);
    }

    expect(events.some((e) => e.name === "touchdown")).toBe(true);
    expect(fixtureValue(response).snapshot).toMatchObject({
      phase: GamePhase.SETUP,
      subPhase: SubPhase.SETUP_KICKING,
      activeTeamId: "team1",
    });
    expect(fixtureValue(response).pendingDecision).toBeNull();
  });

  it("lets a declined Blitz keep moving", async () => {
    const { run, dice, attacker } = await knockDownAndFollowUp("blitz");

    const response = await run({ type: "use-reaction", accept: false });

    expect(dice()).toEqual(BLOCK_DICE);
    expect(fixtureValue(attacker).status).toBe(PlayerStatus.ACTIVE);
    expect(response.snapshot.activePlayer).toMatchObject({
      id: fixtureValue(attacker).id,
      action: "blitz",
    });
  });
});
