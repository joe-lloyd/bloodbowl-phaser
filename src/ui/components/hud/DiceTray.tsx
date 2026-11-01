import { useEffect, useRef, useState } from "react";
import { EventBus, GameEventMap } from "../../../services/EventBus";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { resolvePitchTheme } from "../../../game/presentation/pitchThemes";
import { soundSettings } from "../../sound/settings";
import type { DiceRoll, DiceTeam, DiceThrow } from "../../dice/diceScene";
import type { BlockRollData } from "../../../services/BlockResolutionService";
import { isBlockDice, isD6 } from "../../dice/thrownDice";
import { DIE_LANDING_TIMEOUT_MS } from "../../../game/presentation/diceWatch";

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
/** A landed roll's read when another roll waits behind it. */
const QUEUED_HOLD_MS = 250;
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
  /** Order thrown, from 1. */
  seq: number;
  /**
   * The throw ends in a 2D6 roll, such as armour or injury. It is read as a
   * total that decides what comes next, so no later roll joins it.
   */
  closed?: boolean;
  /** Block dice: held until a result is chosen; the face of each die */
  block?: string[];
  /**
   * Block dice answered while still in the air: how long to hold them once
   * they land. Without it the answer would find no hold to end.
   */
  endAfterMs?: number;
}

/** How long a chosen block die stays forward before the tray clears. */
const CHOSEN_MS = 1200;

/** The most dice one throw carries; the lifted row fits six. */
const MAX_DICE_PER_THROW = 6;

/**
 * A D6 roll still waiting to be thrown takes the next D6 roll of its team,
 * unless it ends in a 2D6 roll: an injury roll must not go up before the
 * armour roll that allowed it has landed.
 */
function joinsThrow(waiting: Queued, next: Queued): boolean {
  return (
    !waiting.closed &&
    waiting.roll.kind === "d6" &&
    next.roll.kind === "d6" &&
    !waiting.block &&
    !next.block &&
    waiting.roll.team.key === next.roll.team.key &&
    waiting.roll.values.length + next.roll.values.length <= MAX_DICE_PER_THROW
  );
}

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
    // Shortens a D6's read when another roll arrives during it
    let cutHold: (() => void) | null = null;
    // The last read was cut short for this roll: it is part of a burst,
    // such as a fall's armour and injury, and is hurried like the rest
    let inBurst = false;
    // The board holds a step or a fall until the dice deciding it land.
    // Rolls are numbered as thrown; every roll up to `landedThrough` has
    // landed or was dropped from a full queue, so it never will.
    let thrown = 0;
    // Bumped when setup clears the tray, so a throw from before is dropped.
    let generation = 0;
    const reportInAir = () => {
      const pending = [
        ...queue.current,
        ...(shown && !shown.settled ? [shown] : []),
      ];
      eventBus.emit(GameEventNames.UI_DiceInAir, {
        count: pending.length,
        thrown,
        landedThrough: Math.min(thrown, ...pending.map((q) => q.seq - 1)),
      });
    };

    const playNext = async () => {
      const round = generation;
      const next = queue.current.shift();
      if (!next || !host.current) {
        playing.current = false;
        shown = null;
        throwing?.stop();
        throwing = null;
        setCurrent(null);
        reportInAir();
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
        // More rolls wait behind this one, a fall's armour and injury
        if (queue.current.length > 0 || inBurst) handle.hurry();
        if (next.block) {
          handle.onPick((index) =>
            eventBus.emit(GameEventNames.UI_BlockDieClicked, { index })
          );
        }
        // A die that never settles (a stalled renderer, a hidden tab)
        // counts as landed after a bound, so it can never block the queue.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          handle.landed,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              handle.stop();
              resolve();
            }, DIE_LANDING_TIMEOUT_MS);
          }),
        ]);
        clearTimeout(timer);
        if (round !== generation) return;
        next.settled = true;
        reportInAir();
        setCurrent({ ...next });
        inBurst = queue.current.length > 0;
        await new Promise<void>((resolve) => {
          release = resolve;
          if (next.block) {
            if (next.endAfterMs !== undefined)
              setTimeout(resolve, next.endAfterMs);
            return;
          }
          // A short read when another roll waits; one arriving during a
          // full read cuts it short too
          setTimeout(resolve, inBurst ? QUEUED_HOLD_MS : HOLD_MS);
          cutHold = () => {
            inBurst = true;
            setTimeout(resolve, QUEUED_HOLD_MS);
          };
        });
        release = null;
        cutHold = null;
      } catch (error) {
        console.warn("[DiceTray] could not show a roll", error);
        next.settled = true;
        reportInAir();
      }
      if (round !== generation) return;
      void playNext();
    };

    // A new drive's setup starts with an empty tray: the last injury die
    // from the drive before is not this drive's roll.
    const onPhase = ({ phase }: { phase: GamePhase }) => {
      if (phase !== GamePhase.SETUP) return;
      generation++;
      queue.current = [];
      throwing?.stop();
      throwing = null;
      shown = null;
      release?.();
      release = null;
      playing.current = false;
      setCurrent(null);
      reportInAir();
    };

    const enqueue = (roll: Omit<Queued, "seq">, first = false) => {
      const item = { ...roll, seq: ++thrown };
      const waiting = queue.current[queue.current.length - 1];
      if (!first && waiting && joinsThrow(waiting, item)) {
        // A burst, such as a fall's bounce, throw-in and armour: one throw
        // for all of it, rather than one tumble and read after another
        waiting.roll = {
          ...waiting.roll,
          values: [...waiting.roll.values, ...item.roll.values],
        };
        waiting.title = `${waiting.title} · ${item.title}`;
        waiting.result = `${waiting.result} · ${item.result}`;
        waiting.closed = item.closed;
      } else if (first) queue.current.unshift(item);
      else queue.current.push(item);
      // Never fall far behind the game: keep the latest few.
      while (queue.current.length > MAX_QUEUE) queue.current.pop();
      if (!playing.current) void playNext();
      else if (shown && !shown.settled && !shown.block) throwing?.hurry();
      else cutHold?.();
      reportInAir();
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
        closed: dice.values.length > 1,
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
      if (!release) {
        shown.endAfterMs = CHOSEN_MS;
        return;
      }
      const ending = release;
      setTimeout(() => ending(), CHOSEN_MS);
    };
    const onCancelled = () => {
      if (!shown?.block) return;
      if (release) release();
      else shown.endAfterMs = 0;
    };

    eventBus.on(GameEventNames.PhaseChanged, onPhase);
    eventBus.on(GameEventNames.DiceRoll, onRoll);
    eventBus.on(GameEventNames.BlockDiceRolled, onBlockRolled);
    eventBus.on(GameEventNames.DecisionResolved, onResolved);
    eventBus.on(GameEventNames.UI_BlockRollCancelled, onCancelled);
    return () => {
      eventBus.off(GameEventNames.PhaseChanged, onPhase);
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
      data-dice={current ? (current.settled ? "landed" : "in-air") : "empty"}
      className={`hud-slab pointer-events-none absolute bottom-4 left-1/2 z-[110] w-[420px] max-w-[50vw] -translate-x-1/2 overflow-hidden transition-all duration-200 ${
        current ? "opacity-100" : "translate-y-2 opacity-0"
      }`}
      style={{ borderTop: color ? `3px solid ${color}` : undefined }}
    >
      <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-hud-gold/20 px-3 py-1.5">
        {/* Bone text with a swatch: a dark team colour is unreadable here. */}
        <span
          data-testid="dice-tray-team"
          className="flex shrink-0 items-center gap-1.5 font-hud-label text-hud-sm font-bold uppercase tracking-[0.12em] text-hud-bone"
        >
          {color && (
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-white/40"
              style={{ backgroundColor: color }}
            />
          )}
          {current?.teamName}
        </span>
        <span
          className={`truncate font-hud-label text-hud-sm font-semibold uppercase tracking-[0.05em] ${
            current?.settled ? "text-hud-bone" : "text-hud-dim"
          }`}
        >
          {current?.settled ? current.result : current?.title}
        </span>
      </div>
      <div
        ref={host}
        data-testid="dice-tray-dice"
        className={`h-[180px] w-full bg-[radial-gradient(ellipse_at_50%_85%,rgba(44,48,57,0.6),transparent_70%)] ${pickable ? "pointer-events-auto" : ""}`}
      />
    </div>
  );
}

function teamName(teamId: string): string {
  return ServiceContainer.isInitialized()
    ? (ServiceContainer.getInstance().gameService.getTeam(teamId)?.name ?? "")
    : "";
}
