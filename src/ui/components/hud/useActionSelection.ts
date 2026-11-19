import { useReducer, useState } from "react";
import type { EventBus } from "../../../services/EventBus";
import type { Player } from "../../../types/Player";
import { GameEventNames, type UIEvents } from "../../../types/events";
import { useEventBus } from "../../hooks/useEventBus";
import { useMovementFlag, type MenuTurnData } from "./useActionMenu";

type Steps = UIEvents[typeof GameEventNames.UI_UpdateActionSteps];
interface Selection {
  player: Player | null;
  steps: Steps["steps"];
  currentStepId: string | null;
  revision: number;
}
type Change =
  | { type: "select"; player: Player | null }
  | { type: "steps"; steps: Steps["steps"]; currentStepId: string | null }
  | { type: "close" }
  | { type: "refresh" };

function selectionReducer(state: Selection, change: Change): Selection {
  switch (change.type) {
    case "select":
      return { ...state, player: change.player };
    case "steps":
      return {
        ...state,
        steps: change.steps,
        currentStepId: change.currentStepId,
      };
    case "close":
      return { ...state, player: null, steps: [], currentStepId: null };
    case "refresh":
      return { ...state, revision: state.revision + 1 };
  }
}

export function useActionSelection(eventBus: EventBus, turnData: MenuTurnData) {
  const [state, dispatch] = useReducer(selectionReducer, {
    player: null,
    steps: [],
    currentStepId: null,
    revision: 0,
  });
  const [hasMovedInAction, setMoved] = useMovementFlag(state.player, turnData);
  const [razzleOn, setRazzleOn] = useState(false);
  const refresh = () => {
    dispatch({ type: "refresh" });
  };
  const clearSteps = () => {
    dispatch({ type: "steps", steps: [], currentStepId: null });
  };
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    if (data.player && data.player.id === state.player?.id) {
      refresh();
      return;
    }
    if (data.player?.id !== state.player?.id) {
      clearSteps();
      setMoved(false);
      setRazzleOn(false);
    }
    dispatch({ type: "select", player: data.player });
  });
  useEventBus(eventBus, GameEventNames.UI_UpdateActionSteps, (data) => {
    if (data.steps.length > 0)
      dispatch({
        type: "steps",
        steps: data.steps,
        currentStepId: data.currentStepId,
      });
    else {
      clearSteps();
      setMoved(false);
    }
  });
  useEventBus(eventBus, GameEventNames.PlayerMovedInAction, (data) => {
    if (state.player?.id === data.playerId) setMoved(true);
  });
  useEventBus(eventBus, GameEventNames.PlayerMoved, refresh);
  useEventBus(eventBus, GameEventNames.PlayerStatusChanged, refresh);
  useEventBus(eventBus, GameEventNames.PlayerKnockedDown, refresh);
  useEventBus(eventBus, GameEventNames.BallPlaced, refresh);
  const close = () => {
    dispatch({ type: "close" });
  };
  useEventBus(eventBus, GameEventNames.TurnStarted, close);
  useEventBus(eventBus, GameEventNames.Turnover, close);
  return {
    selectedPlayer: state.player,
    actionSteps: state.steps,
    currentStepId: state.currentStepId,
    hasMovedInAction,
    razzleOn,
    setRazzleOn,
  };
}
