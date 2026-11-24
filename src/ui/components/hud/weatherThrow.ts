import { useEffect, useRef, useState } from "react";
import type { IEventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { soundSettings } from "../../sound/settings";
import type { DiceThrow } from "../../dice/diceScene";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";
import { teamLook } from "./diceTrayData";

export const WEATHER_ROLL = "Weather";

const RESULT_BEAT_MS = 700;

export type WeatherStep = "waiting" | "rolling" | "shown";

export function useWeatherThrow({
  eventBus,
  teamId,
  rolled,
  rollType = WEATHER_ROLL,
}: {
  eventBus: IEventBus;
  teamId: string;
  rolled: () => boolean;
  rollType?: string;
}) {
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
    const values = new Array<number | string>().concat(roll.value).map(Number);
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

        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          handle.landed,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              handle.stop();
              resolve();
            }, DIE_LANDING_TIMEOUT_MS);
          }),
        ]).finally(() => {
          clearTimeout(timer);
        });
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
