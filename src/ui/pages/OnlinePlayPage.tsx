import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GamePage } from "./GamePage";
import { useAuth } from "../hooks/useAuth";
import { fetchLobby } from "../../firebase/lobby";
import {
  createOnlineMatch,
  setActiveOnlineMatch,
  OnlineMatch,
} from "../../network/OnlineMatch";
import { GamePhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";

interface OnlinePlayPageProps {
  eventBus: EventBus;
}

/**
 * Boots an online match: builds the network session for this player's role
 * (which also initializes the ServiceContainer), and only then mounts the
 * regular GamePage on top of it. Shows a waiting banner whenever the
 * opponent owns the current turn or decision.
 */
export function OnlinePlayPage({ eventBus }: OnlinePlayPageProps) {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const matchRef = useRef<OnlineMatch | null>(null);
  const [match, setMatch] = useState<OnlineMatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !user || matchRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const lobby = await fetchLobby(code);
        if (!lobby) throw new Error("Match not found.");
        if (lobby.status !== "active")
          throw new Error("This match has not started (or is over).");
        if (cancelled) return;

        // Must exist before GamePage mounts: it initializes ServiceContainer
        // with the right engine (host: native + protocol bridge; guest:
        // networked proxy over a passive replica).
        const created = createOnlineMatch({ lobby, user, eventBus });
        created.onFatalError((message) => setError(message));
        matchRef.current = created;
        setActiveOnlineMatch(created);
        setMatch(created);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      matchRef.current?.close();
      matchRef.current = null;
      setActiveOnlineMatch(null);
    };
  }, [code, user, eventBus]);

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-bb-parchment">
        <p className="text-bb-deep-crimson text-xl font-body">{error}</p>
        <button
          className="underline font-body"
          onClick={() => navigate("/")}
        >
          Back to menu
        </button>
      </div>
    );
  }

  if (!user || !match) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bb-parchment">
        <p className="font-body text-xl">Connecting to match…</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <GamePage eventBus={eventBus} mode="normal" teams={match.teams} />
      <WaitingBanner match={match} />
    </div>
  );
}

/** Non-blocking indicator naming whose action/decision the game awaits. */
function WaitingBanner({ match }: { match: OnlineMatch }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const phase = ServiceContainer.isInitialized()
        ? ServiceContainer.getInstance().gameService.getPhase()
        : null;
      const waiting = phase !== GamePhase.GAME_OVER && !match.mayAct();
      setLabel(waiting ? match.waitingLabel() : null);
    };
    tick();
    const interval = setInterval(tick, 400);
    return () => clearInterval(interval);
  }, [match]);

  if (!label) return null;
  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[90]
        pointer-events-none bg-slate-900/85 text-yellow-300 border
        border-yellow-500 rounded-lg px-5 py-2 font-heading text-lg
        shadow-xl animate-pulse"
    >
      ⏳ {label}
    </div>
  );
}
