import { seatTeams } from "../../../src/game/seating";
import { activeLayout } from "../../../src/game/variants/activeMatch";
import { newKick } from "../../../src/game/kickoff/kickRecord";
import { describe, expect, it } from "vitest";
import { DiceController } from "../../../src/game/controllers/DiceController";
import { BallManager } from "../../../src/game/managers/BallManager";
import { WeatherManager } from "../../../src/game/managers/WeatherManager";
import { DiceWatch } from "../../../src/game/presentation/diceWatch";
import { HeadlessGame } from "../../../src/headless/HeadlessGame";
import { EventBus } from "../../../src/services/EventBus";
import { RNGService } from "../../../src/services/rng/RNGService";
import { GameEventNames } from "../../../src/types/events";

const GUARD_MS = 5000;

function scatteredKick(from: { x: number; y: number }, seed: number) {
  const { teams, gameService } = new HeadlessGame({ seed: 1 }).ctx;
  const [team1, team2] = teams;
  const state = gameService.getState();
  state.ballPosition = from;
  const bus = new EventBus();
  const dice = new DiceController(bus, new RNGService(seed));
  DiceWatch.shared(bus);
  const tray = (landedThrough: number) => {
    bus.emit(GameEventNames.UI_DiceInAir, {
      count: 3 - landedThrough,
      thrown: 3,
      landedThrough,
    });
  };
  const seen: string[] = [];
  bus.on(GameEventNames.BallScattered, () => {
    seen.push("scattered");
    tray(0);
  });
  bus.on(GameEventNames.KickoffBallLanding, ({ isTouchback }) => {
    seen.push(isTouchback ? "touchback" : "falls");
  });
  const manager = new BallManager(
    bus,
    state,
    seatTeams([team1, team2], activeLayout()),
    new WeatherManager(bus, state, dice),
    dice,
    {
      onTurnover: () => undefined,
      onPhaseChange: () => undefined,
      onBallPlaced: () => undefined,
    },
    (ms) =>
      ms > GUARD_MS || seen.length > 1
        ? new Promise<void>(() => undefined)
        : Promise.resolve()
  );
  state.kick = { ...newKick(team1.id, "scatter"), scatter: 3 };
  void manager.resumeKick();
  return { seen, tray };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("a kick the weather scatters", () => {
  it.each([
    { ending: "falls", from: { x: 15, y: 5 }, seed: 1 },
    { ending: "touchback", from: { x: 19, y: 0 }, seed: 2 },
  ])("$ending only after its scatter dice have landed", async (kick) => {
    const { seen, tray } = scatteredKick(kick.from, kick.seed);
    await settle();
    expect(seen).toEqual(["scattered"]);

    tray(3);
    await settle();
    expect(seen).toEqual(["scattered", kick.ending]);
  });
});
