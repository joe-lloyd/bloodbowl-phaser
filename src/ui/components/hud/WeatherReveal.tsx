import type React from "react";
import type { WeatherStep } from "./weatherThrow";
import {
  WEATHER_TABLE,
  type Weather,
  weatherDescription,
} from "../../../game/rules/weather";

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
              {row.from === row.to
                ? row.from
                : `${String(row.from)}–${String(row.to)}`}
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
