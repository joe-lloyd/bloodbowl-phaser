import { IEventBus } from "../../services/EventBus";
import { GameState } from "@/types/GameState";
import { GameEventNames } from "../../types/events";
import { DiceController } from "../controllers/DiceController";

/** Plain rulebook statement of what each weather result does (for the match log). */
const WEATHER_EFFECT: Record<string, string> = {
  "Sweltering Heat":
    "After this drive, roll a D6 for each player who was on the pitch: on a 1 the player collapses from heat exhaustion and misses the rest of the match.",
  "Very Sunny": "The glare gives passers a -1 penalty to Passing rolls.",
  Nice: "Perfect conditions — no effect on play.",
  "Pouring Rain":
    "The pitch is slick — Pick Up, Catch and Interception rolls all take a -1 penalty.",
  Blizzard:
    "Freezing and near-blind — only Quick and Short passes may be attempted, and Rushing takes a -1 penalty.",
};

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

    this.eventBus.emit(GameEventNames.UI_LogEntry, {
      category: "weather",
      headline: weather,
      detail: WEATHER_EFFECT[weather],
      roll,
    });
    this.eventBus.emit(GameEventNames.WeatherChanged, weather);

    return weather;
  }

  public getWeather(): string {
    return this.state.weather || "Nice";
  }
}
