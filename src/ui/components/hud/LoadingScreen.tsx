import { Fragment, useEffect, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { MATCH_STYLE } from "../../../game/presentation/matchStyle";
import { type Team } from "../../../types/Team";
import { matchKits } from "../../../game/presentation/kits";
import { type SeatedTeams } from "../../../game/seating";

interface LoadingScreenProps {
  eventBus: IEventBus;
  teams?: SeatedTeams;
}

interface KittedTeam {
  team: Team;
  primary: number;
}

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

export function LoadingScreen({ eventBus, teams }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [gone, setGone] = useState(false);
  const kits = matchKits((teams ?? []).map(({ colors }) => colors));
  const kitted = (teams ?? []).map((team, index) => ({
    team,
    primary: kits[index]?.primary ?? team.colors.primary,
  }));

  useEffect(() => {
    const onProgress = ({ progress: p }: { progress: number }) => {
      setProgress((prev) => Math.max(prev, p));
    };
    eventBus.on(GameEventNames.UI_LoadProgress, onProgress);
    return () => {
      eventBus.off(GameEventNames.UI_LoadProgress, onProgress);
    };
  }, [eventBus]);

  const done = progress >= 1;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setGone(true);
    }, 700);
    return () => {
      clearTimeout(t);
    };
  }, [done]);

  if (gone) return null;
  return (
    <LoadingScreenView done={done} teams={kitted} progress={progress} />
  );
}

interface LoadingScreenViewProps {
  done: boolean;
  teams: readonly KittedTeam[];
  progress: number;
}
function LoadingScreenView({ done, teams, progress }: LoadingScreenViewProps) {
  return (
    <div
      data-testid="match-loading"
      className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 bg-cover bg-center transition-opacity duration-700 ${
        done ? "opacity-0" : "opacity-100"
      }`}
      style={{
        backgroundColor: css(MATCH_STYLE.background),
        backgroundImage: `linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.88)), url(${MATCH_STYLE.stadiumPath}/preview.webp)`,
      }}
    >
      {teams.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-6 px-6 text-center font-hud-display uppercase tracking-[0.03em] [text-shadow:0_4px_0_#000]">
          {teams.map(({ team, primary }, index) => (
            <Fragment key={team.id}>
              {index > 0 && (
                <span className="-skew-x-12 bg-hud-blood px-3 py-1 text-hud-lg text-white [text-shadow:none] sm:text-hud-xl">
                  vs
                </span>
              )}
              <span
                className="text-hud-3xl sm:text-hud-4xl"
                style={{ color: css(primary) }}
              >
                {team.name}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      <div className="w-72 max-w-[70vw]">
        <div className="h-2.5 -skew-x-12 overflow-hidden border border-hud-gold/50 bg-black/70">
          <div
            className="h-full bg-gradient-to-r from-hud-blood via-hud-blood-hot to-hud-gold transition-[width] duration-300"
            style={{ width: `${String(Math.round(progress * 100))}%` }}
          />
        </div>
        <p className="mt-3 text-center font-hud-label text-hud-sm font-bold uppercase tracking-[0.3em] text-hud-gold/90">
          {done ? "Kick-off" : "Filling the stands"}
        </p>
      </div>
    </div>
  );
}
