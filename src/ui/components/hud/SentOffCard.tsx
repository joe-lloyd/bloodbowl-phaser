import React, { useEffect, useRef, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames, type RefereeCallStep } from "../../../types/events";
import { type ReactionDecisionRequest } from "../../../types/decisions";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import { BRIBE_DECISION, bribesLeft } from "../../../game/inducements/bribes";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../componentWarehouse/HudKit";
import { DecisionTeam } from "./DecisionTeam";
import {
  ARGUE_TARGET,
  BRIBE_TARGET,
  argueDice,
  arguedLine,
  bribeOffer,
  bribedLine,
  calledLine,
  outcomeLine,
} from "./sentOffText";

const OUTCOME_READ_MS = 2600;

type Step = RefereeCallStep;
type Argued = Extract<Step, { step: "argued" }>;
type Bribed = Extract<Step, { step: "bribed" }>;
type Outcome = Extract<Step, { step: "outcome" }>;

interface Card {
  playerId: string;
  teamId: string;
  cause: Step["cause"];
  argued?: Argued;
  bribed?: Bribed;
  outcome?: Outcome;

  bribeAsk?: ReactionDecisionRequest;
}

export const SentOffCard: React.FC<{ eventBus: EventBus }> = ({ eventBus }) => {
  const [card, setCard] = useState<Card | null>(null);
  const dice = DiceWatch.shared(eventBus);

  const chain = useRef<Promise<void>>(Promise.resolve());
  const later = (apply: (card: Card | null) => Card | null) => {
    const landed = dice.landed();
    chain.current = chain.current
      .then(() => landed)
      .then(() => {
        setCard(apply);
      });
  };

  useEventBus(eventBus, GameEventNames.RefereeCall, (step) => {
    later((current) => {
      if (step.step === "called")
        return {
          playerId: step.playerId,
          teamId: step.teamId,
          cause: step.cause,
        };
      if (!current || current.playerId !== step.playerId) return current;
      switch (step.step) {
        case "argued":
          return { ...current, argued: step };
        case "bribed":
          return withoutBribeAsk({ ...current, bribed: step });
        case "outcome":
          return { ...current, outcome: step };
      }
    });
  });

  useEventBus(eventBus, GameEventNames.DecisionRequested, (request) => {
    if (request.type !== "reaction" || request.skill !== BRIBE_DECISION) return;
    later((current) =>
      current && current.playerId === request.playerId
        ? { ...current, bribeAsk: request }
        : current
    );
  });

  useEventBus(eventBus, GameEventNames.DecisionResolved, ({ type }) => {
    if (type !== "reaction") return;
    later((current) =>
      current?.bribeAsk ? withoutBribeAsk(current) : current
    );
  });

  const outcomeId = card?.outcome?.presentationId;
  const finish = () => {
    if (outcomeId)
      eventBus.emit(GameEventNames.UI_PresentationAcknowledged, {
        id: outcomeId,
      });
    setCard(null);
  };
  useEffect(() => {
    if (!outcomeId) return;
    const timer = setTimeout(finish, OUTCOME_READ_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [outcomeId]);

  if (!card || !ServiceContainer.isInitialized()) return null;
  const stays = card.outcome && card.outcome.result !== "sent-off";
  return (
    <DialogShell
      testId="sent-off-card"
      placement="dock"
      tone={stays ? "good" : "blood"}
      eyebrow={<DecisionTeam teamId={card.teamId} />}
      title="SENT-OFF!"
      actions={
        <CardActions card={card} eventBus={eventBus} onContinue={finish} />
      }
    >
      <CardSteps card={card} />
    </DialogShell>
  );
};

function CardActions({
  card,
  eventBus,
  onContinue,
}: {
  card: Card;
  eventBus: EventBus;
  onContinue: () => void;
}) {
  if (card.bribeAsk) {
    const team = ServiceContainer.getInstance().gameService.getTeam(
      card.teamId
    );
    return (
      <BribeChoice eventBus={eventBus} teamName={team?.name ?? "The coach"} />
    );
  }
  if (!card.outcome) return null;
  return (
    <DialogActions>
      <HudButton
        data-testid="sent-off-continue"
        variant="primary"
        hotkey="Enter"
        onClick={onContinue}
      >
        CONTINUE
      </HudButton>
    </DialogActions>
  );
}

function CardSteps({ card }: { card: Card }) {
  const { gameService } = ServiceContainer.getInstance();
  const name =
    gameService.getPlayerById(card.playerId)?.playerName ?? "The player";
  const { argued, bribed, outcome } = card;
  const bribeLine = bribed
    ? bribedLine(name, bribed)
    : bribeOffer(
        name,
        card.cause,
        bribesLeft(gameService.getState(), card.teamId)
      );
  return (
    <>
      <p>{calledLine(name, card.cause)}</p>
      <ol className="mt-3 space-y-2">
        <RollRow
          testId="sent-off-argue"
          label="Argue the Call"
          target={ARGUE_TARGET}
          {...(argued
            ? { dice: argueDice(argued), line: arguedLine(name, argued) }
            : {})}
          {...(argued?.swayed === undefined ? {} : { good: argued?.swayed })}
        />
        {(card.bribeAsk || bribed) && (
          <RollRow
            testId="sent-off-bribe"
            label="Bribe"
            target={BRIBE_TARGET}
            {...(bribed ? { dice: String(bribed.roll) } : {})}
            {...(bribed?.works === undefined ? {} : { good: bribed?.works })}
            line={bribeLine}
          />
        )}
      </ol>
      {outcome && (
        <p
          data-testid="sent-off-outcome"
          className={`mt-3 animate-hud-in font-hud-display text-hud-xl uppercase tracking-[0.02em] ${
            outcome.result === "sent-off"
              ? "text-hud-blood-hot"
              : "text-hud-good"
          }`}
        >
          {outcomeLine(name, outcome)}
        </p>
      )}
    </>
  );
}

function RollRow({
  testId,
  label,
  target,
  dice,
  good,
  line,
}: {
  testId: string;
  label: string;
  target: string;
  dice?: string;
  good?: boolean;
  line?: string;
}) {
  return (
    <li
      data-testid={testId}
      className="rounded-hud border border-white/10 bg-black/20 px-3 py-2"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.04em] text-hud-bone">
          {label} <span className="text-hud-gold">{target}</span>
        </span>
        <span
          className={`font-hud-label text-hud-lg font-bold tabular-nums ${
            dice === undefined
              ? "text-hud-dim"
              : good
                ? "text-hud-good"
                : "text-hud-bad"
          }`}
        >
          {dice ?? "…"}
        </span>
      </div>
      {line && <p className="mt-1 text-hud-sm text-hud-dim">{line}</p>}
    </li>
  );
}

function BribeChoice({
  eventBus,
  teamName,
}: {
  eventBus: EventBus;
  teamName: string;
}) {
  if (getActiveOnlineMatch()?.mayAct() === false)
    return (
      <p className="font-hud-label font-bold uppercase tracking-[0.06em] text-hud-dim">
        {teamName} is deciding on a Bribe…
      </p>
    );
  const answer = (accept: boolean) => {
    eventBus.emit(GameEventNames.UI_ReactionResponse, { accept });
  };
  return (
    <DialogActions>
      <HudButton
        data-testid="bribe-no"
        variant="ghost"
        hotkey="n"
        onClick={() => {
          answer(false);
        }}
      >
        NO BRIBE
      </HudButton>
      <HudButton
        data-testid="bribe-yes"
        variant="gold"
        hotkey="y"
        onClick={() => {
          answer(true);
        }}
      >
        USE A BRIBE
      </HudButton>
    </DialogActions>
  );
}

function withoutBribeAsk(card: Card): Card {
  const next = { ...card };
  delete next.bribeAsk;
  return next;
}
