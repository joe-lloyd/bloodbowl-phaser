import { useEffect, useRef, useState } from "react";
import { IEventBus } from "../../../services/EventBus";
import { GameEventNames, UIEvents } from "../../../types/events";
import { GamePhase, SubPhase } from "../../../types/GameState";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { Player } from "../../../types/Player";
import { useEventBus } from "../../hooks/useEventBus";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { hudButtonClass } from "../componentWarehouse/HudKit";

const ROLL_NAMES = { dodge: "Dodge", rush: "Rush", pickup: "Pick up" };

/**
 * The phone's bottom bar. With a route plotted it sums it up (squares and
 * the target of each roll, never the odds) beside Go and a clear button;
 * Go walks it, as tapping its last square again does. A throw aimed with
 * a first tap shows its rolls the same way, beside Throw. With nothing
 * plotted it says what a tap does next on the coach's own turn.
 */
export function MovePlanBar({
  eventBus,
  phase,
  activeTeamId,
}: {
  eventBus: IEventBus;
  phase: GamePhase;
  activeTeamId: string | null;
}) {
  const [plan, setPlan] = useState<UIEvents[GameEventNames.UI_MovePlan]>(null);
  const [aim, setAim] = useState<UIEvents[GameEventNames.UI_ThrowAim]>(null);
  const [selected, setSelected] = useState<Player | null>(null);
  useEventBus(eventBus, GameEventNames.UI_MovePlan, setPlan);
  useEventBus(eventBus, GameEventNames.UI_ThrowAim, setAim);
  useEventBus(eventBus, GameEventNames.PlayerSelected, ({ player }) =>
    setSelected(player)
  );
  useEventBus(eventBus, GameEventNames.TurnStarted, () => {
    setPlan(null);
    setAim(null);
    setSelected(null);
  });
  // The kick and a kickoff event's own steps change what a tap does
  const [, setKickoffTick] = useState(0);
  const bump = () => setKickoffTick((tick) => tick + 1);
  useEventBus(eventBus, GameEventNames.BallKicked, bump);
  useEventBus(eventBus, GameEventNames.KickoffEventStepStarted, bump);
  useEventBus(eventBus, GameEventNames.KickoffEventStepResolved, bump);

  const game = ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService
    : null;
  const aimingKick =
    phase === GamePhase.KICKOFF &&
    game?.getSubPhase() === SubPhase.ROLL_KICKOFF &&
    !game.getKickoffEventStep();
  if (aimingKick && !getActiveOnlineMatch())
    return (
      <div
        data-testid="move-hint"
        className="hud-slab whitespace-nowrap px-3.5 py-2 font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-gold pointer-events-none"
      >
        Tap your kicker, then a square in their half
      </div>
    );
  if (phase !== GamePhase.PLAY) return null;

  const clear = (
    <button
      type="button"
      data-testid="move-plan-clear"
      aria-label={aim ? "Clear the aim" : "Clear the route"}
      onClick={() => eventBus.emit(GameEventNames.UI_ClearMovePlan)}
      className={`${hudButtonClass("ghost", "md")} h-11 w-11 !px-0 text-hud-lg`}
    >
      ✕
    </button>
  );
  const go = (label: string) => (
    <button
      type="button"
      data-testid="move-plan-go"
      onClick={() => eventBus.emit(GameEventNames.UI_GoMovePlan)}
      className={`${hudButtonClass("gold", "md")} h-11 min-w-[78px] font-hud-display !text-hud-lg !font-normal`}
    >
      {label}
    </button>
  );

  if (aim) {
    return (
      <div
        data-testid="move-plan"
        className="hud-slab flex items-center gap-2 py-1.5 pl-3 pr-1.5 pointer-events-auto animate-hud-in"
      >
        <div className="min-w-0 max-w-[44vw]">
          <div className="hud-label text-hud-2xs text-hud-gold">Throw</div>
          {(aim.lines.length ? aim.lines : ["Throw here"]).map((line, i) => (
            <div
              key={i}
              className={`truncate font-hud-label leading-tight ${
                i === 0
                  ? "text-hud-base font-bold text-hud-bone"
                  : "text-hud-xs font-semibold text-hud-dim"
              }`}
            >
              {line}
            </div>
          ))}
        </div>
        {clear}
        {go("Throw")}
      </div>
    );
  }

  if (plan) {
    const rolls = plan.rolls.map((r) => `${ROLL_NAMES[r.type]} ${r.target}+`);
    return (
      <div
        data-testid="move-plan"
        className="hud-slab flex items-center gap-2 py-1.5 pl-3 pr-1.5 pointer-events-auto animate-hud-in"
      >
        <div className="min-w-0 max-w-[40vw]">
          <div className="hud-label text-hud-2xs text-hud-gold">Move</div>
          <div className="truncate font-hud-label text-hud-base font-bold leading-tight text-hud-bone">
            {plan.squares} sq · {rolls.length ? rolls.join(" · ") : "No rolls"}
          </div>
        </div>
        {clear}
        {go("Go")}
      </div>
    );
  }

  const online = getActiveOnlineMatch();
  const mine = online ? online.myTeamId === activeTeamId : true;
  if (!mine) return null;
  return (
    <div
      data-testid="move-hint"
      className="hud-slab whitespace-nowrap px-3.5 py-2 font-hud-label text-hud-sm font-bold uppercase tracking-[0.08em] text-hud-gold pointer-events-none"
    >
      {selected?.teamId === activeTeamId
        ? "Tap a square or drag a route"
        : "Your turn · tap a player"}
    </div>
  );
}

/** How long a notice from the game stays up on a phone. */
const NOTICE_MS = 2500;

/**
 * The game's short notices ("Kick to opponent's half!", "Finish your Blitz
 * Action first!") on a phone, where the dice log that also lists them is
 * shut. The latest one shows for a moment above the bottom bar.
 */
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
    timer.current = setTimeout(() => setText(null), NOTICE_MS);
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
