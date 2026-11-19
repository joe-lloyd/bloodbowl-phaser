import { type IEventBus } from "../../services/EventBus";
import { type GameState } from "@/types/GameState";
import { GameEventNames } from "../../types/events";
import { DiceController } from "../controllers/DiceController";
import { weatherForRoll, type Weather } from "../rules/weather";

const WEATHER_EFFECT: Record<Weather, string> = {
  "Sweltering Heat":
    "At the end of each drive, roll a D3: each coach picks that many of their players on the pitch at random, and they miss the next drive in the Reserves.",
  "Very Sunny": "The glare gives passers a -1 penalty to Passing rolls.",
  Nice: "Perfect conditions — no effect on play.",
  "Pouring Rain":
    "The pitch is slick — Pick Up, Catch and Interception rolls all take a -1 penalty.",
  Blizzard:
    "Freezing and near-blind — only Quick and Short passes may be attempted, and Rushing takes a -1 penalty.",
};

export class WeatherManager {
  private eventBus: IEventBus;
  private state: GameState;
  private diceController: DiceController;
  constructor(
    eventBus: IEventBus,
    state: GameState,
    diceController: DiceController
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.diceController = diceController;
  }

  public rollWeather(): Weather {
    const roll = this.diceController.roll2D6("Weather");
    const weather = weatherForRoll(roll);

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

  public getWeather(): Weather {
    return this.state.weather || "Nice";
  }
}
