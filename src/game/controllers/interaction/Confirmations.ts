import type { IEventBus } from "@/services/EventBus";
import type { IGameService } from "@/services/interfaces/IGameService";
import type { Player } from "@/types/Player";
import type { RerollSource } from "@/types/decisions";
import { AllEvents, GameEventNames } from "@/types/events";
import type { ActivationGate } from "../../skills/SkillRule";
import { availableRerolls } from "../../skills/rerolls";
import { rollLabel } from "../../rules/rollTargets";
import { StepRisk, stepRolls } from "../../rules/moveLegs";
import { foulPreview, RouteRoll } from "../../rules/rollPreview";

type ConfirmationRequest = Omit<
  AllEvents[GameEventNames.UI_RequestConfirmation],
  "actionId"
>;
type Square = { x: number; y: number };

/**
 * The yes-or-no questions the board asks the coach. Each is numbered so a
 * stale answer cannot match, and one still open is dropped on destroy.
 */
export class Confirmations {
  /** Numbers each prompt so a stale answer cannot match. */
  private asked = 0;
  /** Confirms still waiting for an answer, each dropped on destroy. */
  private open = new Set<() => void>();

  constructor(private readonly eventBus: IEventBus) {}

  /** Ask the coach a yes or no question; resolves with their answer. */
  ask(prefix: string, request: ConfirmationRequest): Promise<boolean> {
    const actionId = `${prefix}-${++this.asked}`;
    return new Promise((resolve) => {
      const stopListening = () => {
        this.eventBus.off(GameEventNames.UI_ConfirmationResult, onResult);
        this.open.delete(stopListening);
      };
      const onResult = (data: { actionId: string; confirmed: boolean }) => {
        if (data.actionId !== actionId) return;
        stopListening();
        resolve(data.confirmed);
      };
      this.open.add(stopListening);
      this.eventBus.on(GameEventNames.UI_ConfirmationResult, onResult);
      this.eventBus.emit(GameEventNames.UI_RequestConfirmation, {
        actionId,
        ...request,
      });
    });
  }

  /**
   * A question still open is dropped, never answered: whatever waited on
   * it (a Move, a Dodge, a declaration) must not carry on without a board
   */
  dropAll(): void {
    [...this.open].forEach((stopListening) => stopListening());
  }
}

const rollName = (kind: RouteRoll["type"]) =>
  kind === "pickup" ? "Pick up" : kind === "dodge" ? "Dodge" : "Rush";

type RerollArbiter = ReturnType<IGameService["getRerollArbiter"]>;

/** What one re-roll line needs to know about the roll it is listed for. */
interface RerollLine {
  arbiter: RerollArbiter;
  teamId: string;
  skillSource: ReturnType<typeof availableRerolls>["skillSource"];
  target: number;
  /** The roll's name when the step has more than one, else empty. */
  which: string;
  /** The source covers more than one of the step's rolls. */
  either: boolean;
  forOne: string;
}

/** A re-roll for either roll names how many; one for this roll, its target. */
function namedReroll(name: string, line: RerollLine): string {
  return line.either
    ? `${name}, for ${line.forOne}`
    : `${name}: ${line.which}${line.target}+`;
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
        `team re-roll (${line.arbiter.teamRerollsLeftFor(line.teamId)} left)`,
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
      return `${line.skillSource} re-roll: ${line.target}+`;
    case "pro":
      return line.either
        ? `Pro needs 3+, for ${line.forOne}`
        : `Pro needs 3+, then ${line.which}${line.target}+`;
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

/** Ask before a Dodge or Rush: what it needs and what can re-roll it. */
export function riskyStepRequest(
  deps: { gameService: IGameService; eventBus: IEventBus },
  player: Player,
  square: Square,
  risk: StepRisk
): ConfirmationRequest {
  const rolls = stepRolls(risk, square);
  const rollText = rolls
    .map((roll) => rollLabel(rollName(roll.type), roll.target))
    .join(", then ");
  const arbiter = deps.gameService.getRerollArbiter();
  // A team re-roll, Pro and Veteran each save one roll: with two rolls
  // each is listed once, for either of them. A skill re-roll belongs to
  // its own roll, as Dodge and Sure Hands are different skills.
  const listed = new Set<RerollSource>();
  const offers = rolls.map((roll) => ({
    ...roll,
    offer: availableRerolls(
      { gameService: deps.gameService, eventBus: deps.eventBus },
      player,
      roll.type
    ),
  }));
  const rerolls = offers.flatMap(({ type, target, offer }) => {
    const sources = offer.sources.filter((source) => !listed.has(source));
    for (const source of sources) if (source !== "skill") listed.add(source);
    // Veteran covers some rolls and not others: name the one it covers
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
        forOne: `one of the ${["two", "three"][covers.length - 2] ?? covers.length} rolls`,
      });
    });
  });
  const title =
    risk.kind === "dodge"
      ? "Dodge"
      : risk.kind === "rush"
        ? "Rush"
        : risk.kind === "rush-dodge"
          ? "Rush & Dodge"
          : "Pick up";
  return {
    title: `${player.playerName}: ${title}`,
    chooserTeamId: player.teamId,
    step: {
      playerId: player.id,
      rolls: rolls.map(({ type, target }) => ({ type, target })),
    },
    message:
      `${rollText}. ${rolls.some((roll) => roll.type === "pickup") ? "A fail" : "A fall"} is a turnover.\n` +
      (rerolls.length
        ? `Re-rolls: ${rerolls.join(", ")}.`
        : "No re-roll available."),
    confirmLabel: `${title}!`,
    cancelLabel: "Stop here",
    risky: true,
  };
}

/** What a failed negatrait roll does, as the confirm before it says. */
const GATE_FAILURE_TEXT: Record<ActivationGate["onFail"]["kind"], string> = {
  distracted: "On a fail they are Distracted and the activation ends.",
  endActivation: "On a fail the activation ends.",
  rooted: "On a fail they are Rooted and cannot leave their square.",
  lashOut:
    "On a fail they lash out at a Standing team-mate next to them. With none beside them, the activation ends.",
  bloodlust:
    "On a fail they may switch to a Move, and must bite a Thrall before the activation ends.",
};

/** The negatrait rolls a declaration makes, asked before it is made. */
export function gateRequest(
  player: Player,
  gates: ActivationGate[]
): ConfirmationRequest {
  const lines = gates.map(
    (gate) =>
      `${rollLabel(gate.skill, Math.max(2, gate.target - gate.modifier))}. ${GATE_FAILURE_TEXT[gate.onFail.kind]}`
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

export function foulRequest(
  fouler: Player,
  foul: ReturnType<typeof foulPreview>
): ConfirmationRequest {
  return {
    title: "Confirm foul",
    message: foul.lines.join("\n"),
    confirmLabel: "Foul!",
    cancelLabel: "Cancel",
    risky: true,
    // Online, the other coach sees the foul read-only
    chooserTeamId: fouler.teamId,
    step: {
      playerId: fouler.id,
      rolls: [{ type: "armour", target: foul.targetNumber }],
    },
  };
}
