import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJson } from "../../src/boundary/json";
import { gameSnapshotSchema } from "../../src/boundary/schemas/GameSnapshot";
import { SCENARIOS } from "../../src/data/scenarios";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { stateChecksum } from "../../src/headless/checksum";
import {
  deserializeGameState,
  serializeGameState,
} from "../../src/headless/serialization";
import { fixtureValue } from "../../src/testing/fixtureValue";

const MAIN_SNAPSHOT = "__tests__/fixtures/ballWire/one-ball-main.json";
const scrimmage = fixtureValue(SCENARIOS.find((s) => s.id === "basic-scrimmage"));

const scrimmageWithBall = (): HeadlessGame => {
  const game = new HeadlessGame({ scenario: scrimmage, seed: 77 });
  game.ctx.gameService.placeBall(0, { x: 7, y: 3 });
  return game;
};

const pretty = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe("the ball on the wire", () => {
  it("writes a one-ball snapshot byte for byte as main did, with main's checksum", () => {
    const game = scrimmageWithBall();
    expect(pretty(game.snapshot())).toBe(readFileSync(MAIN_SNAPSHOT, "utf8"));
    expect(stateChecksum(game)).toBe("c6cebc00");
  });

  it("restores a save written by main into one ball and writes it back unchanged", () => {
    const text = readFileSync(MAIN_SNAPSHOT, "utf8");
    const saved = parseJson(text, gameSnapshotSchema);
    const state = deserializeGameState(saved);
    expect(state.balls).toEqual([{ id: 0, at: { x: 7, y: 3 } }]);
    const game = scrimmageWithBall();
    const live = serializeGameState(game.ctx.gameService.getState(), game.ctx.teams);
    expect(pretty(serializeGameState(state, game.ctx.teams))).toBe(pretty(live));
  });

  it("round-trips two balls through extraBalls", () => {
    const game = scrimmageWithBall();
    const wire = {
      ...serializeGameState(game.ctx.gameService.getState(), game.ctx.teams),
      extraBalls: [{ x: 12, y: 8 }],
    };
    const state = deserializeGameState(
      parseJson(JSON.stringify(wire), gameSnapshotSchema)
    );
    expect(state.balls).toEqual([
      { id: 0, at: { x: 7, y: 3 } },
      { id: 1, at: { x: 12, y: 8 } },
    ]);
    const written = serializeGameState(state, game.ctx.teams);
    expect(written.ballPosition).toEqual({ x: 7, y: 3 });
    expect(written.extraBalls).toEqual([{ x: 12, y: 8 }]);
    expect(written).toEqual(wire);
  });
});
