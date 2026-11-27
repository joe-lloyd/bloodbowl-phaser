import { fixtureValue } from "../../src/testing/fixtureValue";
import { describe, expect, it, vi } from "vitest";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import { PlayerStatus } from "../../src/types/Player";
import { SkillType } from "../../src/types/Skills";
import { type PlayerPlacement } from "../../src/types/Scenario";
import { forceDice } from "../utils/test-helpers";

function foulGame(
  assisters: Omit<PlayerPlacement, "playerIndex">[],
  defenders: Omit<PlayerPlacement, "playerIndex">[] = []
) {
  const game = new HeadlessGame({
    seed: 1,
    scenario: {
      id: "foul-assists",
      name: "foul-assists",
      description: "",
      setup: {
        team1Placements: [
          { playerIndex: 0, x: 10, y: 5, skills: [SkillType.SNEAKY_GIT] },
          ...assisters.map((p, i) => ({ playerIndex: i + 1, ...p })),
        ],
        team2Placements: [
          {
            playerIndex: 0,
            x: 11,
            y: 5,
            status: PlayerStatus.PRONE,
            stats: { AV: 10 },
          },
          ...defenders.map((p, i) => ({ playerIndex: i + 1, ...p })),
        ],
        activeTeam: "team1",
        phase: GamePhase.PLAY,
        subPhase: SubPhase.TURN_RECEIVING,
        ballPosition: { x: 1, y: 1 },
      },
    },
  });
  const fouler = game.ctx.teams[0].players[0];
  const target = game.ctx.teams[1].players[0];
  const armourRolls: string[] = [];
  game.ctx.eventBus.on(GameEventNames.DiceRoll, ({ rollType, description }) => {
    if (rollType.startsWith("Foul Armour Roll")) armourRolls.push(description);
  });

  vi.spyOn(game.ctx.rng, "rollDie").mockReturnValue(1);
  const startFoul = async () => {
    await game.execute({
      type: "declare-action",
      playerId: fixtureValue(fouler).id,
      action: "foul",
    });
    return game.execute({
      type: "foul",
      playerId: fixtureValue(fouler).id,
      x: 11,
      y: 5,
    });
  };
  return { game, fouler, target, armourRolls, startFoul };
}

const twoAssists = [
  { x: 11, y: 4 },
  { x: 11, y: 6 },
];

describe("a Foul's Offensive Assists are the fouling coach's choice", () => {
  it("asks how many Offensive Assists to add before the Armour Roll", async () => {
    const { fouler, target, armourRolls, startFoul } = foulGame(twoAssists);

    const response = await startFoul();

    expect(response.ok).toBe(true);
    expect(response.pendingDecision).toEqual({
      type: "foul-assists",
      playerId: fixtureValue(fouler).id,
      targetId: fixtureValue(target).id,
      chooserTeamId: fixtureValue(fouler).teamId,
      available: 2,
      defensive: 0,
    });
    expect(armourRolls).toEqual([]);
  });

  it("keeps a Sneaky Git fouler on when no assists are added and a double holds", async () => {
    const { game, fouler, target, armourRolls, startFoul } =
      foulGame(twoAssists);
    forceDice(game.ctx.rng, [4, 4]);
    await startFoul();

    const reply = await game.execute({ type: "choose-foul-assists", count: 0 });

    expect(reply.ok).toBe(true);
    expect(armourRolls).toEqual([
      `Foul Armour Roll (${fixtureValue(target).playerName}): 4 + 4 = 8 (AV 10+)`,
    ]);
    expect(fixtureValue(target).status).toBe(PlayerStatus.PRONE);
    expect(fixtureValue(fouler).status).toBe(PlayerStatus.ACTIVE);
    expect(fixtureValue(fouler).gridPosition).toEqual({ x: 10, y: 5 });
  });

  it("adds every assist chosen, and a broken double Sends-off the fouler", async () => {
    const { game, fouler, target, armourRolls, startFoul } =
      foulGame(twoAssists);

    forceDice(game.ctx.rng, [4, 4, 1, 2]);
    await startFoul();

    await game.execute({ type: "choose-foul-assists", count: 2 });

    expect(armourRolls).toEqual([
      `Foul Armour Roll (${fixtureValue(target).playerName}): 4 + 4 +2 = 10 (AV 10+)`,
    ]);
    expect(fixtureValue(target).status).toBe(PlayerStatus.STUNNED);
    expect(fixtureValue(fouler).gridPosition).toBeUndefined();
  });

  it("applies one of two assists when the coach adds one", async () => {
    const { game, target, armourRolls, startFoul } = foulGame(twoAssists);
    forceDice(game.ctx.rng, [5, 3]);
    await startFoul();

    await game.execute({ type: "choose-foul-assists", count: 1 });

    expect(armourRolls).toEqual([
      `Foul Armour Roll (${fixtureValue(target).playerName}): 5 + 3 +1 = 9 (AV 10+)`,
    ]);
  });

  it("always applies Defensive Assists, whatever the coach adds", async () => {
    const { game, target, armourRolls, startFoul } = foulGame(
      [{ x: 11, y: 4 }],
      [{ x: 9, y: 6 }]
    );
    forceDice(game.ctx.rng, [5, 3]);
    const response = await startFoul();
    expect(response.pendingDecision).toMatchObject({
      type: "foul-assists",
      available: 1,
      defensive: 1,
    });

    await game.execute({ type: "choose-foul-assists", count: 0 });

    expect(armourRolls).toEqual([
      `Foul Armour Roll (${fixtureValue(target).playerName}): 5 + 3 -1 = 7 (AV 10+)`,
    ]);
  });

  it("rejects a count above the assists available", async () => {
    const { game, startFoul } = foulGame(twoAssists);
    await startFoul();

    const reply = await game.execute({ type: "choose-foul-assists", count: 3 });

    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe("command-failed: invalid-foul-assists");
    expect(reply.pendingDecision).toMatchObject({ type: "foul-assists" });
  });

  it("asks nothing when no team-mate can assist", async () => {
    const { game, target, armourRolls, startFoul } = foulGame([]);
    forceDice(game.ctx.rng, [5, 3]);

    const response = await startFoul();

    expect(response.pendingDecision).toBeNull();
    expect(armourRolls).toEqual([
      `Foul Armour Roll (${fixtureValue(target).playerName}): 5 + 3 = 8 (AV 10+)`,
    ]);
  });
});
