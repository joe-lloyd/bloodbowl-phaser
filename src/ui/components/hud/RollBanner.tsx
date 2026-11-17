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

/** An Armour or Injury Roll, read from the engine's roll name. */
export function readRoll(
  rollType: string
): { kind: RollOutcome["kind"]; playerName: string } | null {
  const armour = /^(?:Foul )?Armour Roll \((.+)\)$/.exec(rollType);
  if (armour) return { kind: "armour", playerName: armour[1] };
  const injury = /^Injury Roll \((.+)\)$/.exec(rollType);
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
 * The banner for one Armour or Injury throw: what is rolled while the dice
 * are in the air, then what it decided once they land. `outcome` is the
 * engine's result for that roll, when it has come.
 */
export function rollBannerText(
  roll: { kind: RollOutcome["kind"]; playerName: string },
  stage: "thrown" | "landed",
  outcome: RollOutcome | undefined
): RollBannerText {
  const name = roll.playerName;
  if (roll.kind === "armour") {
    const armour = outcome?.kind === "armour" ? outcome : undefined;
    const against = armour ? `AV ${armour.armor}+` : "";
    if (stage === "thrown" || !armour) {
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
  const injury = outcome?.kind === "injury" ? outcome : undefined;
  if (stage === "thrown" || !injury) {
    return { headline: "Injury Roll", subtitle: name, result: false };
  }
  const casualty = INJURY_HEADLINE[injury.result] === "Casualty";
  return {
    headline: INJURY_HEADLINE[injury.result],
    subtitle: casualty ? `${name} · casualty roll next` : name,
    result: true,
  };
}

function playerName(playerId: string): string | undefined {
  if (!ServiceContainer.isInitialized()) return undefined;
  return ServiceContainer.getInstance().gameService.getPlayerById(playerId)
    ?.playerName;
}

/**
 * Armour and Injury Rolls get a banner that follows the dice tray: it names
 * the roll while the dice tumble and turns into the result when they land,
 * then goes when the tray's read is over. It adds no time of its own. A
 * match moment banner takes the spot over; the turnover plays beneath it.
 */
export function RollBanner({ eventBus }: { eventBus: IEventBus }) {
  const [banner, setBanner] = useState<RollBannerText | null>(null);
  /** Outcomes the engine has decided whose dice have not landed yet. */
  const outcomes = useRef<RollOutcome[]>([]);
  /** The throw the banner shows, so only its own end clears it. */
  const showing = useRef<string | null>(null);

  const remember = (outcome: RollOutcome) => {
    outcomes.current.push(outcome);
    // A long burst never keeps stale results
    if (outcomes.current.length > 8) outcomes.current.shift();
  };
  useEventBus(eventBus, GameEventNames.ArmorRolled, (data) => {
    const name = playerName(data.playerId);
    if (name) remember({ kind: "armour", playerName: name, ...data });
  });
  useEventBus(eventBus, GameEventNames.InjuryRolled, (data) => {
    const name = playerName(data.playerId);
    if (name) remember({ kind: "injury", playerName: name, ...data });
  });

  useEventBus(eventBus, GameEventNames.UI_DiceThrow, (data: Throw) => {
    const roll = readRoll(data.rollType);
    if (!roll) return;
    const matches = (o: RollOutcome) =>
      o.kind === roll.kind && o.playerName === roll.playerName;
    if (data.stage === "done") {
      if (showing.current === data.rollType) {
        showing.current = null;
        setBanner(null);
      }
      return;
    }
    const index = outcomes.current.findIndex(matches);
    const outcome = index >= 0 ? outcomes.current[index] : undefined;
    // A landed roll uses its outcome up; the next one of its kind is its own
    if (data.stage === "landed" && index >= 0) {
      outcomes.current.splice(index, 1);
    }
    showing.current = data.rollType;
    setBanner(rollBannerText(roll, data.stage, outcome));
  });

  useEventBus(eventBus, GameEventNames.UI_PresentMoment, (moment) => {
    if (moment && moment.kind !== "turnover") setBanner(null);
  });
  useEventBus(eventBus, GameEventNames.PhaseChanged, ({ phase }) => {
    if (phase !== GamePhase.SETUP) return;
    outcomes.current = [];
    setBanner(null);
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
