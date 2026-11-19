import { useEffect, useRef, useState } from "react";
import type { Player } from "../../../types/Player";
import type { SidelineCrewInfo } from "../../../game/presentation/sidelineStaff";
import type { EventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { DiceWatch } from "../../../game/presentation/diceWatch";
import { useEventBus } from "../../hooks/useEventBus";

export type StatusView = Pick<Player, "status" | "injuries">;
const statusView = (player: Player): StatusView => ({
  status: player.status,
  injuries: [...player.injuries],
});

export function useInfoSubjects(eventBus: EventBus, phone: boolean) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);
  const [hoveredCrew, setHoveredCrew] = useState<SidelineCrewInfo | null>(null);
  const [chipOpened, setChipOpened] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const cardShown = phone && (chipOpened || !!hoveredPlayer || !!hoveredCrew);
  useDismissInfoCard(
    cardShown,
    { cardRef, chipRef },
    { setHoveredPlayer, setHoveredCrew, setChipOpened }
  );
  const clearHover = () => {
    setHoveredPlayer(null);
    setHoveredCrew(null);
  };
  useEventBus(eventBus, GameEventNames.UI_ShowPlayerInfo, (player) => {
    setHoveredPlayer(player);
    setHoveredCrew(null);
  });
  useEventBus(eventBus, GameEventNames.UI_ShowInfo, (subject) => {
    if (subject.kind === "player") {
      setHoveredPlayer(subject.player);
      setHoveredCrew(null);
    } else {
      setHoveredCrew(subject.crew);
      setHoveredPlayer(null);
    }
  });
  useEventBus(eventBus, GameEventNames.UI_HidePlayerInfo, clearHover);
  useEventBus(eventBus, GameEventNames.TurnStarted, clearHover);
  useEventBus(eventBus, GameEventNames.PlayerSelected, (data) => {
    setSelectedPlayer(data.player);
    setChipOpened(false);
  });
  return {
    selectedPlayer,
    hoveredPlayer,
    hoveredCrew,
    chipOpened,
    setChipOpened,
    setHoveredPlayer,
    setHoveredCrew,
    cardRef,
    chipRef,
    cardShown,
  };
}

type Subjects = ReturnType<typeof useInfoSubjects>;
function useDismissInfoCard(
  cardShown: boolean,
  { cardRef, chipRef }: Pick<Subjects, "cardRef" | "chipRef">,
  {
    setHoveredPlayer,
    setHoveredCrew,
    setChipOpened,
  }: Pick<Subjects, "setHoveredPlayer" | "setHoveredCrew" | "setChipOpened">
) {
  useEffect(() => {
    if (!cardShown) return;
    const putAway = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || cardRef.current?.contains(target))
        return;
      if (chipRef.current?.contains(target)) {
        setHoveredPlayer(null);
        setHoveredCrew(null);
        return;
      }
      setChipOpened(false);
      setHoveredPlayer(null);
      setHoveredCrew(null);
    };
    window.addEventListener("pointerdown", putAway, true);
    return () => {
      window.removeEventListener("pointerdown", putAway, true);
    };
  }, [
    cardShown,
    cardRef,
    chipRef,
    setHoveredPlayer,
    setHoveredCrew,
    setChipOpened,
  ]);
}

export function useHeldStatuses(eventBus: EventBus) {
  const atThrow = useRef(new Map<number, Map<string, StatusView>>());
  const [heldSnapshots, setHeldSnapshots] = useState<
    Map<number, Map<string, StatusView>>
  >(() => new Map());
  const lastThrown = useRef(0);
  const dice = DiceWatch.shared(eventBus);
  const releaseThrough = (seq: number) => {
    for (const key of atThrow.current.keys())
      if (key <= seq) atThrow.current.delete(key);
    setHeldSnapshots(new Map(atThrow.current));
  };
  useEventBus(
    eventBus,
    GameEventNames.UI_DiceInAir,
    ({ thrown, landedThrough }) => {
      if (thrown > lastThrown.current && ServiceContainer.isInitialized()) {
        const now = new Map(
          ServiceContainer.getInstance()
            .gameService.getTeams()
            .flatMap((team) => team.players)
            .map((player) => [player.id, statusView(player)])
        );
        for (let seq = lastThrown.current + 1; seq <= thrown; seq++)
          atThrow.current.set(seq, now);
        queueMicrotask(
          () =>
            void dice.landed().then(() => {
              releaseThrough(thrown);
            })
        );
      }
      lastThrown.current = Math.max(lastThrown.current, thrown);
      releaseThrough(landedThrough);
    }
  );
  const forgetHeld = () => {
    atThrow.current.clear();
    setHeldSnapshots(new Map());
  };
  useEventBus(eventBus, GameEventNames.GameStateRestored, forgetHeld);
  useEventBus(eventBus, GameEventNames.ScenarioLoaded, forgetHeld);
  return (player: Player): StatusView => {
    const first = heldSnapshots.values().next();
    return (
      (first.done ? undefined : first.value.get(player.id)) ??
      statusView(player)
    );
  };
}

export function useInfoUpdates(eventBus: EventBus): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setTick((value) => value + 1);
    };
    const events = [
      GameEventNames.PlayerStatusChanged,
      GameEventNames.PlayerMoved,
      GameEventNames.PlayerActivated,
      GameEventNames.TurnDataUpdated,
      GameEventNames.TurnStarted,
      GameEventNames.ActionResolved,
      GameEventNames.BallPickup,
      GameEventNames.BallPlaced,
      GameEventNames.BallScattered,
      GameEventNames.DriveEffectExpired,
      GameEventNames.DriveEffectGranted,
    ] as const;
    events.forEach((event) => {
      eventBus.on(event, refresh);
    });
    return () => {
      events.forEach((event) => {
        eventBus.off(event, refresh);
      });
    };
  }, [eventBus]);
}
