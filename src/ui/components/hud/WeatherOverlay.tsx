import React, { useEffect, useState } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { Team } from "../../../types/Team";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { weatherRolled } from "../../../services/gameService/matchStart";
import {
  WeatherResult,
  WeatherStage,
  WeatherTable,
  useWeatherThrow,
} from "./WeatherReveal";

/**
 * The opening weather in a local match or one against the computer: the
 * coach rolls the 2D6 when ready, reads the result off the Weather Table,
 * and carries on to the coin toss. Online matches roll it in OnlineCoinFlip,
 * where both coaches ready up.
 */
export const WeatherOverlay: React.FC<{ eventBus: EventBus }> = ({
  eventBus,
}) => {
  const [teams, setTeams] = useState<{ team1: Team; team2: Team } | null>(
    null
  );

  useEventBus(eventBus, GameEventNames.UI_StartWeather, (data) => {
    const match = getActiveOnlineMatch();
    if (match && match.kind !== "computer") return;
    setTeams({ team1: data.team1, team2: data.team2 });
  });

  // The intro may have asked before this dialog mounted
  useEffect(() => {
    const timer = setTimeout(
      () => eventBus.emit(GameEventNames.UI_RequestWeatherState),
      100
    );
    return () => clearTimeout(timer);
  }, [eventBus]);

  if (!teams) return null;
  return (
    <WeatherDialog
      eventBus={eventBus}
      teams={teams}
      onDone={() => {
        setTeams(null);
        eventBus.emit(GameEventNames.UI_WeatherComplete);
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
  const { stage, step, total } = useWeatherThrow(
    eventBus,
    teams.team1.id,
    weatherRolled(gameService.getState())
  );
  const weather = gameService.getState().weather;

  // One screen, so the one coach readies both teams
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
