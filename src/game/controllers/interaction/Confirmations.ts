import type { IEventBus } from "@/services/EventBus";
import type { IGameService } from "@/services/interfaces/IGameService";
import type { Player } from "@/types/Player";
import type { RerollSource } from "@/types/decisions";
import { type AllEvents, GameEventNames } from "@/types/events";
import type { ActivationGate } from "../../skills/SkillRule";
import { availableRerolls } from "../../skills/rerolls";
import { rollLabel } from "../../rules/rollTargets";
import {
  type ClimbChoice,
  type StepRisk,
  stepRolls,
} from "../../rules/moveLegs";
import { ROUTE_ROLL_NAMES, type RouteRoll } from "../../rules/rollPreview";

type ConfirmationRequest = Omit<
  AllEvents[typeof GameEventNames.UI_RequestConfirmation],
  "actionId"
>;
interface Square {
  x: number;
  y: number;
}

export class Confirmations {
  private asked = 0;

  private open = new Set<() => void>();

  private readonly eventBus: IEventBus;
  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }

  async ask(prefix: string, request: ConfirmationRequest): Promise<boolean> {
    return (await this.choose(prefix, request)) === "confirm";
  }

  choose(
    prefix: string,
    request: ConfirmationRequest
  ): Promise<"confirm" | "alternative" | "cancel"> {
    const actionId = `${prefix}-${String(++this.asked)}`;
    return new Promise((resolve) => {
      const stopListening = () => {
        this.eventBus.off(GameEventNames.UI_ConfirmationResult, onResult);
        this.open.delete(stopListening);
      };
      const onResult = (data: {
        actionId: string;
        confirmed: boolean;
        alternative?: true;
      }) => {
        if (data.actionId !== actionId) return;
        stopListening();
        if (data.confirmed) resolve("confirm");
        else resolve(data.alternative ? "alternative" : "cancel");
      };
      this.open.add(stopListening);
      this.eventBus.on(GameEventNames.UI_ConfirmationResult, onResult);
      this.eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId,
        ...request,
      });
    });
  }

  dropAll(): void {
    for (const stopListening of this.open) {
      stopListening();
    }
  }
}

function stepTitle(rolls: RouteRoll[]): string {
  if (rolls.some((roll) => roll.type === "secureBall")) return "Secure the Ball";
  if (rolls.some((roll) => roll.type === "pickup")) return "Pick up";
  return rolls.map((roll) => rollName(roll.type)).join(" & ");
}

const rollName = (kind: RouteRoll["type"]) => ROUTE_ROLL_NAMES[kind];

type RerollArbiter = ReturnType<IGameService["getRerollArbiter"]>;

interface RerollLine {
  arbiter: RerollArbiter;
  teamId: string;
  skillSource: ReturnType<typeof availableRerolls>["skillSource"];
  target: number;

  which: string;

  either: boolean;
  forOne: string;
}

function namedReroll(name: string, line: RerollLine): string {
  return line.either
    ? `${name}, for ${line.forOne}`
    : `${name}: ${line.which}${String(line.target)}+`;
}

function teamRerollText(line: RerollLine): string {
  const next = line.arbiter.nextTeamReroll(line.teamId);
  switch (next) {
    case "free":
      return namedReroll("Brilliant Coaching free re-roll", line);
    case "leader":
      return namedReroll("Leader re-roll", line);
    case "team":
      return namedReroll(
        `team re-roll (${String(line.arbiter.teamRerollsLeftFor(line.teamId))} left)`,
        line
      );
    case null:
      return "No team re-roll available";
    default: {
      const exhaustive: never = next;
      return exhaustive;
    }
  }
}

function rerollText(source: RerollSource, line: RerollLine): string {
  switch (source) {
    case "skill":
      return `${String(line.skillSource)} re-roll: ${String(line.target)}+`;
    case "pro":
      return line.either
        ? `Pro needs 3+, for ${line.forOne}`
        : `Pro needs 3+, then ${line.which}${String(line.target)}+`;
    case "team":
      return teamRerollText(line);
    case "veteran":
      return namedReroll("Veteran re-roll", line);
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

function riskyStepRequest(
{ deps,player,square,risk }: { deps: { gameService: IGameService; eventBus: IEventBus; }; player: Player; square: Square; risk: StepRisk; }): ConfirmationRequest {
  const rolls = stepRolls(risk, square);
  const rollText = rolls
    .map((roll) => rollLabel(rollName(roll.type), roll.target))
    .join(", then ");
  const arbiter = deps.gameService.getRerollArbiter();

  const listed = new Set<RerollSource>();
  const offers = rolls.map((roll) => ({
    ...roll,
    offer: availableRerolls(
      { gameService: deps.gameService, eventBus: deps.eventBus },
      player,
      roll.type === "secureBall" ? "pickup" : roll.type,
      roll.type !== "secureBall"
    ),
  }));
  const rerolls = offers.flatMap(({ type, target, offer }) => {
    const sources = offer.sources.filter((source) => !listed.has(source));
    for (const source of sources) if (source !== "skill") listed.add(source);

    const which = rolls.length > 1 ? `${rollName(type)} ` : "";
    return sources.map((source) => {
      const covers = offers.filter((o) => o.offer.sources.includes(source));
      return rerollText(source, {
        arbiter,
        teamId: player.teamId,
        skillSource: offer.skillSource,
        target,
        which,
        either: covers.length > 1,
        forOne: `one of the ${String(["two", "three"][covers.length - 2] ?? covers.length)} rolls`,
      });
    });
  });
  const title = stepTitle(rolls);
  return {
    title: `${player.playerName}: ${title}`,
    chooserTeamId: player.teamId,
    step: {
      playerId: player.id,
      rolls: rolls.map(({ type, target }) => ({ type, target })),
    },
    message:
      `${rollText}. ${rolls.some((roll) => roll.type === "pickup" || roll.type === "secureBall") ? "A fail" : "A fall"} is a turnover.\n` +
      (rerolls.length > 0
        ? `Re-rolls: ${rerolls.join(", ")}.`
        : "No re-roll available."),
    confirmLabel: `${title}!`,
    cancelLabel: "Stop here",
    risky: true,
  };
}

export function climbRequest({
  deps,
  player,
  square,
  climb,
}: {
  deps: { gameService: IGameService; eventBus: IEventBus };
  player: Player;
  square: Square;
  climb: ClimbChoice;
}): ConfirmationRequest {
  const reckless = riskyStepRequest({ deps, player, square, risk: climb.reckless });
  const safeRolls = climb.safe
    ? stepRolls(climb.safe, square)
        .map((roll) => rollLabel(rollName(roll.type), roll.target))
        .join(", then ")
    : null;
  return {
    ...reckless,
    title: `${player.playerName}: Barricade`,
    message:
      `Climb Safely: 2 more squares of Movement, ${safeRolls ? `then ${safeRolls}` : "no roll"}.\n` +
      `Go Recklessly: ${reckless.message}`,
    confirmLabel: "Climb Safely",
    alternativeLabel: "Go Recklessly!",
    cancelLabel: "Stop here",
    risky: false,
  };
}

export const GATE_FAILURE_TEXT: Record<ActivationGate["onFail"]["kind"], string> = {
  distracted: "On a fail they are Distracted and the activation ends.",
  endActivation: "On a fail the activation ends.",
  rooted: "On a fail they are Rooted and cannot leave their square.",
  lashOut:
    "On a fail they lash out at a Standing team-mate next to them. With none beside them, the activation ends.",
  squigRage:
    "On a fail they Block an adjacent opponent, lash out at a team-mate, or become Distracted.",
  bloodlust:
    "On a fail they may switch to a Move, and must bite a Thrall before the activation ends.",
};

export const gateNeed = (gate: ActivationGate): number =>
  Math.max(2, gate.target - gate.modifier);

export function gateRequest(
  player: Player,
  gates: ActivationGate[]
): ConfirmationRequest {
  const lines = gates.map(
    (gate) =>
      `${rollLabel(gate.skill, gateNeed(gate))}. ${GATE_FAILURE_TEXT[gate.onFail.kind]}`
  );
  lines.push("Once rolled, the action cannot be changed.");
  return {
    title: `${player.playerName} must roll first`,
    message: lines.join("\n"),
    confirmLabel: "Roll",
    cancelLabel: "Cancel",
    risky: true,
    chooserTeamId: player.teamId,
  };
}
