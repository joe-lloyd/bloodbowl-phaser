import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Parchment from "../componentWarehouse/Parchment";
import ContentContainer from "../componentWarehouse/ContentContainer";
import MinHeightContainer from "../componentWarehouse/MinHeightContainer";
import { Button, SecondaryButton } from "../componentWarehouse/Button";
import { Title, Subtitle } from "../componentWarehouse/Titles";
import { useAuth } from "../../hooks/useAuth";
import { loadTeams } from "../../../game/managers/TeamManager";
import {
  LobbyDoc,
  LobbySettings,
  canStart,
  createLobby,
  joinLobby,
  selectTeam,
  setReady,
  startMatch,
  subscribeLobby,
  updateSettings,
  getActiveMatchCode,
  fetchLobby,
  resolveCoachName,
} from "../../../firebase/lobby";
import { Team } from "../../../types/Team";

type Mode = "host" | "join";

/**
 * Online lobby: host creates a match code, guest joins by code; each player
 * picks a team from their own library and readies up. The host controls the
 * match settings and the game starts only when everyone is ready.
 */
export function OnlineLobby({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const { code: routeCode } = useParams();
  const { user } = useAuth();
  const [lobby, setLobby] = useState<LobbyDoc | null>(null);
  const [code, setCode] = useState<string | null>(routeCode ?? null);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myTeams = useMemo(() => (user ? loadTeams() : []), [user]);

  // Host mode: resume the user's existing match if any, else create one.
  // A player may only have one active match at a time, so we never spawn a
  // second lobby doc — we reattach to the current one.
  useEffect(() => {
    if (mode !== "host" || code || !user) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const existing = await getActiveMatchCode(user.uid);
        if (cancelled) return;
        if (existing) {
          const doc = await fetchLobby(existing);
          if (cancelled) return;
          if (doc && doc.status === "active") {
            navigate(`/online/play/${existing}`, { replace: true });
            return;
          }
          if (doc && doc.status === "lobby") {
            setCode(existing); // reattach to the open lobby
            return;
          }
          // stale/finished pointer — fall through and make a fresh lobby
        }
        const coachName = await resolveCoachName(user.uid);
        const created = await createLobby(user.uid, coachName);
        if (!cancelled) setCode(created.code);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, code, user, navigate]);

  // Live lobby subscription
  useEffect(() => {
    if (!code) return;
    return subscribeLobby(code, setLobby);
  }, [code]);

  // Both ready + host started → everyone moves to the match
  useEffect(() => {
    if (lobby?.status === "active" && code) {
      navigate(`/online/play/${code}`);
    }
  }, [lobby?.status, code, navigate]);

  if (!user) {
    return (
      <Shell>
        <Subtitle>Sign in from the main menu to play online.</Subtitle>
        <SecondaryButton onClick={() => navigate("/")}>Back</SecondaryButton>
      </Shell>
    );
  }

  // Join mode: enter a code first
  if (!code) {
    return (
      <Shell>
        <Title className="text-4xl mb-8">Join Game</Title>
        <div className="flex flex-col items-center gap-4">
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            placeholder="MATCH CODE"
            maxLength={6}
            className="text-3xl font-heading tracking-[0.3em] text-center uppercase
              bg-bb-parchment border-2 border-bb-dark-gold rounded-lg px-4 py-3 w-64"
          />
          <Button
            disabled={busy || joinInput.trim().length < 6}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                const coachName = await resolveCoachName(user.uid);
                const joined = await joinLobby(joinInput, user.uid, coachName);
                setCode(joined.code);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Join
          </Button>
          {error && <ErrorText text={error} />}
          <SecondaryButton onClick={() => navigate("/")}>Back</SecondaryButton>
        </div>
      </Shell>
    );
  }

  if (!lobby) {
    return (
      <Shell>
        <Subtitle>{busy ? "Creating lobby…" : "Loading lobby…"}</Subtitle>
        {error && <ErrorText text={error} />}
      </Shell>
    );
  }

  const isHost = user.uid === lobby.hostUid;
  const me = lobby.players[user.uid];
  const opponentUid = isHost ? lobby.guestUid : lobby.hostUid;
  const opponent = opponentUid ? lobby.players[opponentUid] : null;

  const waitingOn: string[] = [];
  if (!lobby.guestUid) waitingOn.push("an opponent to join");
  if (me && !me.team) waitingOn.push("you to pick a team");
  if (me?.team && !me.ready) waitingOn.push("you to ready up");
  if (opponent && !opponent.team)
    waitingOn.push(`${opponent.displayName} to pick a team`);
  if (opponent?.team && !opponent.ready)
    waitingOn.push(`${opponent.displayName} to ready up`);

  return (
    <Shell>
      <Title className="text-4xl mb-2">Match Lobby</Title>
      <p className="font-heading text-2xl tracking-[0.3em] text-bb-deep-crimson mb-8">
        CODE: {lobby.code}
      </p>

      <div className="flex flex-wrap justify-center gap-8 mb-8">
        <PlayerCard
          label={isHost ? "You (Host)" : "Host"}
          player={lobby.players[lobby.hostUid]}
        />
        <PlayerCard
          label={isHost ? "Guest" : "You (Guest)"}
          player={lobby.guestUid ? lobby.players[lobby.guestUid] : null}
          empty={!lobby.guestUid ? "Waiting for opponent…" : undefined}
        />
      </div>

      {/* Your team picker — your own library only */}
      <div className="mb-8 w-full max-w-md">
        <Subtitle className="mb-2">Your team</Subtitle>
        {myTeams.length === 0 ? (
          <p className="font-body text-bb-muted-text">
            No saved teams — build one first.
          </p>
        ) : (
          <select
            value={me?.team?.id ?? ""}
            onChange={(e) => {
              const team = myTeams.find((t: Team) => t.id === e.target.value);
              if (team) void selectTeam(lobby.code, user.uid, team);
            }}
            className="w-full text-xl font-body bg-bb-parchment border-2
              border-bb-dark-gold rounded-lg px-3 py-2"
          >
            <option value="" disabled>
              Pick a team…
            </option>
            {myTeams.map((team: Team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.rosterName})
              </option>
            ))}
          </select>
        )}
      </div>

      <SettingsPanel
        settings={lobby.settings}
        readOnly={!isHost}
        onChange={(settings) => void updateSettings(lobby.code, settings)}
      />

      <div className="flex flex-col items-center gap-3 mt-8">
        <Button
          disabled={!me?.team}
          onClick={() => void setReady(lobby.code, user.uid, !me?.ready)}
          className={me?.ready ? "opacity-80" : ""}
        >
          {me?.ready ? "Not ready" : "Ready!"}
        </Button>

        {isHost && (
          <Button
            disabled={!canStart(lobby)}
            onClick={() =>
              void startMatch(
                lobby.code,
                Date.now() & 0x7fffffff,
                lobby.settings,
                lobby.hostUid,
                lobby.guestUid!
              )
            }
          >
            Start Match
          </Button>
        )}

        {waitingOn.length > 0 && (
          <p className="font-body italic text-bb-muted-text mt-2">
            Waiting for {waitingOn.join(", ")}
          </p>
        )}
        {error && <ErrorText text={error} />}
        <SecondaryButton onClick={() => navigate("/")}>Leave</SecondaryButton>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <MinHeightContainer className="bg-bb-parchment">
      <Parchment $intensity="high" />
      <ContentContainer>
        <div className="flex flex-col items-center text-center py-16">
          {children}
        </div>
      </ContentContainer>
    </MinHeightContainer>
  );
}

function PlayerCard({
  label,
  player,
  empty,
}: {
  label: string;
  player: import("../../../firebase/lobby").LobbyPlayer | null | undefined;
  empty?: string;
}) {
  return (
    <div
      className="min-w-[220px] border-2 border-bb-dark-gold rounded-lg p-4
        bg-bb-parchment shadow-md"
    >
      <p className="font-heading text-lg uppercase mb-1">{label}</p>
      {player ? (
        <>
          <p className="font-body text-xl">{player.displayName}</p>
          <p className="font-body text-bb-muted-text">
            {player.team
              ? `${player.team.name} (${player.team.rosterName})`
              : "No team picked"}
          </p>
          <p
            className={`font-heading mt-2 ${
              player.ready ? "text-green-700" : "text-bb-muted-text"
            }`}
          >
            {player.ready ? "READY" : "not ready"}
          </p>
        </>
      ) : (
        <p className="font-body italic text-bb-muted-text">{empty}</p>
      )}
    </div>
  );
}

function SettingsPanel({
  settings,
  readOnly,
  onChange,
}: {
  settings: LobbySettings;
  readOnly: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  return (
    <div className="w-full max-w-md border-2 border-bb-dark-gold rounded-lg p-4">
      <Subtitle className="mb-2">
        Match settings {readOnly && "(host decides)"}
      </Subtitle>
      <div className="flex justify-between items-center gap-4 mb-2">
        <label className="font-body text-lg">Turn timer</label>
        <select
          disabled={readOnly}
          value={settings.turnSeconds}
          onChange={(e) =>
            onChange({ ...settings, turnSeconds: Number(e.target.value) })
          }
          className="font-body bg-bb-parchment border border-bb-dark-gold rounded px-2 py-1"
        >
          {[60, 90, 120, 180, 240].map((s) => (
            <option key={s} value={s}>
              {s / 60} min
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-between items-center gap-4">
        <label className="font-body text-lg">Timeout bank</label>
        <select
          disabled={readOnly}
          value={settings.timeoutBankMs}
          onChange={(e) =>
            onChange({ ...settings, timeoutBankMs: Number(e.target.value) })
          }
          className="font-body bg-bb-parchment border border-bb-dark-gold rounded px-2 py-1"
        >
          {[0, 2, 5, 10].map((minutes) => (
            <option key={minutes} value={minutes * 60 * 1000}>
              {minutes} min
            </option>
          ))}
        </select>
      </div>
      <label className="mt-3 flex justify-between items-center gap-4 font-body text-lg">
        <span>League progression</span>
        <input
          type="checkbox"
          disabled={readOnly}
          checked={settings.progressionEnabled ?? false}
          onChange={(event) =>
            onChange({
              ...settings,
              progressionEnabled: event.target.checked,
            })
          }
        />
      </label>
    </div>
  );
}

function ErrorText({ text }: { text: string }) {
  return <p className="text-bb-deep-crimson font-body">{text}</p>;
}
