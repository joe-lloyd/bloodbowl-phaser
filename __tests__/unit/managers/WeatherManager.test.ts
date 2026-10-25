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

    it("should record the roll, the named condition and its effect in the match log", () => {
      manager.rollWeather();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.UI_LogEntry,
        expect.objectContaining({
          category: "weather",
          headline: expect.any(String),
          detail: expect.any(String),
          roll: 7,
        })
      );
    });

    it("states the Sweltering Heat rule as the rulebook gives it", () => {
      mockDiceController.roll2D6.mockReturnValue(2);
      manager.rollWeather();

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        GameEventNames.UI_LogEntry,
        expect.objectContaining({
          headline: "Sweltering Heat",
          detail:
            "At the end of each drive, roll a D3: each coach picks that many of their players on the pitch at random, and they miss the next drive in the Reserves.",
        })
      );
    });

    it("should never fall back to a bare notification toast", () => {
      manager.rollWeather();

      expect(mockEventBus.emit).not.toHaveBeenCalledWith(
        GameEventNames.UI_Notification,
        expect.anything()
      );
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
