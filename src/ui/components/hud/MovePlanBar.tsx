import { type ReactNode, useEffect, useRef, useState } from "react";
import { type IEventBus } from "../../../services/EventBus";
import { GameEventNames } from "../../../types/events";
import { GamePhase, SubPhase } from "../../../types/GameState";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { type Player } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { PlanButtons } from "./ActionPlanCard";
import { planRollList, useActionPlan } from "./useActionPlan";

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

  if (isAimingKick(phase) && !getActiveOnlineMatch())
    return <MoveHint>Tap your kicker, then a square in their half</MoveHint>;
  if (phase !== GamePhase.PLAY) return null;

  if (plan) {
    return (
      <div
        data-testid="action-plan"
        className="hud-slab flex items-center gap-2 py-1.5 pl-3 pr-1.5 pointer-events-auto animate-hud-in"
      >
        <div className="min-w-0 max-w-[44vw]">
          <div className="hud-label text-hud-2xs text-hud-gold">{plan.title}</div>
          <div className="truncate font-hud-label text-hud-sm font-bold leading-tight text-hud-bone">
            {plan.blocked ?? planRollList(plan)}
          </div>
        </div>
        <PlanButtons eventBus={eventBus} plan={plan} size="md" />
      </div>
    );
  }

  const online = getActiveOnlineMatch();
  const mine = online ? online.myTeamId === activeTeamId : true;
  if (!mine) return null;
  return <MovePlanBarView selected={selected} activeTeamId={activeTeamId} />;
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
    <div
      role="status"
      data-testid="phone-notice"
      className="max-w-[60vw] rounded-hud border border-hud-gold/50 bg-hud-ink/95 px-3 py-1.5 text-center font-hud-label text-hud-sm font-bold text-hud-bone shadow-hud animate-hud-in"
    >
      {text}
    </div>
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
