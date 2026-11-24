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

describe("a kick the weather scatters", () => {
  it("falls only after its scatter dice have landed", async () => {
    const { team1, team2, gameService } = new HeadlessGame({ seed: 1 }).ctx;
    const state = gameService.getState();
    state.ballPosition = { x: 15, y: 5 };
    const bus = new EventBus();
    const dice = new DiceController(bus, new RNGService(1));
    DiceWatch.shared(bus);
    const tray = (landedThrough: number) => {
      bus.emit(GameEventNames.UI_DiceInAir, {
        count: 3 - landedThrough,
        thrown: 3,
        landedThrough,
      });
    };
    const seen: string[] = [];
    bus.on(GameEventNames.KickoffAirbornePositionChanged, () => {
      seen.push("moved");
      tray(0);
    });
    bus.on(GameEventNames.KickoffBallLanding, () => {
      seen.push("falls");
    });
    const manager = new BallManager(
      bus,
      state,
      team1,
      team2,
      new WeatherManager(bus, state, dice),
      dice,
      {
        onTurnover: () => undefined,
        onPhaseChange: () => undefined,
        onBallPlaced: () => undefined,
        resolveKickoffEvent: () => Promise.resolve(),
        consumeWeatherScatterPending: () => 3,
      },
      (ms) =>
        ms > GUARD_MS || seen.includes("falls")
          ? new Promise<void>(() => undefined)
          : Promise.resolve()
    );

    void manager.rollKickoff();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual(["moved"]);

    tray(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual(["moved", "falls"]);
  });
});
