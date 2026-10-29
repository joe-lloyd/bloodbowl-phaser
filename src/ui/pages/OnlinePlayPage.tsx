import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GamePage } from "./GamePage";
import { useAuth } from "../hooks/useAuth";
import {
  fetchLobby,
  seedFor,
  subscribeLobby,
  requestEndMatch,
  cancelEndMatch,
  finishMatch,
  clearActiveMatchCode,
  heartbeat,
  describeOpponentConnection,
  LobbyDoc,
} from "../../firebase/lobby";
import {
  createOnlineMatch,
  setActiveOnlineMatch,
  OnlineMatch,
} from "../../network/OnlineMatch";
import { OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { GameEventNames } from "../../types/events";
import { GamePhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import {
  DialogActions,
  DialogShell,
  HudButton,
} from "../components/componentWarehouse/HudKit";
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
  // Drives the disconnect → reconnecting → abandonable progression (both the
  // banner and the options menu's connection-status entry read from this).
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

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
        // Both coaches made the seed; each derives it and checks the other
        const seed = await seedFor(loaded);
        if (cancelled) return;
        const created = createOnlineMatch({
          lobby: loaded,
          user,
          eventBus,
          seed,
        });
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
  const connection =
    lobby && opponentUid
      ? describeOpponentConnection(lobby, opponentUid, now)
      : "online";

  // A rejected Firestore write must not vanish silently (the coach would
  // have no idea their "End Match" click did nothing) nor drop them out of
  // the match — surface it as an ordinary toast and leave them exactly
  // where they were, free to retry from the menu.
  const reportMenuActionFailed = (action: string) => (error: unknown) => {
    console.warn(`[Online] ${action} failed:`, error);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `Couldn't reach the server — ${action} failed. Try again.`
    );
  };

  // Everything match-level (save/leave, propose/cancel ending, unilateral
  // abandon on disconnect) now lives in GameHUD's single bottom-right
  // options menu — see MatchOptionsMenu/computeMatchOptionsMenu. This page
  // only supplies the online-specific state and callbacks the menu needs.
  const onlineMenu: OnlineMatchMenuProps | undefined = code
    ? {
        role: match.role,
        opponentName: match.opponentName,
        connection,
        endRequest:
          endRequestBy === null
            ? "none"
            : endRequestBy === user.uid
              ? "mine"
              : "theirs",
        onSaveAndExit: () => {
          // saveState() already swallows its own persistence failures (see
          // OnlineMatch's persistNow) — leaving is always safe here.
          match.saveState();
          leave();
        },
        onRequestEndMatch: () =>
          requestEndMatch(code, user.uid).catch(
            reportMenuActionFailed("proposing to end the match")
          ),
        onCancelEndMatch: () =>
          cancelEndMatch(code).catch(
            reportMenuActionFailed("cancelling the end-match request")
          ),
        onForceAbandon: () =>
          finishMatch(code, "abandoned").catch(
            reportMenuActionFailed("ending the match")
          ),
        // Reconnection is otherwise fully automatic (heartbeat + Firestore's
        // realtime listener); this only nudges both — an immediate heartbeat
        // and a fresh lobby read — for the rare case the listener stalled.
        // It changes nothing about who is authoritative or how sessions
        // resume, per design.md's non-goal.
        onReconnect: () => {
          void heartbeat(code, user.uid).catch(
            reportMenuActionFailed("reconnecting")
          );
          void fetchLobby(code)
            .then((refreshed) => refreshed && setLobby(refreshed))
            .catch(reportMenuActionFailed("reconnecting"));
        },
      }
    : undefined;

  return (
    <div className="w-full h-full relative">
      <GamePage
        eventBus={eventBus}
        mode="normal"
        teams={match.teams}
        progressionEnabled={lobby?.settings.progressionEnabled ?? false}
        competitionContext={lobby?.competitionContext}
        pitchThemeId={lobby?.settings.pitchThemeId}
        onlineMenu={onlineMenu}
      />
      <WaitingBanner match={match} />

      {lobby && opponentUid && connection !== "online" && (
        <DisconnectBanner
          opponentName={match.opponentName}
          abandonable={connection === "abandonable"}
        />
      )}

      {lobby && code && (
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
          opponentAway={!!opponentUid && connection !== "online"}
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

      {/* Blocking decision prompt — only for the side who must respond.
          The proposer's own "cancel" lives in the options menu instead, so
          proposing no longer locks the requester out of their own screen. */}
      {endRequestBy && endRequestBy !== user.uid && code && (
        <EndMatchModal
          opponentName={match.opponentName}
          onAgree={() =>
            finishMatch(code, "finished").catch(
              reportMenuActionFailed("ending the match")
            )
          }
          onDecline={() =>
            cancelEndMatch(code).catch(
              reportMenuActionFailed("declining the end-match request")
            )
          }
        />
      )}
    </div>
  );
}

/** Blocking prompt shown to the coach who must respond to an end-match
 *  proposal (the proposer manages/cancels their own request from the
 *  options menu instead — see OnlineMatchMenuProps.endRequest). */
function EndMatchModal({
  opponentName,
  onAgree,
  onDecline,
}: {
  opponentName: string;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    <DialogShell
      zClass="z-[110]"
      placement="center"
      backdrop="heavy"
      tone="blood"
      title="End Match?"
      width="w-[420px]"
      actions={
        <DialogActions>
          <HudButton variant="ghost" onClick={onDecline}>
            Keep Playing
          </HudButton>
          <HudButton variant="primary" onClick={onAgree}>
            End Match
          </HudButton>
        </DialogActions>
      }
    >
      <p>
        {opponentName} wants to end the match. Agree to finish it for both of
        you?
      </p>
    </DialogShell>
  );
}

/**
 * Opponent-presence banner. Their heartbeat goes stale when they drop; after
 * a short grace we show "reconnecting", and after a longer grace the options
 * menu's "End Match (Opponent Left)" entry becomes available (the unilateral
 * abandon action itself lives there now, not on this banner).
 */
function DisconnectBanner({
  opponentName,
  abandonable,
}: {
  opponentName: string;
  abandonable: boolean;
}) {
  return (
    <div className="absolute inset-x-0 top-[15rem] z-[93] flex justify-center pointer-events-none">
      <div className="hud-slab pointer-events-auto border-t-[3px] border-t-hud-bad px-5 py-3 text-center animate-hud-in">
        <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.05em] text-[#ff8a8a]">
          ⚠ {opponentName} disconnected
        </p>
        <p className="mt-1 font-hud-body text-hud-sm text-hud-dim">
          {abandonable
            ? "You can end the match from the Match Options menu."
            : "Waiting for them to reconnect…"}
        </p>
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
  // Below the turn indicator and the turn clock, which share the top centre;
  // steady, as it stays up for the whole of the other coach's turn
  return (
    <div
      className="hud-slab absolute top-[11.5rem] left-1/2 -translate-x-1/2 z-[90]
        pointer-events-none border-l-[3px] border-l-hud-gold px-5 py-2
        font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em]
        text-hud-gold"
    >
      ⏳ {label}
    </div>
  );
}
