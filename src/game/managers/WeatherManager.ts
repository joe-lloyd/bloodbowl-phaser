import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { GameEventNames } from "../../types/events";

export class WeatherManager {
  constructor(
    private eventBus: IEventBus,
    private state: GameState
  ) {}

  public rollWeather(): string {
    const d6 = () => Math.floor(Math.random() * 6) + 1;
    const d1 = d6();
    const d2 = d6();
    const roll = d1 + d2;
    let weather = "Nice";

    switch (roll) {
      case 2:
        weather = "Sweltering Heat";
        break;
      case 3:
        weather = "Very Sunny";
        break;
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        weather = "Nice";
        break;
      case 11:
        weather = "Pouring Rain";
        break;
      case 12:
        weather = "Blizzard";
        break;
    }

    this.state.weather = weather;

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Weather",
      diceType: "2d6",
      value: [d1, d2],
      total: roll,
      description: `Weather Result: ${weather}`,
      passed: true,
    });

    this.eventBus.emit(GameEventNames.WeatherChanged, weather);
    return weather;
  }

  public getWeather(): string {
    return this.state.weather || "Nice";
  }
}
