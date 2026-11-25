import { PitchNotice } from "../componentWarehouse/HudBanner";
import { kickoffTurnOf } from "../../../game/kickoff/kickRecord";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { GamePhase, SubPhase } from "../../../types/GameState";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { type Player } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { PhonePlanBar } from "./ActionPlanCard";
import { useActionPlan } from "./useActionPlan";

export function MovePlanBar({
  eventBus,
  phase,
  activeTeamId,
}: {
  eventBus: IEventBus;
  phase: GamePhase;
  activeTeamId: string | null;
}) {
  const plan = useActionPlan(eventBus);
  const [selected, setSelected] = useState<Player | null>(null);
  useEventBus(eventBus, GameEventNames.PlayerSelected, ({ player }) => {
    setSelected(player);
  });
  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setSelected(null);
  });

  const [, setKickoffTick] = useState(0);
  const bump = () => {
    setKickoffTick((tick) => tick + 1);
  };
  useEventBus(eventBus, GameEventNames.BallKicked, bump);
  useEventBus(eventBus, GameEventNames.KickoffEventStepStarted, bump);
  useEventBus(eventBus, GameEventNames.KickoffEventStepResolved, bump);
  useEventBus(eventBus, GameEventNames.KickoffTurnStarted, bump);
  useEventBus(eventBus, GameEventNames.KickoffTurnEnded, bump);

  if (isAimingKick(phase) && !getActiveOnlineMatch())
    return <MoveHint>Tap your kicker, then a square in their half</MoveHint>;
  if (!movesRun(phase)) return null;

  if (plan) return <PhonePlanBar eventBus={eventBus} plan={plan} />;

  const online = getActiveOnlineMatch();
  const mine = online ? online.myTeamId === activeTeamId : true;
  if (!mine) return null;
  return <MovePlanBarView selected={selected} activeTeamId={activeTeamId} />;
}

function movesRun(phase: GamePhase): boolean {
  if (phase === GamePhase.PLAY) return true;
  if (!ServiceContainer.isInitialized()) return false;
  const state = ServiceContainer.getInstance().gameService.getState();
  return kickoffTurnOf(state)?.play.kind === "actions";
}

function isAimingKick(phase: GamePhase): boolean {
  if (phase !== GamePhase.KICKOFF || !ServiceContainer.isInitialized())
    return false;
  const game = ServiceContainer.getInstance().gameService;
  return (
    game.getSubPhase() === SubPhase.ROLL_KICKOFF && !game.getKickoffEventStep()
  );
}

function MoveHint({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="move-hint"
      className="hud-slab whitespace-nowrap px-3.5 py-2 font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-gold pointer-events-none"
    >
      {children}
    </div>
  );
}

const NOTICE_MS = 2500;

export function PhoneNotice({ eventBus }: { eventBus: IEventBus }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  useEventBus(eventBus, GameEventNames.UI_Notification, (notice) => {
    setText(notice);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setText(null);
    }, NOTICE_MS);
  });
  if (!text) return null;
  return (
    <PitchNotice role="status" tone="gold" data-testid="phone-notice">
      {text}
    </PitchNotice>
  );
}

interface MovePlanBarViewProps {
  selected: Player | null;
  activeTeamId: string | null;
}
function MovePlanBarView({ selected, activeTeamId }: MovePlanBarViewProps) {
  return (
    <MoveHint>
      {selected?.teamId === activeTeamId
        ? "Tap a square or drag a route"
        : "Your turn · tap a player"}
    </MoveHint>
  );
}
