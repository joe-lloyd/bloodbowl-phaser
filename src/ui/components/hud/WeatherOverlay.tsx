import React, { useEffect, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { type Team } from "../../../types/Team";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { weatherRolled } from "../../../services/gameService/matchStart";
import { WeatherResult, WeatherStage, WeatherTable } from "./WeatherReveal";
import { useWeatherThrow } from "./weatherThrow";

export const WeatherOverlay: React.FC<{ eventBus: EventBus }> = ({
  eventBus,
}) => {
  const [teams, setTeams] = useState<{ team1: Team; team2: Team } | null>(null);

  useEventBus(eventBus, GameEventNames.UI_StartWeather, (data) => {
    const match = getActiveOnlineMatch();
    if (match && match.kind !== "computer") return;
    setTeams({ team1: data.team1, team2: data.team2 });
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      eventBus.emit(GameEventNames.UI_RequestWeatherState, undefined);
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [eventBus]);

  if (!teams) return null;
  return (
    <WeatherDialog
      eventBus={eventBus}
      teams={teams}
      onDone={() => {
        setTeams(null);
        eventBus.emit(GameEventNames.UI_WeatherComplete, undefined);
      }}
    />
  );
};

function WeatherDialog({
  eventBus,
  teams,
  onDone,
}: {
  eventBus: EventBus;
  teams: { team1: Team; team2: Team };
  onDone: () => void;
}) {
  const { gameService } = ServiceContainer.getInstance();
  const { stage, step, total } = useWeatherThrow({
    eventBus: eventBus,
    teamId: teams.team1.id,
    rolled: () => weatherRolled(gameService.getState()),
  });
  const weather = gameService.getState().weather;

  const roll = () => {
    for (const team of [teams.team1, teams.team2])
      gameService.readyForWeather(team.id);
  };

  return (
    <DialogShell
      zClass="z-50"
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title="WEATHER"
      width="w-[480px]"
      className="text-center"
      testId="weather-dialog"
    >
      <div className="space-y-4 [@media(max-height:500px)]:space-y-2">
        {step === "waiting" && (
          <p className="text-hud-dim">
            Before kick-off the coaches roll 2D6 on the Weather Table. It sets
            the conditions for the whole match.
          </p>
        )}
        <WeatherStage stage={stage} step={step} />
        {step === "shown" && <WeatherResult weather={weather} total={total} />}
        <WeatherTable result={step === "shown" ? weather : null} />
        {step === "waiting" && (
          <HudButton variant="primary" size="lg" block onClick={roll}>
            ROLL WEATHER
          </HudButton>
        )}
        {step === "shown" && (
          <HudButton variant="primary" size="lg" block onClick={onDone}>
            ON TO THE COIN TOSS
          </HudButton>
        )}
      </div>
    </DialogShell>
  );
}
