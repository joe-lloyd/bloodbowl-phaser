import { useEffect, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { resolvePitchTheme } from "../../../game/presentation/pitchThemes";
import { Team } from "../../../types/Team";

interface LoadingScreenProps {
  eventBus: IEventBus;
  teams?: { team1: Team; team2: Team };
  styleId: string;
}

const css = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

/**
 * Covers the window while the stadium and both rosters' sprites load, then
 * fades away. GameScene reports loader progress, and 1 once the board is
 * built.
 */
export function LoadingScreen({
  eventBus,
  teams,
  styleId,
}: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [gone, setGone] = useState(false);
  const style = resolvePitchTheme(styleId);

  useEffect(() => {
    const onProgress = ({ progress: p }: { progress: number }) =>
      setProgress((prev) => Math.max(prev, p));
    eventBus.on(GameEventNames.UI_LoadProgress, onProgress);
    return () => eventBus.off(GameEventNames.UI_LoadProgress, onProgress);
  }, [eventBus]);

  const done = progress >= 1;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;
  return (
    <div
      data-testid="match-loading"
      className={`fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-8 bg-cover bg-center transition-opacity duration-700 ${
        done ? "opacity-0" : "opacity-100"
      }`}
      style={{
        backgroundColor: css(style.background),
        backgroundImage: `linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.88)), url(${style.stadiumPath}/preview.webp)`,
      }}
    >
      {teams && (
        <div className="flex items-baseline gap-6 px-6 text-center font-heading uppercase tracking-wider">
          <span
            className="text-3xl sm:text-5xl"
            style={{ color: css(teams.team1.colors.primary) }}
          >
            {teams.team1.name}
          </span>
          <span className="text-xl text-bb-gold sm:text-2xl">vs</span>
          <span
            className="text-3xl sm:text-5xl"
            style={{ color: css(teams.team2.colors.primary) }}
          >
            {teams.team2.name}
          </span>
        </div>
      )}
      <div className="w-72 max-w-[70vw]">
        <div className="h-2 overflow-hidden rounded-full border border-bb-gold/60 bg-black/60">
          <div
            className="h-full bg-bb-gold transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-center font-heading text-sm uppercase tracking-[0.3em] text-bb-gold/80">
          {done ? "Kick-off" : `Filling the stands · ${style.name}`}
        </p>
      </div>
    </div>
  );
}
