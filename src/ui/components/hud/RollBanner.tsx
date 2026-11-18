import { useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { GameEventMap } from "../../../services/EventBus";
import { GamePhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { InjuryResult } from "../../../game/controllers/InjuryController";
import { useEventBus } from "../../hooks/useEventBus";

type Throw = GameEventMap[GameEventNames.UI_DiceThrow];
type ArmourOutcome = GameEventMap[GameEventNames.ArmorRolled];
type InjuryOutcome = GameEventMap[GameEventNames.InjuryRolled];

/** What the engine decided for one roll, waiting for its dice to land. */
export type RollOutcome =
  | ({ kind: "armour"; playerName: string } & ArmourOutcome)
  | ({ kind: "injury"; playerName: string } & InjuryOutcome);

export interface RollBannerText {
  headline: string;
  subtitle: string;
  /** The result, read once the dice have landed. */
  result: boolean;
}

/**
 * An Armour or Injury Roll, read from the engine's roll name. A Stab,
 * Chainsaw or Projectile Vomit rolls an unnamed "Armor Check": its player
 * comes with the outcome.
 */
export function readRoll(
  rollType: string
): { kind: RollOutcome["kind"]; playerName: string } | null {
  if (rollType === "Armor Check") return { kind: "armour", playerName: "" };
  const armour = /^(?:Foul )?Armour Roll \((.+)\)$/.exec(rollType);
  if (armour) return { kind: "armour", playerName: armour[1] };
  const injury = /^(?:Injury Roll|Injury by the Crowd) \((.+)\)$/.exec(
    rollType
  );
  if (injury) return { kind: "injury", playerName: injury[1] };
  return null;
}

const INJURY_HEADLINE: Record<InjuryResult, string> = {
  [InjuryResult.STUNNED]: "Stunned",
  [InjuryResult.KO]: "Knocked Out",
  [InjuryResult.BADLY_HURT]: "Casualty",
  [InjuryResult.SERIOUSLY_HURT]: "Casualty",
  [InjuryResult.DEAD]: "Casualty",
};

/**
 * What one throw decided: the engine's outcome, "superseded" when a later
 * throw of the same roll re-rolled it (Lone Fouler), or nothing yet.
 */
export type ThrowOutcome = RollOutcome | "superseded" | undefined;

/**
 * The banner for one Armour or Injury throw: what is rolled while the dice
 * are in the air, then what it decided once they land.
 */
export function rollBannerText(
  roll: { kind: RollOutcome["kind"]; playerName: string },
  stage: "thrown" | "landed",
  outcome: ThrowOutcome
): RollBannerText {
  const name =
    roll.playerName ||
    (outcome && outcome !== "superseded" ? outcome.playerName : "");
  if (stage === "landed" && outcome === "superseded") {
    return {
      headline: roll.kind === "armour" ? "Armour Roll" : "Injury Roll",
      subtitle: `${name} · re-rolled`,
      result: false,
    };
  }
  const landed = stage === "landed";
  const decided = outcome === "superseded" ? undefined : outcome;
  return roll.kind === "armour"
    ? armourText(name, landed, decided?.kind === "armour" ? decided : undefined)
    : injuryText(name, landed, decided?.kind === "injury" ? decided : undefined);
}

function armourText(
  name: string,
  landed: boolean,
  armour: ArmourOutcome | undefined
): RollBannerText {
  const against = armour ? `AV ${armour.armor}+` : "";
  if (!landed || !armour) {
    return {
      headline: "Armour Roll",
      subtitle: [name, against].filter(Boolean).join(" · "),
      result: false,
    };
  }
  return armour.broken
    ? {
        headline: "Armour Broken",
        subtitle: `${name} · ${armour.roll} against ${against}, injury roll next`,
        result: true,
      }
    : {
        headline: "Armour Holds",
        subtitle: `${name} · ${armour.roll} against ${against}`,
        result: true,
      };
}

function injuryText(
  name: string,
  landed: boolean,
  injury: InjuryOutcome | undefined
): RollBannerText {
  if (!landed || !injury) {
    return { headline: "Injury Roll", subtitle: name, result: false };
  }
  // A player Stunned by the crowd goes to the Reserves instead
  const headline =
    injury.crowd && injury.result === InjuryResult.STUNNED
      ? "Into the Reserves"
      : INJURY_HEADLINE[injury.result];
  return {
    headline,
    // Sevens reads the casualty off the injury dice: say which it is
    subtitle: headline === "Casualty" ? `${name} · ${injury.result}` : name,
    result: true,
  };
}

interface Tracked {
  seq: number;
  kind: RollOutcome["kind"];
  /** Empty for an unnamed "Armor Check": the outcome names the player. */
  playerName: string;
  rollType: string;
  teamId?: string;
  outcome: ThrowOutcome;
}

/**
 * The Armour and Injury throws the tray holds, each paired with the
 * outcome the engine decided for it. A throw is known by the tray's number
 * for it, so a dropped throw takes its outcome with it. An outcome names
 * the dice roll it decides and whose dice they were, so a same-named player
 * on the other team never shares one. It goes to the newest open throw of
 * that roll; any older open one was re-rolled.
 */
export class RollBook {
  private throws: Tracked[] = [];

  queued(seq: number, rollType: string, teamId?: string): void {
    const roll = readRoll(rollType);
    if (roll)
      this.throws.push({ seq, ...roll, rollType, teamId, outcome: undefined });
  }

  decided(outcome: RollOutcome): void {
    const teamId = outcome.diceTeamId;
    const open = this.throws.filter(
      (t) =>
        t.outcome === undefined &&
        t.kind === outcome.kind &&
        t.rollType === outcome.rollType &&
        (!t.teamId || !teamId || t.teamId === teamId)
    );
    const latest = open.pop();
    if (!latest) return;
    latest.outcome = outcome;
    open.forEach((t) => (t.outcome = "superseded"));
  }

  /** The banner for a throw going up or landing, if it is one of ours. */
  text(seq: number, stage: "thrown" | "landed"): RollBannerText | null {
    const tracked = this.throws.find((t) => t.seq === seq);
    return tracked ? rollBannerText(tracked, stage, tracked.outcome) : null;
  }

  /** The throw is done with, read or dropped. */
  forget(seq: number): void {
    this.throws = this.throws.filter((t) => t.seq !== seq);
  }

  clear(): void {
    this.throws = [];
  }
}

function playerOf(
  playerId: string
): { playerName: string } | undefined {
  if (!ServiceContainer.isInitialized()) return undefined;
  return ServiceContainer.getInstance().gameService.getPlayerById(playerId);
}

/**
 * Armour and Injury Rolls get a banner that follows the dice tray: it names
 * the roll while the dice tumble and turns into the result when they land,
 * then goes when the tray's read is over. It adds no time of its own. A
 * match moment banner takes the spot over; the turnover plays beneath it.
 */
export function RollBanner({ eventBus }: { eventBus: IEventBus }) {
  const [banner, setBanner] = useState<RollBannerText | null>(null);
  const book = useRef(new RollBook());
  /** The throw the banner shows, so only its own end clears it. */
  const showing = useRef<number | null>(null);
  /** Its text, held back while a match moment owns the spot. */
  const held = useRef<RollBannerText | null>(null);
  /** A match moment banner (not the turnover) is on screen. */
  const momentOn = useRef(false);
  const show = (text: RollBannerText | null) => {
    held.current = text;
    if (!momentOn.current) setBanner(text);
  };

  useEventBus(eventBus, GameEventNames.ArmorRolled, (data) => {
    const player = playerOf(data.playerId);
    if (player)
      book.current.decided({
        kind: "armour",
        playerName: player.playerName,
        ...data,
      });
  });
  useEventBus(eventBus, GameEventNames.InjuryRolled, (data) => {
    const player = playerOf(data.playerId);
    if (player)
      book.current.decided({
        kind: "injury",
        playerName: player.playerName,
        ...data,
      });
  });

  useEventBus(eventBus, GameEventNames.UI_DiceThrow, (data: Throw) => {
    switch (data.stage) {
      case "queued":
        book.current.queued(data.seq, data.rollType, data.teamId);
        return;
      case "dropped":
      case "done":
        book.current.forget(data.seq);
        if (showing.current === data.seq) {
          showing.current = null;
          show(null);
        }
        return;
      case "thrown":
      case "landed": {
        const text = book.current.text(data.seq, data.stage);
        if (!text) return;
        showing.current = data.seq;
        show(text);
        return;
      }
      default: {
        const unreachable: never = data.stage;
        return unreachable;
      }
    }
  });

  // A match moment owns the spot while it plays; the throw it covered
  // shows again once it ends, if the dice are still up
  useEventBus(eventBus, GameEventNames.UI_PresentMoment, (moment) => {
    momentOn.current = !!moment && moment.kind !== "turnover";
    setBanner(momentOn.current ? null : held.current);
  });
  useEventBus(eventBus, GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase !== GamePhase.SETUP) return;
    book.current.clear();
    showing.current = null;
    show(null);
  });

  if (!banner) return null;
  return (
    <div
      data-testid="roll-banner"
      data-result={banner.result ? "" : undefined}
      className="pointer-events-none absolute inset-x-0 top-[18%] z-[210] flex select-none justify-center animate-hud-in"
    >
      <div className="flex flex-col items-center">
        <div
          className={`max-w-[calc(100vw-48px)] -skew-x-12 border-y-2 px-10 py-2 shadow-hud ${
            banner.result
              ? "border-hud-gold bg-hud-ink/95"
              : "border-white/30 bg-hud-ink/85"
          }`}
        >
          <span
            className={`block skew-x-12 text-center font-hud-display text-hud-3xl uppercase tracking-[0.04em] [text-shadow:0_3px_0_theme(colors.hud.ink)] ${
              banner.result ? "text-hud-bone" : "text-hud-dim"
            }`}
          >
            {banner.headline}
          </span>
        </div>
        {banner.subtitle && (
          <div className="max-w-[min(900px,calc(100vw-48px))] -mt-px -skew-x-12 bg-hud-blood px-6 py-1">
            <span className="block skew-x-12 text-center font-hud-label text-hud-lg font-bold tracking-[0.04em] text-white">
              {banner.subtitle}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
