import { useEffect, useRef, useState } from "react";
import { EventBus, GameEventMap } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { resolvePitchTheme } from "../../../game/presentation/pitchThemes";
import { soundSettings } from "../../sound/settings";
import type { DiceRoll, DiceTeam } from "../../dice/diceScene";

type RollEvent = GameEventMap[GameEventNames.DiceRoll];

/** Block result names in the order the 3D block die numbers its faces. */
export const BLOCK_VALUE: Record<string, number> = {
  skull: 1,
  "both-down": 2,
  push: 3,
  "pow-dodge": 5,
  pow: 6,
};
const HOLD_MS = 900;
const MAX_QUEUE = 3;

/**
 * Turn an engine DiceRoll into dice to throw: D6s and block dice only. A D3,
 * D8 or D16 has no die model.
 */
export function toDice(
  event: RollEvent
): Omit<DiceRoll, "team" | "neon"> | null {
  const values = ([] as (number | string)[]).concat(event.value);
  if (/block/i.test(event.diceType)) {
    const faces = values.map((v) => BLOCK_VALUE[String(v)]);
    return faces.every(Boolean) ? { kind: "block", values: faces } : null;
  }
  if (/^\d*d6$/i.test(event.diceType)) {
    const pips = values.map(Number);
    return pips.every((v) => v >= 1 && v <= 6)
      ? { kind: "d6", values: pips }
      : null;
  }
  return null;
}

/**
 * The colours to throw a roll in. Most rolls (pick-ups, armour, injury,
 * catches, Rush, bounces) carry no team; the coach whose turn it is makes
 * nearly all of them, armour and injury included, so they use that team.
 */
export function teamLook(teamId?: string): DiceTeam | null {
  if (!ServiceContainer.isInitialized()) return null;
  const { gameService } = ServiceContainer.getInstance();
  const rollerId = teamId ?? gameService.getActiveTeamId();
  if (!rollerId) return null;
  const team = gameService.getTeam(rollerId);
  if (!team) return null;
  return {
    key: team.id,
    race: team.rosterName.split(" ")[0].toLowerCase(),
    initial: team.name.charAt(0).toUpperCase(),
    primary: team.colors.primary,
    secondary: team.colors.secondary,
  };
}

interface Queued {
  roll: DiceRoll;
  /** What is being rolled, shown while the dice are in the air */
  title: string;
  /** The outcome, shown only once they have come to rest */
  result: string;
  teamName: string;
  settled: boolean;
}

/**
 * The dice tray: every D6 roll the engine makes is thrown as real 3D dice,
 * in the rolling team's colours, in a small tray at the top of the screen.
 * The outcome shows only once the dice have come to rest. Block dice are
 * thrown in the block dialog instead. It only shows rolls; the numbers come from the engine's own RNG
 * and the tray never decides anything. Rolls queue so none overlap.
 */
export function DiceTray({
  eventBus,
  styleId,
}: {
  eventBus: EventBus;
  styleId?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const queue = useRef<Queued[]>([]);
  const playing = useRef(false);
  const [current, setCurrent] = useState<Queued | null>(null);
  const neon = resolvePitchTheme(styleId).bloom;

  useEffect(() => {
    const playNext = async () => {
      const next = queue.current.shift();
      if (!next || !host.current) {
        playing.current = false;
        setCurrent(null);
        return;
      }
      playing.current = true;
      setCurrent(next);
      try {
        const scene = await import("../../dice/diceScene");
        await scene.playRoll(host.current, next.roll, {
          sound: !soundSettings.get().muted,
        });
        setCurrent({ ...next, settled: true });
        await new Promise((r) => setTimeout(r, HOLD_MS));
      } catch (error) {
        console.warn("[DiceTray] could not show a roll", error);
      }
      void playNext();
    };

    const onRoll = (event: RollEvent) => {
      const dice = toDice(event);
      const team = teamLook(event.teamId);
      // The block dialog throws block dice itself
      if (!dice || dice.kind === "block" || !team) return;
      const teamName =
        ServiceContainer.getInstance().gameService.getTeam(team.key)?.name ??
        "";
      queue.current.push({
        roll: { ...dice, team, neon },
        title: event.rollType,
        result: event.description || event.rollType,
        teamName,
        settled: false,
      });
      // Never fall far behind the game: keep the latest few.
      while (queue.current.length > MAX_QUEUE) queue.current.shift();
      if (!playing.current) void playNext();
    };
    eventBus.on(GameEventNames.DiceRoll, onRoll);
    return () => eventBus.off(GameEventNames.DiceRoll, onRoll);
  }, [eventBus, neon]);

  const color = current
    ? `#${current.roll.team.primary.toString(16).padStart(6, "0")}`
    : undefined;
  return (
    <div
      data-testid="dice-tray"
      className={`pointer-events-none absolute left-1/2 top-20 z-[110] w-[420px] max-w-[80vw] -translate-x-1/2 overflow-hidden rounded-md border-2 border-bb-gold bg-black/75 shadow-lg transition-all duration-200 ${
        current ? "opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-bb-gold/40 px-3 py-1.5">
        <span
          className="font-heading text-xs uppercase tracking-widest"
          style={{ color }}
        >
          {current?.teamName}
        </span>
        <span className="truncate text-xs text-gray-300">
          {current?.settled ? current.result : current?.title}
        </span>
      </div>
      <div ref={host} className="h-[180px] w-full" />
    </div>
  );
}
