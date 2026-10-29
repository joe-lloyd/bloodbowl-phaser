import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Chip,
  EmptyState,
  Eyebrow,
  Field,
  HudButton,
  Notice,
  PageHeader,
  PageShell,
  Panel,
  Section,
} from "../componentWarehouse/HudKit";
import { useAuth } from "../../hooks/useAuth";
import { useTeamLibrary } from "../../hooks/useTeamLibrary";
import {
  LobbyDoc,
  LobbyPlayer,
  LobbySettings,
  canStart,
  commitSeed,
  createLobby,
  revealSeed,
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
import { CompetitionContext } from "../../../competition/types";
import { PitchThemePicker } from "../common/PitchThemePicker";

type Mode = "host" | "join";

/**
 * Online lobby: host creates a match code, guest joins by code; each player
 * picks a team from their own library and readies up. The host controls the
 * match settings and the game starts only when everyone is ready.
 */
export function OnlineLobby({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { code: routeCode } = useParams();
  const { user } = useAuth();
  const [lobby, setLobby] = useState<LobbyDoc | null>(null);
  const [code, setCode] = useState<string | null>(routeCode ?? null);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const competitionFixture = (
    location.state as {
      competitionFixture?: {
        context: CompetitionContext;
        homeTeam: Team;
        awayTeam: Team;
      };
    } | null
  )?.competitionFixture;

  const [library] = useTeamLibrary();
  const myTeams = user ? library : [];

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
        const created = await createLobby(
          user.uid,
          coachName,
          competitionFixture
        );
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
  }, [mode, code, user, navigate, competitionFixture]);

  // Live lobby subscription
  useEffect(() => {
    if (!code) return;
    return subscribeLobby(code, setLobby);
  }, [code]);


  // The seed both coaches make: commit to a secret once the opponent is
  // here, reveal it once both have committed (see firebase/lobby).
  const commits = lobby?.seedCommits ?? {};
  const reveals = lobby?.seedReveals ?? {};
  const myUid = user?.uid;
  const bothCommitted =
    !!lobby?.guestUid && !!commits[lobby.hostUid] && !!commits[lobby.guestUid];
  useEffect(() => {
    if (!lobby || !myUid || lobby.status !== "lobby" || !lobby.guestUid) return;
    if (!commits[myUid]) void commitSeed(lobby.code, myUid);
    else if (bothCommitted && !reveals[myUid])
      void revealSeed(lobby.code, myUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby?.code, lobby?.status, lobby?.guestUid, myUid, !!commits[myUid ?? ""], bothCommitted, !!reveals[myUid ?? ""]]);

  // Both ready + host started → everyone moves to the match
  useEffect(() => {
    if (lobby?.status === "active" && code) {
      navigate(`/online/play/${code}`);
    }
  }, [lobby?.status, code, navigate]);

  if (!user) {
    return (
      <PageShell width="narrow" className="flex flex-col justify-center">
        <EmptyState
          title="Sign in from the main menu to play online."
          titleAs="p"
          action={
            <HudButton variant="ghost" onClick={() => navigate("/")}>
              Back
            </HudButton>
          }
        />
      </PageShell>
    );
  }

  // Join mode: enter a code first
  if (!code) {
    return (
      <PageShell width="narrow" className="flex flex-col justify-center">
        <Panel accent="gold" className="flex flex-col items-center gap-5 px-6 py-8 text-center">
          <div>
            <Eyebrow tone="gold">Online</Eyebrow>
            <h1 className="mt-1 font-hud-display text-hud-3xl uppercase tracking-[0.02em] text-hud-bone">
              Join Game
            </h1>
          </div>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
            placeholder="MATCH CODE"
            maxLength={6}
            aria-label="Match code"
            className="hud-field !min-h-[64px] !w-72 max-w-full text-center !font-hud-display !text-hud-2xl uppercase tracking-[0.3em] indent-[0.3em]"
          />
          <HudButton
            variant="primary"
            size="lg"
            className="w-72 max-w-full"
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
          </HudButton>
          {error && <ErrorText text={error} />}
          <HudButton variant="ghost" onClick={() => navigate("/")}>
            Back
          </HudButton>
        </Panel>
      </PageShell>
    );
  }

  if (!lobby) {
    return (
      <PageShell width="narrow" className="flex flex-col items-center justify-center gap-4">
        <p role="status" className="hud-label text-hud-base text-hud-dim">
          {busy ? "Creating lobby…" : "Loading lobby…"}
        </p>
        {error && <ErrorText text={error} />}
      </PageShell>
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

  const startable = isHost && canStart(lobby);

  return (
    <PageShell
      width="medium"
      actionBar={
        <>
          <HudButton variant="ghost" onClick={() => navigate("/")}>
            Leave
          </HudButton>
          {waitingOn.length > 0 && (
            <p className="min-w-0 flex-1 text-center font-hud-body text-hud-sm text-hud-dim">
              Waiting for {waitingOn.join(", ")}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <HudButton
              variant={startable || me?.ready ? "secondary" : "primary"}
              size="lg"
              disabled={!me?.team}
              onClick={() => void setReady(lobby.code, user.uid, !me?.ready)}
            >
              {me?.ready ? "Not ready" : "Ready!"}
            </HudButton>
            {isHost && (
              <HudButton
                variant={startable ? "primary" : "secondary"}
                size="lg"
                disabled={!canStart(lobby)}
                onClick={() =>
                  void startMatch(
                    lobby.code,
                    lobby.settings,
                    lobby.hostUid,
                    lobby.guestUid!
                  )
                }
              >
                Start Match
              </HudButton>
            )}
          </div>
        </>
      }
    >
      <PageHeader
        eyebrow="Online"
        title="Match Lobby"
        subtitle={
          lobby.competitionContext
            ? `Competition fixture: ${lobby.competitionContext.fixtureId}`
            : undefined
        }
        actions={
          <p
            data-testid="lobby-code"
            data-code={lobby.code}
            className="flex items-baseline gap-3 rounded-hud border border-hud-gold/40 bg-black/50 px-4 py-2"
          >
            <span className="hud-label text-hud-gold">CODE: </span>
            <span className="font-hud-display text-hud-3xl -mr-[0.3em] tracking-[0.3em] text-hud-gold">
              {lobby.code}
            </span>
          </p>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
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
      <Section title="Your team">
        {lobby.fixtureTeams && me?.team ? (
          <p className="font-hud-body text-hud-base text-hud-bone">
            {me.team.name} ({me.team.rosterName}) — locked for this fixture
          </p>
        ) : myTeams.length === 0 ? (
          <p className="font-hud-body text-hud-base text-hud-dim">
            No saved teams — build one first.
          </p>
        ) : (
          <select
            value={me?.team?.id ?? ""}
            onChange={(e) => {
              const team = myTeams.find((t: Team) => t.id === e.target.value);
              if (team) void selectTeam(lobby.code, user.uid, team);
            }}
            aria-label="Your team"
            className="hud-field"
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
      </Section>

      <SettingsPanel
        settings={lobby.settings}
        readOnly={!isHost}
        onChange={(settings) => void updateSettings(lobby.code, settings)}
      />

      {error && <ErrorText text={error} />}
    </PageShell>
  );
}

function PlayerCard({
  label,
  player,
  empty,
}: {
  label: string;
  player: LobbyPlayer | null | undefined;
  empty?: string;
}) {
  return (
    <Panel accent={player?.ready ? "good" : "neutral"} className="p-4">
      <Eyebrow>{label}</Eyebrow>
      {player ? (
        <>
          <p className="mt-1 truncate font-hud-display text-hud-xl uppercase tracking-[0.02em] text-hud-bone">
            {player.displayName}
          </p>
          <p className="truncate font-hud-body text-hud-sm text-hud-dim">
            {player.team
              ? `${player.team.name} (${player.team.rosterName})`
              : "No team picked"}
          </p>
          <div className="mt-3">
            {player.ready ? (
              <Chip tone="good">READY</Chip>
            ) : (
              <Chip>not ready</Chip>
            )}
          </div>
        </>
      ) : (
        <p className="mt-2 font-hud-body text-hud-base text-hud-mute">
          {empty}
        </p>
      )}
    </Panel>
  );
}

/** Exported for direct testing of the turn-timer / timeout-bank / progression
 *  controls (see __tests__/unit/onlineLobbySettingsPanel.test.tsx). */
export function SettingsPanel({
  settings,
  readOnly,
  onChange,
}: {
  settings: LobbySettings;
  readOnly: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  return (
    <Section
      title={readOnly ? "Match settings (host decides)" : "Match settings"}
      bodyClassName="flex flex-col gap-4"
    >
      <div>
        <Eyebrow className="mb-2">Pitch</Eyebrow>
        <PitchThemePicker
          compact
          disabled={readOnly}
          value={settings.pitchThemeId}
          onChange={(pitchThemeId) => onChange({ ...settings, pitchThemeId })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Turn timer">
          <select
            disabled={readOnly}
            value={settings.turnSeconds}
            onChange={(e) =>
              onChange({ ...settings, turnSeconds: Number(e.target.value) })
            }
            className="hud-field"
          >
            {[60, 90, 120, 180, 240].map((s) => (
              <option key={s} value={s}>
                {s / 60} min
              </option>
            ))}
            {/* 0 is the "no time limit" sentinel — see LobbySettings.turnSeconds */}
            <option value={0}>No time limit</option>
          </select>
        </Field>
        <Field label="Timeout bank">
          <select
            disabled={readOnly}
            value={settings.timeoutBankMs}
            onChange={(e) =>
              onChange({ ...settings, timeoutBankMs: Number(e.target.value) })
            }
            className="hud-field"
          >
            {[0, 2, 5, 10].map((minutes) => (
              <option key={minutes} value={minutes * 60 * 1000}>
                {minutes} min
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center justify-between gap-4 font-hud-body text-hud-base text-hud-bone">
        <span>League progression</span>
        <input
          type="checkbox"
          className="hud-check"
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
    </Section>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <Notice tone="bad" role="alert" className="w-full">
      {text}
    </Notice>
  );
}
