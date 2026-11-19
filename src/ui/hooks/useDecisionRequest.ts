import { useState } from "react";
import type { IEventBus } from "../../services/EventBus";
import type { DecisionRequest } from "../../types/decisions";
import { GameEventNames } from "../../types/events";
import { useEventBus } from "./useEventBus";
import { useAfterDice } from "./useAfterDice";
import { getActiveOnlineMatch } from "../../network/OnlineMatch";
import { ServiceContainer } from "../../services/ServiceContainer";

type DecisionType = DecisionRequest["type"];
type RequestOf<T extends DecisionType> = Extract<DecisionRequest, { type: T }>;

interface DecisionRequestOptions<T extends DecisionType> {
  type: T;
  accepts?: (request: RequestOf<T>) => boolean;
  onChange?: (request: RequestOf<T> | null) => void;
}

function isDecisionOf<T extends DecisionType>(
  data: DecisionRequest,
  type: T
): data is RequestOf<T> {
  return data.type === type;
}

function useDecisionRequest<T extends DecisionType>(
  eventBus: IEventBus,
  { type, accepts, onChange }: DecisionRequestOptions<T>
) {
  const [request, setRequest] = useState<RequestOf<T> | null>(null);
  const show = (next: RequestOf<T> | null) => {
    setRequest(next);
    onChange?.(next);
  };
  useEventBus(eventBus, GameEventNames.DecisionRequested, (data) => {
    if (isDecisionOf(data, type) && (accepts?.(data) ?? true)) show(data);
  });
  useEventBus(eventBus, GameEventNames.DecisionResolved, (resolved) => {
    if (resolved.type === type) show(null);
  });
  return [request, setRequest] as const;
}

const mayAct = () => getActiveOnlineMatch()?.mayAct() !== false;

export function useLandedDecision<T extends DecisionType>(
  eventBus: IEventBus,
  options: DecisionRequestOptions<T>
) {
  const [pending, setRequest] = useDecisionRequest(eventBus, options);
  const request = useAfterDice(eventBus, pending);
  const answer = (send: () => void) => {
    if (!mayAct()) return;
    send();
    setRequest(null);
  };
  return { request: mayAct() ? request : null, answer };
}

export function useGameDecision<T extends DecisionType>(
  eventBus: IEventBus,
  options: DecisionRequestOptions<T>
) {
  const [request, setRequest] = useDecisionRequest(eventBus, options);
  if (!request || !ServiceContainer.isInitialized() || !mayAct()) return null;
  const gameService = ServiceContainer.getInstance().gameService;
  return {
    request,
    gameService,
    name: (id: string) => gameService.getPlayerById(id)?.playerName ?? id,
    answer: (send: () => boolean) => {
      if (mayAct() && send()) setRequest(null);
    },
  };
}
