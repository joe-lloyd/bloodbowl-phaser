import { newKick } from "../../src/game/kickoff/kickRecord";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { type Scenario } from "../../src/types/Scenario";

const LANDING = { x: 7, y: 3 };

async function charge(
  blocker: { x: number; y: number },
  target: { x: number; y: number },
  landing = LANDING
) {
  const scenario: Scenario = {
    id: "airborne-carrier",
    name: "Airborne carrier",
    description: "A Charge! Blitz under a kick still in the air",
    setup: {
      team1Placements: [{ playerIndex: 0, ...blocker }],
      team2Placements: [{ playerIndex: 0, ...target }],
      activeTeam: "team1",
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
  const game = new HeadlessGame({ scenario, seed: 3 });
  game.ctx.team1.rerolls = 0;
  game.ctx.team2.rerolls = 0;
  const attacker = game.ctx.team1.players[0];
  const defender = game.ctx.team2.players[0];
  await game.execute({
    type: "declare-action",
    playerId: fixtureValue(attacker).id,
    action: "blitz",
  });

  const state = game.ctx.gameService.getState();
  state.phase = GamePhase.KICKOFF;
  state.kick = newKick(game.ctx.team1.id, "coach");
  state.ballPosition = { ...landing };
  const ballEvents: string[] = [];

  for (const name of [
    GameEventNames.BallPlaced,
    GameEventNames.BallScattered,
    GameEventNames.BallThrownIn,
    GameEventNames.BallPickup,
  ] as const) {
    game.ctx.eventBus.on(name, () => {
      ballEvents.push(name);
    });
  }
  return { game, gs: game.ctx.gameService, attacker, defender, ballEvents };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("a kick still in the air during a Charge! Blitz", () => {
  it("stays over its landing square when the blocker under it follows up", async () => {
    const { gs, attacker, ballEvents } = await charge(LANDING, { x: 9, y: 3 });

    await gs.followUpPush(fixtureValue(attacker).id, { x: 8, y: 3 });
    await settle();

    expect(fixtureValue(attacker).gridPosition).toEqual({ x: 8, y: 3 });
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("stays put when the player under it is pushed away", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(
      { x: 6, y: 3 },
      LANDING
    );

    await gs.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "push",
        icon: "",
        label: "Push",
      }
    );
    await gs.executePush({
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      direction: { x: 8, y: 3 },
      resultType: "push",
      followUp: false,
    });
    await settle();

    expect(fixtureValue(defender).gridPosition).toEqual({ x: 8, y: 3 });
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("is not dropped when the player under it is knocked down", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(
      { x: 6, y: 3 },
      LANDING
    );

    await gs.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "pow",
        icon: "",
        label: "Pow",
      }
    );
    await gs.executePush({
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      direction: { x: 8, y: 3 },
      resultType: "pow",
      followUp: false,
    });
    await settle();

    expect(fixtureValue(defender).status).not.toBe(PlayerStatus.ACTIVE);
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("is not dropped when the blocker under it goes down on Both Down", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(LANDING, {
      x: 8,
      y: 3,
    });

    await gs.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "both-down",
        icon: "",
        label: "Both Down",
      }
    );
    await settle();

    expect(fixtureValue(attacker).status).not.toBe(PlayerStatus.ACTIVE);
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("is not thrown in when the player under it is pushed into the crowd", async () => {
    const sideline = { x: 7, y: 0 };
    const { gs, attacker, defender, ballEvents } = await charge(
      { x: 7, y: 1 },
      sideline,
      sideline
    );

    await gs.resolveBlock(
      fixtureValue(attacker).id,
      fixtureValue(defender).id,
      {
        type: "push",
        icon: "",
        label: "Push",
      }
    );
    await gs.executePush({
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      direction: { x: 7, y: -1 },
      resultType: "push",
      followUp: false,
    });
    await settle();

    expect(fixtureValue(defender).gridPosition).toBeFalsy();
    expect(gs.getState().ballPosition).toEqual(sideline);
    expect(ballEvents).toEqual([]);
  });
});
