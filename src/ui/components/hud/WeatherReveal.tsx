import type React from "react";
import type { WeatherStep } from "./weatherThrow";
import {
  type Weather,
  weatherDescription,
  weatherTableRows,
} from "../../../game/rules/weather";
import { HudButton } from "../componentWarehouse/HudKit";
import { RollTablePanel } from "./RollTablePanel";

export function WeatherPanel({
  zClass,
  header,
  stage,
  step,
  weather,
  total,
  waiting,
  onDone,
}: {
  zClass: string;
  header?: React.ReactNode;
  stage: React.RefObject<HTMLDivElement | null>;
  step: WeatherStep;
  weather: Weather;
  total: number | null;
  waiting: React.ReactNode;
  onDone: () => void;
}) {
  const rows = weatherTableRows().map((row) => ({
    label:
      row.from === row.to
        ? String(row.from)
        : `${String(row.from)}–${String(row.to)}`,
    name: row.weather,
    detail: weatherDescription(row.weather),
  }));
  return (
    <RollTablePanel
      kind="weather"
      title="Weather"
      intro="Roll for the weather. It lasts the whole match."
      columns="grid-cols-5"
      rows={rows}
      result={
        step === "shown"
          ? (rows.find((row) => row.name === weather) ?? null)
          : null
      }
      total={total}
      step={step}
      stage={stage}
      header={header}
      zClass={zClass}
      action={
        <>
          {step === "waiting" && waiting}
          {step === "shown" && (
            <HudButton variant="primary" size="lg" block onClick={onDone}>
              ON TO THE COIN TOSS
            </HudButton>
          )}
        </>
      }
    />
  );
}
