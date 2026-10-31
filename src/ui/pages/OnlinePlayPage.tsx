import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EventBus } from "../../services/EventBus";
import { GamePage } from "./GamePage";
import { useAuth } from "../hooks/useAuth";
import {
  fetchLobby,
  seedFor,
  subscribeMatchLobby,
  requestEndMatch,
  cancelEndMatch,
  finishMatch,
  clearActiveMatchCode,
  heartbeat,
  describeConnection,
  connectionHoldsPlay,
  LobbyDoc,
  OwnLink,
} from "../../firebase/lobby";
import {
  createOnlineMatch,
  setActiveOnlineMatch,
  OnlineMatch,
} from "../../network/OnlineMatch";
import { OnlineMatchMenuProps } from "../components/hud/GameHUD";
import { GameEventNames } from "../../types/events";
import {
  DialogActions,
  DialogShell,
  HudButton,
  Notice,
} from "../components/componentWarehouse/HudKit";
import { OnlineCoinFlip } from "./OnlineCoinFlip";
import { TurnClock } from "./TurnClock";
import { RefusalNotice } from "../components/hud/RefusalNotice";
import { MatchBanner } from "./ConnectionBanner";

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

  // Live lobby doc, which drives the end-match prompt and end/abandon
  // transitions, and this coach's own link, from one listener. While the
  // link is down or slow, the other coach's heartbeat stops arriving too,
  // which must not read as them leaving.
  const [link, setLink] = useState<OwnLink>({
    state: "online",
    confirmedSeen: null,
  });
  useEffect(() => {
    if (!code || !user) return;
    return subscribeMatchLobby(code, user.uid, setLobby, setLink);
  }, [code, user]);

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
      <div className="hud-page flex h-full w-full flex-col items-center justify-center gap-4 px-6">
        <Notice tone="bad" role="alert" className="w-full max-w-md">
          {error}
        </Notice>
        <HudButton variant="ghost" onClick={() => navigate("/")}>
          Back to menu
        </HudButton>
      </div>
    );
  }

  if (!user || !match) {
    return (
      <div className="hud-page flex h-full w-full items-center justify-center">
        <p role="status" className="hud-label text-hud-base text-hud-dim">
          Connecting to match…
        </p>
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
      ? describeConnection(lobby, opponentUid, link.state, now)
      : "online";
  // When the drop began, as both coaches see it: the absent coach's last
  // heartbeat the server holds. Offline, that is this coach's own.
  const awaySince =
    connection === "offline"
      ? link.confirmedSeen
      : lobby && opponentUid && connectionHoldsPlay(connection)
        ? (lobby.players[opponentUid]?.lastSeen ?? null)
        : null;

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
      <MatchBanner
        match={match}
        eventBus={eventBus}
        opponentName={match.opponentName}
        connection={connection}
      />
      <RefusalNotice eventBus={eventBus} />

      {lobby && code && (
        <TurnClock
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
          user={user}
          opponentAway={!!opponentUid && connectionHoldsPlay(connection)}
          awaySince={awaySince}
          offline={connection === "offline"}
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
