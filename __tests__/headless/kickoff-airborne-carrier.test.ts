/**
 * Nobody holds a kick that is still in the air. While the Kick-off Event
 * runs (a Charge! Blitz), the ball hangs over its landing square: a player
 * standing under it does not carry it on a follow-up or a push, and does
 * not drop it when knocked down or pushed into the crowd. It lands where
 * it was kicked, and whoever stands there then Catches it.
 *
 * Review on #201: following up off the landing square carried the kick to
 * the follow-up square, changing where it would land.
 */
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { GameEventNames } from "../../src/types/events";
import { Scenario } from "../../src/types/Scenario";

const LANDING = { x: 7, y: 3 };

/** A blocker and a target, then the kick put in the air over `landing`. */
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
    playerId: attacker.id,
    action: "blitz",
  });
  // The kick has deviated and is still in the air while Charge! runs
  const state = game.ctx.gameService.getState();
  state.phase = GamePhase.KICKOFF;
  state.kickoffKickResolved = { isTeam1Kicking: true };
  state.ballPosition = { ...landing };
  const ballEvents: string[] = [];
  // Anything that moves, bounces, throws in or hands over the ball
  for (const name of [
    GameEventNames.BallPlaced,
    GameEventNames.BallScattered,
    GameEventNames.BallThrownIn,
    GameEventNames.BallPickup,
  ] as const) {
    game.ctx.eventBus.on(name, () => ballEvents.push(name));
  }
  return { game, gs: game.ctx.gameService, attacker, defender, ballEvents };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("a kick still in the air during a Charge! Blitz", () => {
  it("stays over its landing square when the blocker under it follows up", async () => {
    const { gs, attacker, ballEvents } = await charge(LANDING, { x: 9, y: 3 });

    await gs.followUpPush(attacker.id, { x: 8, y: 3 });
    await settle();

    expect(attacker.gridPosition).toEqual({ x: 8, y: 3 });
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("stays put when the player under it is pushed away", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(
      { x: 6, y: 3 },
      LANDING
    );

    await gs.resolveBlock(attacker.id, defender.id, {
      type: "push",
      icon: "",
      label: "Push",
    });
    await gs.executePush(
      attacker.id,
      defender.id,
      { x: 8, y: 3 },
      "push",
      false
    );
    await settle();

    expect(defender.gridPosition).toEqual({ x: 8, y: 3 });
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("is not dropped when the player under it is knocked down", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(
      { x: 6, y: 3 },
      LANDING
    );

    await gs.resolveBlock(attacker.id, defender.id, {
      type: "pow",
      icon: "",
      label: "Pow",
    });
    await gs.executePush(
      attacker.id,
      defender.id,
      { x: 8, y: 3 },
      "pow",
      false
    );
    await settle();

    expect(defender.status).not.toBe(PlayerStatus.ACTIVE);
    expect(gs.getState().ballPosition).toEqual(LANDING);
    expect(ballEvents).toEqual([]);
  });

  it("is not dropped when the blocker under it goes down on Both Down", async () => {
    const { gs, attacker, defender, ballEvents } = await charge(LANDING, {
      x: 8,
      y: 3,
    });

    await gs.resolveBlock(attacker.id, defender.id, {
      type: "both-down",
      icon: "",
      label: "Both Down",
    });
    await settle();

    expect(attacker.status).not.toBe(PlayerStatus.ACTIVE);
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

    await gs.resolveBlock(attacker.id, defender.id, {
      type: "push",
      icon: "",
      label: "Push",
    });
    await gs.executePush(
      attacker.id,
      defender.id,
      { x: 7, y: -1 },
      "push",
      false
    );
    await settle();

    expect(defender.gridPosition).toBeFalsy();
    expect(gs.getState().ballPosition).toEqual(sideline);
    expect(ballEvents).toEqual([]);
  });
});
