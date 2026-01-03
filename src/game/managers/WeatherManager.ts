import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { GameEventNames } from "../../types/events";
import { DiceController } from "../controllers/DiceController";

export class WeatherManager {
  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private diceController: DiceController
  ) {}

  public rollWeather(): string {
    const roll = this.diceController.roll2D6("Weather");
    let weather = "Nice";

    switch (roll) {
      case 2:
        weather = "Sweltering Heat";
        break;
      case 3:
        weather = "Very Sunny";
        break;
      case 11:
        weather = "Pouring Rain";
        break;
      case 12:
        weather = "Blizzard";
        break;
      default:
        weather = "Nice";
        break;
    }

    this.state.weather = weather;

    this.eventBus.emit(
      GameEventNames.UI_Notification,
      `Weather Result: ${weather}`
    );
    this.eventBus.emit(GameEventNames.WeatherChanged, weather);

    return weather;
  }

  public getWeather(): string {
    return this.state.weather || "Nice";
  }
}
