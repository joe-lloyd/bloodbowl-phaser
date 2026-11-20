import { describe, expect, it } from "vitest";
import { GamePhase } from "../../src/types/GameState";
import { GameEventNames } from "../../src/types/events";
import {
  type Weather,
  weatherEffects,
  weatherTableRows,
} from "../../src/game/rules/weather";
import { catchModifier, pickUpModifier } from "../../src/game/kickoff/ballConditions";
import { getDriveEffects } from "../../src/game/kickoff/driveEffects";
import { heatwaveCasualties } from "../../src/game/kickoff/driveHazards";
import { forceDice } from "../utils/test-helpers";
import {
  BEACH,
  BEACH_SETUP,
  GUTTER_SETUP,
  GUTTER_SEWER,
  GUTTER_STREET,
  STREET,
  STREET_SETUP,
  playerOf,
  statusesOf,
  variantGame,
  variantKick,
} from "./variantKickoffs";

const playing = (format: typeof GUTTER_SEWER, weather: Weather) =>
  variantGame({ format, setup: GUTTER_SETUP, weather, phase: GamePhase.PLAY });

describe("Weather tables per game type", () => {
  it.each([
    ["sevens", ["Sweltering Heat", "Very Sunny", "Nice", "Pouring Rain", "Blizzard"]],
    ["street-bowl", ["Smog", "Wind", "Normal", "Rain", "Snow"]],
    ["beach-bowl", ["Sweltering Heat", "Very Sunny", "Nice", "Pouring Rain", "Tropical Storm"]],
    ["gutter-street", ["Clouds of Smog", "Howling Winds", "A Normal Day", "Sudden Downpour", "A Stormy Night"]],
    ["gutter-sewer", ["Unbearable Stench", "Spilt Sewage", "No More Disgusting Than Usual", "It's Getting Warm", "Underground Heatwave"]],
  ] as const)("%s rolls 2, 3, 4-10, 11 and 12 onto its own weather", (table, weathers) => {
    expect(weatherTableRows(table).map((row) => [row.from, row.to, row.weather])).toEqual([
      [2, 2, weathers[0]],
      [3, 3, weathers[1]],
      [4, 10, weathers[2]],
      [11, 11, weathers[3]],
      [12, 12, weathers[4]],
    ]);
  });

  it("SB-W2 Smog allows Quick passes only; SB-W3 Wind and GB-W3 Howling Winds take 1 off passing", () => {
    expect(weatherEffects("Smog").passTypes).toEqual(["Quick Pass"]);
    expect([weatherEffects("Wind").passingAbility, weatherEffects("Howling Winds").passingAbility]).toEqual([-1, -1]);
  });

  it("SB-W11 Rain and BB-W11 Pouring Rain hit catches and pick-ups; SB-W12 Snow and GB-W2 Clouds of Smog cut passes", () => {
    expect([weatherEffects("Rain").ballHandling, weatherEffects("Pouring Rain").ballHandling]).toEqual([-1, -1]);
    expect(weatherEffects("Snow")).toMatchObject({ rush: -1, passTypes: ["Quick Pass", "Short Pass"] });
    expect(weatherEffects("Clouds of Smog").passTypes).toEqual(["Quick Pass", "Short Pass"]);
  });

  it("GB-W11 Sudden Downpour takes 1 off Rush and pick-ups; It's Getting Warm off pick-ups and catches; GB-W3 Spilt Sewage 2 off Rush", () => {
    const downpour = playing(GUTTER_STREET, "Sudden Downpour").ctx.gameService.getState();
    const warm = playing(GUTTER_SEWER, "It's Getting Warm").ctx.gameService.getState();

    expect([weatherEffects("Sudden Downpour").rush, pickUpModifier(downpour), catchModifier(downpour)]).toEqual([-1, -1, 0]);
    expect([pickUpModifier(warm), catchModifier(warm), weatherEffects("It's Getting Warm").ballHandling]).toEqual([-1, -1, 0]);
    expect(weatherEffects("Spilt Sewage").rush).toBe(-2);
  });

  it("BB-W12 Tropical Storm turns every kick-off into a touchback", async () => {
    const { response } = await variantKick({ format: BEACH, setup: BEACH_SETUP, dice: [4, 6], weather: "Tropical Storm" });

    expect(response.events.find((event) => event.name === GameEventNames.KickoffBallLanding)?.data).toEqual({
      landingSquare: null,
      isTouchback: true,
    });
  });

  it("a Street Bowl match on Normal plays its kick-off like any other", async () => {
    const { response } = await variantKick({ format: STREET, setup: STREET_SETUP, dice: [4, 5], weather: "Normal" });

    expect(response.events.find((event) => event.name === GameEventNames.KickoffBallLanding)?.data).toEqual({
      landingSquare: { x: 20, y: 3 },
      isTouchback: false,
    });
  });

  it("GB-W2 Unbearable Stench lays a random standing player Prone at the end of a turn", async () => {
    const game = playing(GUTTER_SEWER, "Unbearable Stench");
    forceDice(game.ctx.rng, [1]);

    await game.execute({ type: "end-turn" });

    expect(statusesOf(game, "team1")[0]).toBe("Prone");
    expect([...statusesOf(game, "team1").slice(1), ...statusesOf(game, "team2")]).not.toContain("Prone");
  });

  it("GB-W12 A Stormy Night knocks a random player over on a 1 and leaves them be otherwise", async () => {
    const stormy = playing(GUTTER_STREET, "A Stormy Night");
    const calm = playing(GUTTER_STREET, "A Stormy Night");
    forceDice(stormy.ctx.rng, [1, 1, 1, 1]);
    forceDice(calm.ctx.rng, [2]);

    await stormy.execute({ type: "end-turn" });
    await calm.execute({ type: "end-turn" });

    expect(statusesOf(stormy, "team1")[0]).toBe("Prone");
    expect(statusesOf(calm, "team1")).not.toContain("Prone");
  });

  it("GB-W12 Underground Heatwave keeps out every player who rolls a 1 at the end of a drive", () => {
    const game = playing(GUTTER_SEWER, "Underground Heatwave");
    const players = [playerOf(game, "team1", 0), playerOf(game, "team1", 1), playerOf(game, "team2", 0)];
    forceDice(game.ctx.rng, [1, 4, 1]);

    expect(heatwaveCasualties(players, game.ctx.gameService.getDiceController()).map((player) => player.id)).toEqual([
      "team1-player-1",
      "team2-player-1",
    ]);
  });
});

describe("GB-KW12 Swarm of Rats", () => {
  it("knocks over a player who ends an activation by the wall on a 1", async () => {
    const game = playing(GUTTER_SEWER, "No More Disgusting Than Usual");
    getDriveEffects(game.ctx.gameService.getState()).conditions = ["swarm-of-rats"];
    const runner = playerOf(game, "team1", 3);
    forceDice(game.ctx.rng, [1, 1, 1]);

    await game.execute({ type: "declare-action", playerId: runner.id, action: "move" });
    await game.execute({ type: "move", playerId: runner.id, path: [{ x: 10, y: 1 }, { x: 10, y: 0 }] });
    await game.execute({ type: "end-activation", playerId: runner.id });

    expect(runner).toMatchObject({ gridPosition: { x: 10, y: 0 }, status: "Prone" });
  });
});
