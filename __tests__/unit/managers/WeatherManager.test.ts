import { describe, it, expect, beforeEach, vi } from "vitest";
import { WeatherManager } from "../../../src/game/managers/WeatherManager";
import { GameEventNames } from "../../../src/types/events";
import { GameState, GamePhase } from "../../../src/types/GameState";

describe("WeatherManager", () => {
  let manager: WeatherManager;
  let mockEventBus: any;
  let mockState: GameState;
  let mockDiceController: any;

  beforeEach(() => {
    mockEventBus = { emit: vi.fn() };
    mockState = {
      weather: undefined,
      phase: GamePhase.SETUP,
    } as GameState;
    mockDiceController = {
      roll2D6: vi.fn().mockReturnValue(7),
    };
    manager = new WeatherManager(mockEventBus, mockState, mockDiceController);
  });

  describe("Roll Weather", () => {
    it("should roll 2d6 for weather via DiceController", () => {
      manager.rollWeather();

      expect(mockDiceController.roll2D6).toHaveBeenCalledWith("Weather");
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
