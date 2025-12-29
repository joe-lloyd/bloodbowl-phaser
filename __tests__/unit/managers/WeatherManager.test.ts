import { describe, it, expect, beforeEach, vi } from "vitest";
import { WeatherManager } from "../../../src/game/managers/WeatherManager";
import { GameEventNames } from "../../../src/types/events";
import { GameState, GamePhase } from "../../../src/types/GameState";

describe("WeatherManager", () => {
  let manager: WeatherManager;
  let mockEventBus: any;
  let mockState: GameState;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    mockState = {
      weather: undefined,
      phase: GamePhase.SETUP,
    } as GameState;
    manager = new WeatherManager(mockEventBus, mockState);
  });

  describe("Roll Weather", () => {
    it("should roll 2d6 for weather", () => {
      manager.rollWeather();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.DiceRoll,
        expect.objectContaining({
          rollType: "Weather",
          diceType: "2d6",
        })
      );
    });

    it("should emit WeatherChanged event", () => {
      manager.rollWeather();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.WeatherChanged,
        expect.any(String)
      );
    });

    it("should set weather state", () => {
      manager.rollWeather();

      const weather = manager.getWeather();
      expect(weather).toBeDefined();
      expect(typeof weather).toBe("string");
    });
  });

  describe("Get Current Weather", () => {
    it("should return current weather", () => {
      manager.rollWeather();
      const weather = manager.getWeather();

      expect(weather).toBeDefined();
    });
  });
});
