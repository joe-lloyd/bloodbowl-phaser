import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GamePage } from "./GamePage";
import { useAuth } from "../hooks/useAuth";
import {
  fetchLobby,
  subscribeLobby,
  requestEndMatch,
  cancelEndMatch,
  finishMatch,
  clearActiveMatchCode,
  heartbeat,
  isPlayerOnline,
  LobbyDoc,
} from "../../firebase/lobby";
import {
  createOnlineMatch,
  setActiveOnlineMatch,
  OnlineMatch,
} from "../../network/OnlineMatch";
import { GamePhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import {
  Button,
  SecondaryButton,
  DangerButton,
} from "../components/componentWarehouse/Button";
import { OnlineCoinFlip } from "./OnlineCoinFlip";
import { TurnClock } from "./TurnClock";

interface OnlinePlayPageProps {
  eventBus: EventBus;
}

/**
 * Boots an online match: builds the network session for this player's role
 * (which also initializes the ServiceContainer), and only then mounts the
 * regular GamePage on top of it. Also carries the in-match controls that
 * live on the lobby doc — mutual end-of-match agreement and save-for-later.
 */
export function OnlinePlayPage({ eventBus }: OnlinePlayPageProps) {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const matchRef = useRef<OnlineMatch | null>(null);
  const [match, setMatch] = useState<OnlineMatch | null>(null);
  const [lobby, setLobby] = useState<LobbyDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const leftRef = useRef(false);

  // Boot the match once
  useEffect(() => {
    if (!code || !user || matchRef.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await fetchLobby(code);
        if (!loaded) throw new Error("Match not found.");
        if (loaded.status !== "active")
          throw new Error("This match has not started (or is over).");
        if (cancelled) return;
        setLobby(loaded);

        // Must exist before GamePage mounts: it initializes ServiceContainer
        // with the right engine (host: native + protocol bridge; guest:
        // networked proxy over a passive replica).
        const created = createOnlineMatch({ lobby: loaded, user, eventBus });
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

  // Live lobby doc: drives the end-match prompt and end/abandon transitions
  useEffect(() => {
    if (!code) return;
    return subscribeLobby(code, setLobby);
  }, [code]);

  // Presence heartbeat so the opponent can detect if we drop
  useEffect(() => {
    if (!code || !user) return;
    void heartbeat(code, user.uid);
    const id = setInterval(() => void heartbeat(code, user.uid), 6000);
    return () => clearInterval(id);
  }, [code, user]);

  // When the match ends (mutually or abandoned), clear our pointer and leave
  useEffect(() => {
    if (!user || !lobby || leftRef.current) return;
    if (lobby.status === "finished" || lobby.status === "abandoned") {
      leftRef.current = true;
      void clearActiveMatchCode(user.uid);
      navigate("/", { replace: true });
    }
  }, [lobby, user, navigate]);

  const leave = () => {
    leftRef.current = true;
    navigate("/");
  };

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-bb-parchment">
        <p className="text-bb-deep-crimson text-xl font-body">{error}</p>
        <button className="underline font-body" onClick={() => navigate("/")}>
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

  const endRequestBy = lobby?.endRequestBy ?? null;
  const opponentUid = lobby
    ? user.uid === lobby.hostUid
      ? lobby.guestUid
      : lobby.hostUid
    : null;

  return (
    <div className="w-full h-full relative">
      <GamePage
        eventBus={eventBus}
        mode="normal"
        teams={match.teams}
        progressionEnabled={lobby?.settings.progressionEnabled ?? false}
        competitionContext={lobby?.competitionContext}
      />
      <WaitingBanner match={match} />

      {lobby && code && opponentUid && (
        <DisconnectBanner
          lobby={lobby}
          opponentUid={opponentUid}
          opponentName={match.opponentName}
          onAbandon={() => void finishMatch(code, "abandoned")}
        />
      )}

      {lobby && code && (
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
        />
      )}

      {/* Shared coin toss at match start. Kept mounted through completion so
          the host's "apply toss → start setup" effect runs; it self-hides
          (renders null) once the toss is resolved. */}
      {lobby && code && (
        <OnlineCoinFlip
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
        />
      )}

      <MatchMenu
        onSaveExit={() => {
          match.saveState();
          leave();
        }}
        onEndMatch={() => code && void requestEndMatch(code, user.uid)}
        endPending={endRequestBy !== null}
      />

      {endRequestBy && code && (
        <EndMatchModal
          mine={endRequestBy === user.uid}
          opponentName={match.opponentName}
          onAgree={() => void finishMatch(code, "finished")}
          onDecline={() => void cancelEndMatch(code)}
          onCancel={() => void cancelEndMatch(code)}
        />
      )}
    </div>
  );
}

/** Top-right dropdown: save-for-later or propose ending the match. */
function MatchMenu({
  onSaveExit,
  onEndMatch,
  endPending,
}: {
  onSaveExit: () => void;
  onEndMatch: () => void;
  endPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-3 right-3 z-[95] pointer-events-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-slate-900/85 text-bb-gold border border-bb-gold rounded-lg
          px-4 py-2 font-heading text-lg shadow-xl hover:bg-slate-800"
      >
        ☰ Menu
      </button>
      {open && (
        <div
          className="mt-2 flex flex-col gap-2 bg-slate-900/95 border border-bb-gold
            rounded-lg p-3 w-56 shadow-2xl"
        >
          <SecondaryButton
            onClick={() => {
              setOpen(false);
              onSaveExit();
            }}
          >
            💾 Save &amp; Exit
          </SecondaryButton>
          <DangerButton
            disabled={endPending}
            onClick={() => {
              setOpen(false);
              onEndMatch();
            }}
          >
            🏁 End Match
          </DangerButton>
          <p className="text-xs text-gray-400 font-body">
            Save &amp; Exit keeps the match — resume it later from the menu.
            Ending needs both players to agree.
          </p>
        </div>
      )}
    </div>
  );
}

/** Mutual end-of-match agreement. */
function EndMatchModal({
  mine,
  opponentName,
  onAgree,
  onDecline,
  onCancel,
}: {
  mine: boolean;
  opponentName: string;
  onAgree: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/60 pointer-events-auto">
      <div className="bg-slate-900 border-2 border-bb-gold rounded-lg p-6 w-[420px] text-white shadow-2xl text-center">
        <h2 className="text-2xl font-heading text-bb-gold mb-3">End Match?</h2>
        {mine ? (
          <>
            <p className="font-body mb-5">
              Waiting for {opponentName} to agree to end the match…
            </p>
            <SecondaryButton onClick={onCancel}>Cancel request</SecondaryButton>
          </>
        ) : (
          <>
            <p className="font-body mb-5">
              {opponentName} wants to end the match. Agree to finish it for both
              of you?
            </p>
            <div className="flex justify-center gap-3">
              <DangerButton onClick={onAgree}>End Match</DangerButton>
              <Button onClick={onDecline}>Keep Playing</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Opponent-presence banner. Their heartbeat goes stale when they drop; after
 * a short grace we show "reconnecting", and after a longer grace the
 * remaining player may end the match unilaterally (opponent abandoned).
 */
const DISCONNECT_MS = 15000;
const ABANDON_MS = 30000;

function DisconnectBanner({
  lobby,
  opponentUid,
  opponentName,
  onAbandon,
}: {
  lobby: LobbyDoc;
  opponentUid: string;
  opponentName: string;
  onAbandon: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  if (isPlayerOnline(lobby, opponentUid, DISCONNECT_MS, now)) return null;

  const last = lobby.players[opponentUid]?.lastSeen ?? now;
  const canAbandon = now - last > ABANDON_MS;

  return (
    <div className="absolute inset-x-0 top-28 z-[93] flex justify-center pointer-events-none">
      <div className="pointer-events-auto bg-slate-900/90 border border-red-500 rounded-lg px-5 py-3 text-center shadow-2xl">
        <p className="font-heading text-red-300 text-lg">
          ⚠ {opponentName} disconnected
        </p>
        <p className="font-body text-gray-300 text-sm mt-1">
          Waiting for them to reconnect…
        </p>
        {canAbandon && (
          <DangerButton onClick={onAbandon} className="mt-2 text-sm py-1">
            End match (opponent left)
          </DangerButton>
        )}
      </div>
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
