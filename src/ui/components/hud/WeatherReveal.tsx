import React, { useEffect, useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import {
  WEATHER_TABLE,
  Weather,
  weatherDescription,
} from "../../../game/rules/weather";
import { soundSettings } from "../../sound/settings";
import type { DiceThrow } from "../../dice/diceScene";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";
import { teamLook } from "./DiceTray";

/** How long the landed dice show before the result reads out. */
const RESULT_BEAT_MS = 700;

export type WeatherStep = "waiting" | "rolling" | "shown";

/**
 * Throws a table roll's 2D6 into its dialog when the engine rolls it, in
 * the given team's colours, and reports when the result may show: the
 * opening weather (the home team's) and the Kick-off Table (the kicker's).
 * A dialog opened after the roll (a resumed match), or whose engine is
 * restored to a rolled state, shows the result at once: no dice event
 * comes then.
 */
export function useWeatherThrow(
  eventBus: IEventBus,
  teamId: string,
  rolled: () => boolean,
  rollType = "Weather"
) {
  const stage = useRef<HTMLDivElement>(null);
  const throwing = useRef<DiceThrow | null>(null);
  const [step, setStep] = useState<WeatherStep>(() =>
    rolled() ? "shown" : "waiting"
  );
  const [total, setTotal] = useState<number | null>(null);

  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    if (rolled())
      setStep((current) => (current === "waiting" ? "shown" : current));
  });

  useEventBus(eventBus, GameEventNames.DiceRoll, (roll) => {
    if (roll.rollType !== rollType || step !== "waiting") return;
    const values = ([] as (number | string)[]).concat(roll.value).map(Number);
    setStep("rolling");
    void (async () => {
      const team = teamLook(teamId);
      try {
        if (!stage.current || !team) throw new Error("no stage");
        const scene = await import("../../dice/diceScene");
        const handle = scene.playRoll(
          stage.current,
          { kind: "d6", values, team },
          { sound: !soundSettings.get().muted }
        );
        throwing.current = handle;
        // Dice that never land (a hidden tab) still give way to the result
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          handle.landed,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              handle.stop();
              resolve();
            }, DIE_LANDING_TIMEOUT_MS);
          }),
        ]).finally(() => clearTimeout(timer));
        await new Promise((resolve) => setTimeout(resolve, RESULT_BEAT_MS));
      } catch (error) {
        console.warn("[WeatherReveal] could not show the dice", error);
      }
      setTotal(roll.total);
      setStep("shown");
    })();
  });

  useEffect(() => () => throwing.current?.stop(), []);

  return { stage, step, total };
}

/** Where the dice land: hidden until they are thrown. */
export function WeatherStage({
  stage,
  step,
}: {
  stage: React.RefObject<HTMLDivElement | null>;
  step: WeatherStep;
}) {
  return (
    <div
      ref={stage}
      data-testid="weather-stage"
      className={
        step === "waiting" ? "hidden" : "mx-auto h-[min(180px,28dvh)] w-full"
      }
    />
  );
}

/**
 * The Weather Table, with the rolled result marked once it shows. Totals
 * only: never the chance of each.
 */
export function WeatherTable({ result }: { result: Weather | null }) {
  return (
    <ul className="space-y-1 text-left" data-testid="weather-table">
      {WEATHER_TABLE.map((row) => {
        const hit = row.weather === result;
        return (
          <li
            key={row.weather}
            data-current={hit ? "" : undefined}
            className={`grid grid-cols-[3.5rem_1fr] items-baseline gap-3 rounded-hud border px-3 py-1 ${
              hit
                ? "border-hud-gold bg-hud-gold/15 text-hud-bone"
                : "border-white/5 text-hud-dim"
            }`}
          >
            <span className="font-hud-label text-hud-lg font-bold tabular-nums">
              {row.from === row.to ? row.from : `${row.from}–${row.to}`}
            </span>
            <span>
              <span className="font-hud-label font-bold uppercase tracking-[0.04em]">
                {row.weather}
              </span>
              <span className="ml-2 text-hud-xs">
                {weatherDescription(row.weather)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The rolled weather, read out once the dice have landed. */
export function WeatherResult({
  weather,
  total,
}: {
  weather: Weather;
  total: number | null;
}) {
  return (
    <div className="animate-hud-in" data-testid="weather-result">
      <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
        {weather}
      </div>
      <p className="text-hud-dim">
        {total !== null && <>Rolled {total} · </>}
        {weatherDescription(weather)}
      </p>
    </div>
  );
}
