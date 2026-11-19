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
  playHold,
  type LobbyDoc,
  type OwnLink,
} from "../../firebase/lobby";
import {
  createOnlineMatch,
  setActiveOnlineMatch,
  type OnlineMatch,
} from "../../network/OnlineMatch";
import { type OnlineMatchMenuProps } from "../components/hud/GameHUD";
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
import { isHouseBotBrowser } from "../../firebase/houseBot";

interface OnlinePlayPageProps {
  eventBus: EventBus;
}

export function OnlinePlayPage({ eventBus }: OnlinePlayPageProps) {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const matchRef = useRef<OnlineMatch | null>(null);
  const [match, setMatch] = useState<OnlineMatch | null>(null);
  const [lobby, setLobby] = useState<LobbyDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const leftRef = useRef(false);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 2000);
    return () => {
      clearInterval(id);
    };
  }, []);

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

        const seed = await seedFor(loaded);
        if (cancelled) return;
        const created = createOnlineMatch({
          lobby: loaded,
          user,
          eventBus,
          seed,
          computer: isHouseBotBrowser() ? {} : undefined,
        });
        created.onFatalError((message) => {
          setError(message);
        });
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

  const [link, setLink] = useState<OwnLink>({
    state: "online",
    confirmedSeen: null,
  });
  useEffect(() => {
    if (!code || !user) return;
    return subscribeMatchLobby({ code,uid: user.uid,onLobby: setLobby,onLink: setLink });
  }, [code, user]);

  const [ackedSeen, setAckedSeen] = useState(0);
  useEffect(() => {
    if (!code || !user) return;
    const beat = () =>
      void heartbeat(code, user.uid)
        .then((at) => {
          setAckedSeen((seen) => Math.max(seen, at));
        })
        .catch(() => {});
    beat();
    const id = setInterval(beat, 6000);
    return () => {
      clearInterval(id);
    };
  }, [code, user]);

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

  const endRequest = endRequestFrom(lobby, user.uid);
  const { connection, hold } = opponentPresence(
    lobby,
    user.uid,
    link,
    ackedSeen,
    now
  );

  const reportMenuActionFailed = (action: string) => (error: unknown) => {
    console.warn(`[Online] ${action} failed:`, error);
    eventBus.emit(
      GameEventNames.UI_Notification,
      `Couldn't reach the server — ${action} failed. Try again.`
    );
  };

  const onlineMenu: OnlineMatchMenuProps | undefined = code
    ? {
        role: match.role,
        opponentName: match.opponentName,
        connection,
        endRequest,
        onSaveAndExit: () => {
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
        onlineMenu={onlineMenu}
        resumed={!!lobby?.snapshot}
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
          {...awayProps(hold)}
          offline={connection === "offline"}
        />
      )}

      {lobby && code && (
        <OnlineCoinFlip
          code={code}
          lobby={lobby}
          match={match}
          eventBus={eventBus}
        />
      )}

      {endRequest === "theirs" && code && (
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

function endRequestFrom(
  lobby: LobbyDoc | null,
  uid: string
): OnlineMatchMenuProps["endRequest"] {
  const endRequestBy = lobby?.endRequestBy ?? null;
  if (endRequestBy === null) return "none";
  return endRequestBy === uid ? "mine" : "theirs";
}

function opponentPresence(
  lobby: LobbyDoc | null,
  uid: string,
  link: OwnLink,
  ackedSeen: number,
  now: number
) {
  const opponentUid = lobby
    ? uid === lobby.hostUid
      ? lobby.guestUid
      : lobby.hostUid
    : null;
  if (!lobby || !opponentUid)
    return { connection: "online" as const, hold: null };

  const ownSeen = Math.max(link.confirmedSeen ?? 0, ackedSeen) || null;
  return {
    connection: describeConnection({ lobby,opponentUid,link: link.state,now }),
    hold: playHold({ lobby: lobby, opponentUid: opponentUid, link: { ...link, confirmedSeen: ownSeen }, now: now }
    ),
  };
}

function awayProps(hold: ReturnType<typeof playHold>) {
  return {
    opponentAway: hold != null,
    awaySince: hold?.since ?? null,
    awayIsMe: hold?.absent === "me",
  };
}

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
