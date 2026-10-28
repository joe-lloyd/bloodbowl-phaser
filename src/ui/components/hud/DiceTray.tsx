import { useEffect, useRef, useState } from "react";
import { EventBus, GameEventMap } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { resolvePitchTheme } from "../../../game/presentation/pitchThemes";
import { soundSettings } from "../../sound/settings";
import type { DiceRoll, DiceTeam, DiceThrow } from "../../dice/diceScene";
import type { BlockRollData } from "../../../services/BlockResolutionService";
import { isBlockDice, isD6 } from "../../dice/thrownDice";

type RollEvent = GameEventMap[GameEventNames.DiceRoll];

/** Block result names in the order the 3D block die numbers its faces. */
export const BLOCK_VALUE: Record<string, number> = {
  skull: 1,
  "both-down": 2,
  push: 3,
  "pow-dodge": 5,
  pow: 6,
};
const HOLD_MS = 1800;
const MAX_QUEUE = 3;

/**
 * Turn an engine DiceRoll into dice to throw: D6s and block dice only. A D3,
 * D8 or D16 has no die model.
 */
export function toDice(
  event: RollEvent
): Omit<DiceRoll, "team" | "neon"> | null {
  const values = ([] as (number | string)[]).concat(event.value);
  if (isBlockDice(event.diceType)) {
    const faces = values.map((v) => BLOCK_VALUE[String(v)]);
    return faces.every(Boolean) ? { kind: "block", values: faces } : null;
  }
  if (isD6(event.diceType)) {
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
  /** Block dice: held until a result is chosen; the face of each die */
  block?: string[];
}

/** How long a chosen block die stays forward before the tray clears. */
const CHOSEN_MS = 1200;

/**
 * The dice tray: the one place every roll is thrown, D6s and block dice
 * alike, as real 3D dice in the rolling team's colours, at the bottom
 * centre clear of the turn indicator, the clock and the corner panels.
 * The dice tumble, land, then lift up toward the coach with their result
 * face forward; the outcome text shows only then. Block dice stay up until
 * a result is chosen, and the coach chooses by clicking a lifted die (the
 * block dialog applies the choice). The tray only shows rolls; the numbers
 * come from the engine's own RNG. Rolls queue so none overlap.
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
    let shown: Queued | null = null;
    let throwing: DiceThrow | null = null;
    // Ends the hold on the dice now up, so the next roll can play
    let release: (() => void) | null = null;

    const playNext = async () => {
      const next = queue.current.shift();
      if (!next || !host.current) {
        playing.current = false;
        shown = null;
        throwing?.stop();
        throwing = null;
        setCurrent(null);
        return;
      }
      playing.current = true;
      shown = next;
      setCurrent(next);
      try {
        const scene = await import("../../dice/diceScene");
        const handle = scene.playRoll(host.current, next.roll, {
          sound: !soundSettings.get().muted,
        });
        throwing = handle;
        if (next.block) {
          handle.onPick((index) =>
            eventBus.emit(GameEventNames.UI_BlockDieClicked, { index })
          );
        }
        await handle.landed;
        setCurrent({ ...next, settled: true });
        await new Promise<void>((resolve) => {
          release = resolve;
          if (!next.block) setTimeout(resolve, HOLD_MS);
        });
        release = null;
      } catch (error) {
        console.warn("[DiceTray] could not show a roll", error);
      }
      void playNext();
    };

    const enqueue = (item: Queued, first = false) => {
      if (first) queue.current.unshift(item);
      else queue.current.push(item);
      // Never fall far behind the game: keep the latest few.
      while (queue.current.length > MAX_QUEUE) queue.current.pop();
      if (!playing.current) void playNext();
    };

    const onRoll = (event: RollEvent) => {
      const dice = toDice(event);
      const team = teamLook(event.teamId);
      // Block dice come from BlockDiceRolled, which has the whole set even
      // when a Pro re-roll rolls only one of them
      if (!dice || dice.kind === "block" || !team) return;
      enqueue({
        roll: { ...dice, team, neon },
        title: event.rollType,
        result: event.description || event.rollType,
        teamName: teamName(team.key),
        settled: false,
      });
    };

    const onBlockRolled = (payload: BlockRollData) => {
      const faces = payload.results.map((r) => r.type);
      const values = faces.map((face) => BLOCK_VALUE[face]);
      const attacker = ServiceContainer.isInitialized()
        ? ServiceContainer.getInstance().gameService.getPlayerById(
            payload.attackerId
          )
        : undefined;
      const team = teamLook(attacker?.teamId);
      if (!team || !values.every(Boolean)) return;
      // A block is the decision on the table: it goes before older D6s,
      // and a re-roll replaces the dice still up
      enqueue(
        {
          roll: { kind: "block", values, team, neon },
          title: `Block: ${faces.length} ${faces.length === 1 ? "die" : "dice"}`,
          result: payload.results.map((r) => r.label).join(" · "),
          teamName: teamName(team.key),
          settled: false,
          block: faces,
        },
        true
      );
      release?.();
    };

    const onResolved = ({
      type,
      result,
    }: {
      type: string;
      result?: string;
    }) => {
      if (type !== "block-dice" || !shown?.block) return;
      const index = result ? shown.block.indexOf(result) : -1;
      throwing?.mark(index >= 0 ? index : null);
      const ending = release;
      setTimeout(() => ending?.(), CHOSEN_MS);
    };
    const onCancelled = () => {
      if (shown?.block) release?.();
    };

    eventBus.on(GameEventNames.DiceRoll, onRoll);
    eventBus.on(GameEventNames.BlockDiceRolled, onBlockRolled);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    eventBus.on(GameEventNames.UI_BlockRollCancelled, onCancelled);
    return () => {
      eventBus.off(GameEventNames.DiceRoll, onRoll);
      eventBus.off(GameEventNames.BlockDiceRolled, onBlockRolled);
      eventBus.off(GameEventNames.DecisionResolved, onResolved);
      eventBus.off(GameEventNames.UI_BlockRollCancelled, onCancelled);
      throwing?.stop();
    };
  }, [eventBus, neon]);

  const color = current
    ? `#${current.roll.team.primary.toString(16).padStart(6, "0")}`
    : undefined;
  const pickable = !!current?.block && current.settled;
  return (
    <div
      data-testid="dice-tray"
      className={`pointer-events-none absolute bottom-4 left-1/2 z-[110] w-[420px] max-w-[50vw] -translate-x-1/2 overflow-hidden rounded-md border-2 border-bb-gold bg-black/75 shadow-lg transition-all duration-200 ${
        current ? "opacity-100" : "translate-y-2 opacity-0"
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
      <div
        ref={host}
        data-testid="dice-tray-dice"
        className={`h-[180px] w-full ${pickable ? "pointer-events-auto" : ""}`}
      />
    </div>
  );
}

function teamName(teamId: string): string {
  return ServiceContainer.isInitialized()
    ? (ServiceContainer.getInstance().gameService.getTeam(teamId)?.name ?? "")
    : "";
}
