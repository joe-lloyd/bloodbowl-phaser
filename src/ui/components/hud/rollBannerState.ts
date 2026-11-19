import type { GameEventMap } from "../../../services/EventBus";
import type { GameEventNames } from "../../../types/events";
import { GamePhase } from "../../../types/GameState";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { InjuryResult } from "../../../game/controllers/InjuryController";
export type Throw = GameEventMap[typeof GameEventNames.UI_DiceThrow];

type ArmourOutcome = GameEventMap[typeof GameEventNames.ArmorRolled];

type InjuryOutcome = GameEventMap[typeof GameEventNames.InjuryRolled];

export type RollOutcome =
  | ({ kind: "armour"; playerName: string } & ArmourOutcome)
  | ({ kind: "injury"; playerName: string } & InjuryOutcome);

export interface RollBannerText {
  headline: string;
  subtitle: string;

  result: boolean;
}

export function readRoll(
  rollType: string
): { kind: RollOutcome["kind"]; playerName: string } | null {
  if (rollType === "Armor Check") return { kind: "armour", playerName: "" };
  const armour = /^(?:Foul )?Armour Roll \((.+)\)$/.exec(rollType);
  if (armour?.[1]) return { kind: "armour", playerName: armour[1] };
  const injury = /^(?:Injury Roll|Injury by the Crowd) \((.+)\)$/.exec(
    rollType
  );
  if (injury?.[1]) return { kind: "injury", playerName: injury[1] };
  return null;
}

const INJURY_HEADLINE: Record<InjuryResult, string> = {
  [InjuryResult.STUNNED]: "Stunned",
  [InjuryResult.KO]: "Knocked Out",
  [InjuryResult.BADLY_HURT]: "Casualty",
  [InjuryResult.SERIOUSLY_HURT]: "Casualty",
  [InjuryResult.DEAD]: "Casualty",
};

export type ThrowOutcome = RollOutcome | "superseded" | undefined;

export function rollBannerText(
  roll: { kind: RollOutcome["kind"]; playerName: string },
  stage: "thrown" | "landed",
  outcome: ThrowOutcome
): RollBannerText {
  const name = rollPlayerName(roll.playerName, outcome);
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
    : injuryText(
        name,
        landed,
        decided?.kind === "injury" ? decided : undefined
      );
}

function armourText(
  name: string,
  landed: boolean,
  armour: ArmourOutcome | undefined
): RollBannerText {
  const against = armour ? `AV ${String(armour.armor)}+` : "";
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
        subtitle: `${name} · ${String(armour.roll)} against ${against}, injury roll next`,
        result: true,
      }
    : {
        headline: "Armour Holds",
        subtitle: `${name} · ${String(armour.roll)} against ${against}`,
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

  const headline =
    injury.stunnedToReserves && injury.result === InjuryResult.STUNNED
      ? "Into the Reserves"
      : INJURY_HEADLINE[injury.result];
  return {
    headline,

    subtitle: headline === "Casualty" ? `${name} · ${injury.result}` : name,
    result: true,
  };
}

interface Tracked {
  seq: number;
  kind: RollOutcome["kind"];

  playerName: string;
  rollType: string;
  teamId?: string;
  outcome: ThrowOutcome;
}

export class RollBook {
  private throws: Tracked[] = [];

  queued(seq: number, rollType: string, teamId?: string): void {
    const roll = readRoll(rollType);
    if (roll)
      this.throws.push({
        seq,
        ...roll,
        rollType,
        ...(teamId === undefined ? {} : { teamId: teamId }),
        outcome: undefined,
      });
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

  text(seq: number, stage: "thrown" | "landed"): RollBannerText | null {
    const tracked = this.throws.find((t) => t.seq === seq);
    return tracked ? rollBannerText(tracked, stage, tracked.outcome) : null;
  }

  forget(seq: number): void {
    this.throws = this.throws.filter((t) => t.seq !== seq);
  }

  clear(): void {
    this.throws = [];
  }
}

function playerOf(playerId: string): { playerName: string } | undefined {
  if (!ServiceContainer.isInitialized()) return undefined;
  return ServiceContainer.getInstance().gameService.getPlayerById(playerId);
}
export class RollPresentation {
  private book = new RollBook();
  private showing: { seq: number; stage: "thrown" | "landed" } | null = null;
  private held: RollBannerText | null = null;
  private momentOn = false;
  private readonly setBanner: (banner: RollBannerText | null) => void;
  constructor(setBanner: (banner: RollBannerText | null) => void) {
    this.setBanner = setBanner;
  }

  private show = (text: RollBannerText | null) => {
    this.held = text;
    if (!this.momentOn) this.setBanner(text);
  };

  private decided = (outcome: RollOutcome) => {
    this.book.decided(outcome);
    const current = this.showing;
    const text = current && this.book.text(current.seq, current.stage);
    if (text) this.show(text);
  };

  onArmour = (data: ArmourOutcome) => {
    const player = playerOf(data.playerId);
    if (player)
      this.decided({ kind: "armour", playerName: player.playerName, ...data });
  };

  onInjury = (data: InjuryOutcome) => {
    const player = playerOf(data.playerId);
    if (player)
      this.decided({ kind: "injury", playerName: player.playerName, ...data });
  };

  onThrow = (data: Throw) => {
    switch (data.stage) {
      case "queued":
        this.book.queued(data.seq, data.rollType, data.teamId);
        return;
      case "dropped":
      case "done":
        this.book.forget(data.seq);
        if (this.showing?.seq === data.seq) {
          this.showing = null;
          this.show(null);
        }
        return;
      case "thrown":
      case "landed": {
        const text = this.book.text(data.seq, data.stage);
        if (!text) return;
        this.showing = { seq: data.seq, stage: data.stage };
        this.show(text);
        return;
      }
      default: {
        const unreachable: never = data.stage;
        return unreachable;
      }
    }
  };

  onMoment = (moment: GameEventMap[typeof GameEventNames.UI_PresentMoment]) => {
    this.momentOn = !!moment && moment.kind !== "turnover";
    this.setBanner(this.momentOn ? null : this.held);
  };

  onPhase = ({ phase }: GameEventMap[typeof GameEventNames.PhaseChanged]) => {
    if (phase !== GamePhase.SETUP) return;
    this.book.clear();
    this.showing = null;
    this.show(null);
  };
}

function rollPlayerName(name: string, outcome: ThrowOutcome): string {
  if (name) return name;
  return outcome && outcome !== "superseded" ? outcome.playerName : "";
}
