import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { type Scenario } from "../../src/types/Scenario";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerCondition, addCondition } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { GameEventNames } from "../../src/types/events";

function scenario(skills: SkillType[] = []): Scenario {
  return {
    id: "declare-action-refusals",
    name: "declare-action-refusals",
    description: "Declarations the service refuses or releases",
    setup: {
      team1Placements: [
        { playerIndex: 0, x: 5, y: 5, skills },
        { playerIndex: 1, x: 5, y: 9 },
      ],
      team2Placements: [{ playerIndex: 0, x: 18, y: 5 }],
      ballPosition: { x: 1, y: 1 },
      activeTeam: "team1",
      turn: 1,
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    },
  };
}

function eventsDuring(game: HeadlessGame, run: () => unknown) {
  const before = game.events().length;
  const result = run();
  return { result, events: game.events().slice(before) };
}

async function declareAndStep(
  game: HeadlessGame,
  playerId: string,
  action: "move" | "blitz"
) {
  await game.execute({ type: "declare-action", playerId, action });
  const moved = await game.execute({
    type: "move",
    playerId,
    path: [{ x: 6, y: 5 }],
  });
  expect(moved.ok).toBe(true);
}

describe("declaring an Action", () => {
  it("refuses a switch to another Action once the player has moved", async () => {
    const game = new HeadlessGame({ scenario: scenario(), seed: 1 });
    const gs = game.ctx.gameService;
    const mover = fixtureValue(game.ctx.team1.players[0]).id;
    await declareAndStep(game, mover, "move");

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: mover, action: "block" })
    );

    expect(result).toBe(false);
    expect(events).toEqual([
      {
        name: GameEventNames.UI_Notification,
        data: "Cannot change the declared Action — movement already used.",
      },
    ]);
    expect(gs.getState().activePlayer).toMatchObject({
      id: mover,
      action: "move",
    });
  });

  it("keeps a committed Blitz when another player is declared", async () => {
    const game = new HeadlessGame({ scenario: scenario(), seed: 1 });
    const gs = game.ctx.gameService;
    const [blitzer, other] = game.ctx.team1.players.map((p) => p.id);
    await declareAndStep(game, fixtureValue(blitzer), "blitz");

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: fixtureValue(other), action: "move" })
    );

    expect(result).toBe(false);
    expect(events).toEqual([
      {
        name: GameEventNames.UI_Notification,
        data: "Cannot change the declared Action — movement already used.",
      },
    ]);
    expect(gs.getState().activePlayer).toMatchObject({
      id: blitzer,
      action: "blitz",
    });
  });

  it("releases an uncommitted Pass to another player", async () => {
    const game = new HeadlessGame({ scenario: scenario(), seed: 1 });
    const gs = game.ctx.gameService;
    const [passer, other] = game.ctx.team1.players.map((p) => p.id);
    await game.execute({
      type: "declare-action",
      playerId: passer,
      action: "pass",
    });

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: fixtureValue(other), action: "move" })
    );

    expect(result).toBe(true);
    expect(events).toEqual([
      { name: GameEventNames.UI_Notification, data: "Action Declared: MOVE" },
    ]);
    expect(gs.getState().activePlayer).toMatchObject({
      id: other,
      action: "move",
    });
    expect(gs.getState().turn.hasPassed).toBe(false);
  });

  it("refuses a Move for a Rooted player", () => {
    const game = new HeadlessGame({ scenario: scenario(), seed: 1 });
    const gs = game.ctx.gameService;
    const player = game.ctx.team1.players[0];
    addCondition(fixtureValue(player), PlayerCondition.ROOTED);

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: fixtureValue(player).id, action: "move" })
    );

    expect(result).toBe(false);
    expect(events).toEqual([
      {
        name: GameEventNames.UI_Notification,
        data: `${fixtureValue(player).playerName} is Rooted and cannot Move!`,
      },
    ]);
  });

  it("refuses a direct Stab after the player has moved", async () => {
    const game = new HeadlessGame({
      scenario: scenario([SkillType.STAB]),
      seed: 1,
    });
    const gs = game.ctx.gameService;
    const stabber = game.ctx.team1.players[0];
    await declareAndStep(game, fixtureValue(stabber).id, "move");

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: fixtureValue(stabber).id, action: "stab" })
    );

    expect(result).toBe(false);
    expect(events).toEqual([
      {
        name: GameEventNames.UI_Notification,
        data: `${fixtureValue(stabber).playerName} has already moved — Stab must be declared as Blitz (with Stab) before moving.`,
      },
    ]);
  });

  it("lets a Standing Fanatic declare Ball & Chain and nothing else", () => {
    const game = new HeadlessGame({
      scenario: scenario([SkillType.BALL_AND_CHAIN]),
      seed: 1,
    });
    const gs = game.ctx.gameService;
    const fanatic = fixtureValue(game.ctx.team1.players[0]).id;

    const refused = eventsDuring(game, () =>
      gs.declareAction({ playerId: fanatic, action: "move" })
    );
    expect(refused).toEqual({ result: false, events: [] });
    expect(
      gs.declareAction({ playerId: fanatic, action: "ballAndChain" })
    ).toBe(true);
  });

  it("clears Distracted, then Eye Gouged, before the declaration", () => {
    const game = new HeadlessGame({ scenario: scenario(), seed: 1 });
    const gs = game.ctx.gameService;
    const player = game.ctx.team1.players[0];
    addCondition(fixtureValue(player), PlayerCondition.DISTRACTED);
    addCondition(fixtureValue(player), PlayerCondition.EYE_GOUGED);

    const { result, events } = eventsDuring(game, () =>
      gs.declareAction({ playerId: fixtureValue(player).id, action: "move" })
    );

    expect(result).toBe(true);
    expect(events.map((e) => e.name)).toEqual([
      GameEventNames.PlayerStatusChanged,
      GameEventNames.PlayerStatusChanged,
      GameEventNames.UI_Notification,
    ]);
    expect(fixtureValue(events[2]).data).toBe("Action Declared: MOVE");
    expect(fixtureValue(player).conditions ?? []).toEqual([]);
  });
});
