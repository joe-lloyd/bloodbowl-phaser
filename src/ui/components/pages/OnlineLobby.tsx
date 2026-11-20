import { type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  announceHouseBotLobby,
  isHouseBotBrowser,
} from "../../../firebase/houseBot";
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
  type LobbyDoc,
  type LobbyPlayer,
  type LobbySettings,
  canStart,
  commitSeed,
  createLobby,
  revealSeed,
  joinLobby,
  selectTeam,
  setLobbyListed,
  setReady,
  startLobbyMatch,
  subscribeLobby,
  updateSettings,
  getActiveMatchCode,
  fetchLobby,
  lobbyGameType,
  leaveGuestSeat,
} from "../../../firebase/lobby";
import { resolveCoachName } from "../../../firebase/coaches";
import { useFriends } from "../../hooks/useSocial";
import { InviteInbox } from "../social/InviteInbox";
import { FriendButton, InviteFriendsPanel } from "../social/LobbyFriends";
import { OpenGames } from "../social/OpenGames";
import { OpenLobbyToggle } from "../social/OpenLobbyToggle";
import { type Team } from "../../../types/Team";
import type { CompetitionContext } from "../../../competition/types";
import type { HostedFixture } from "../competition/useFixtureLaunch";
import {
  acceptLobbyInvite,
  sendFixtureInvite,
} from "../../../firebase/invites";
import {
  GAME_TYPE_LABELS,
  type GameType,
} from "../../../game/variants/gameTypes";
import { teamPlaysGameType } from "../../../game/rules/rosterLegality";
import { GameTypeSelector } from "../common/GameTypeSelector";

type Mode = "host" | "join";

async function currentLobby(
  uid: string,
  fixture: HostedFixture | undefined
): Promise<{ code: string; playing: boolean } | null> {
  const existing = await getActiveMatchCode(uid);
  const doc = existing ? await fetchLobby(existing) : null;
  if (!doc) return null;
  if (doc.status === "active") return { code: doc.code, playing: true };
  if (reusableLobby(doc, { uid, fixture })) return { code: doc.code, playing: false };
  if (doc.status !== "lobby" || doc.guestUid !== uid) return null;
  if (isHouseBotBrowser()) return { code: doc.code, playing: false };
  await leaveGuestSeat(doc.code, uid);
  return null;
}

function vacateWhenGuestLeaves(lobby: LobbyDoc, uid: string): void {
  if (lobby.guestUid !== uid || lobby.status !== "lobby") return;
  leaveGuestSeat(lobby.code, uid).catch((error: unknown) => {
    console.warn("[lobby] could not give up the guest seat", error);
  });
}

function unlistWhenHostLeaves(lobby: LobbyDoc, uid: string): void {
  if (lobby.hostUid !== uid || lobby.listed !== true) return;
  setLobbyListed(lobby, false).catch((error: unknown) => {
    console.warn("[open lobby] could not unlist the lobby on leave", error);
  });
}

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
      competitionFixture?: HostedFixture;
    } | null
  )?.competitionFixture;

  const [library] = useTeamLibrary();
  const friends = useFriends(user?.uid ?? null);

  const myTeams = user ? library.filter((team) => !team.computerCoached) : [];

  useEffect(() => {
    if (mode !== "host" || code || !user) return;
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const found = await currentLobby(user.uid, competitionFixture);
        if (cancelled) return;
        if (found?.playing) {
          navigate(`/online/play/${found.code}`, { replace: true });
          return;
        }
        if (found) {
          setCode(found.code);
          return;
        }

        const coachName = await resolveCoachName(user.uid);
        const created = await createLobby(
          user.uid,
          coachName,
          competitionFixture
        );
        if (competitionFixture) await inviteOpponent(created.code, user.uid, competitionFixture);
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

  useEffect(() => {
    if (!code) return;
    return subscribeLobby(code, setLobby);
  }, [code]);

  const myUid = user?.uid;
  const { committed, revealed, bothCommitted } = seedProgress(lobby, myUid);
  useEffect(() => {
    if (!lobby || !myUid || lobby.status !== "lobby" || !lobby.guestUid) return;
    if (!committed) void commitSeed(lobby.code, myUid);
    else if (bothCommitted && !revealed) void revealSeed(lobby.code, myUid);
  }, [
    lobby?.code,
    lobby?.status,
    lobby?.guestUid,
    myUid,
    committed,
    bothCommitted,
    revealed,
  ]);

  const botWaitingIn = houseBotWaitingIn(lobby, myUid);
  useEffect(() => {
    if (!myUid || !isHouseBotBrowser()) return;
    const announce = () =>
      void announceHouseBotLobby(myUid, botWaitingIn).catch(() => {});
    announce();
    if (!botWaitingIn) return;
    const id = setInterval(announce, 60_000);
    return () => {
      clearInterval(id);
    };
  }, [myUid, botWaitingIn]);

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

  if (!code) {
    const enter = async (joining: () => Promise<string>) => {
      setError(null);
      setBusy(true);
      try {
        const joined = await joining();
        setCode(joined);
        void navigate(`/online/lobby/${joined}`, { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    const join = (target: string) =>
      enter(async () => {
        const coachName = await resolveCoachName(user.uid);
        return (await joinLobby(target, user.uid, coachName)).code;
      });
    return (
      <JoinByCode
        inbox={
          <InviteInbox
            uid={user.uid}
            busy={busy}
            onAccept={(invite) => void enter(() => acceptLobbyInvite(invite))}
          />
        }
        openGames={
          <OpenGames
            uid={user.uid}
            busy={busy}
            onJoin={(target) => void join(target)}
          />
        }
        joinInput={joinInput}
        onJoinInput={setJoinInput}
        busy={busy}
        error={error}
        onJoin={() => void join(joinInput)}
        onBack={() => navigate("/")}
      />
    );
  }

  if (!lobby) {
    return <LobbyLoading busy={busy} error={error} />;
  }

  const isHost = user.uid === lobby.hostUid;
  const me = lobby.players[user.uid];
  const opponentUid = isHost ? lobby.guestUid : lobby.hostUid;

  return (
    <PageShell
      width="medium"
      actionBar={
        <LobbyActions
          lobby={lobby}
          isHost={isHost}
          me={me}
          onLeave={() => {
            unlistWhenHostLeaves(lobby, user.uid);
            vacateWhenGuestLeaves(lobby, user.uid);
            void navigate("/");
          }}
          onReady={() => void setReady(lobby.code, user.uid, !me?.ready)}
          onStart={() => {
            startLobbyMatch(lobby.code).catch((reason: unknown) => {
              setError(
                reason instanceof Error ? reason.message : String(reason)
              );
            });
          }}
        />
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

      <LobbyPlayers
        lobby={lobby}
        isHost={isHost}
        opponentAction={
          opponentUid && (
            <FriendButton me={user.uid} other={opponentUid} friends={friends} />
          )
        }
      />
      {isHost && !lobby.guestUid && !lobby.competitionContext && (
        <>
          <OpenLobbyToggle lobby={lobby} uid={user.uid} />
          <InviteFriendsPanel
            me={user.uid}
            code={lobby.code}
            friends={friends}
          />
        </>
      )}

      <Section title="Your team">
        <TeamPicker
          me={me}
          fixture={!!lobby.fixtureTeams}
          myTeams={myTeams}
          gameType={lobbyGameType(lobby)}
          onPick={(team) => void selectTeam(lobby.code, user.uid, team)}
        />
      </Section>

      <SettingsPanel
        settings={lobby.settings}
        readOnly={!isHost}
        gameTypeLocked={!!lobby.competitionContext}
        onChange={(settings) => void updateSettings(lobby.code, settings)}
      />

      {error && <ErrorText text={error} />}
    </PageShell>
  );
}

function sameFixture(
  held: CompetitionContext | undefined,
  wanted: CompetitionContext | undefined
): boolean {
  if (!held || !wanted) return held === wanted;
  return (
    held.competitionType === wanted.competitionType &&
    held.competitionId === wanted.competitionId &&
    held.fixtureId === wanted.fixtureId
  );
}

function reusableLobby(
  lobby: LobbyDoc,
  { uid, fixture }: { uid: string; fixture: HostedFixture | undefined }
): boolean {
  return (
    lobby.status === "lobby" &&
    lobby.hostUid === uid &&
    sameFixture(lobby.competitionContext, fixture?.context)
  );
}

async function inviteOpponent(
  code: string,
  fromUid: string,
  fixture: HostedFixture
): Promise<void> {
  if (!fixture.reservedFor) return;
  await sendFixtureInvite({
    fromUid,
    toUid: fixture.reservedFor,
    code,
    context: fixture.context,
    competitionName: fixture.competitionName,
  }).catch((error: unknown) => {
    console.warn("[lobby] could not invite the other coach", error);
  });
}

function seedProgress(lobby: LobbyDoc | null, myUid: string | undefined) {
  const commits = lobby?.seedCommits ?? {};
  const reveals = lobby?.seedReveals ?? {};
  return {
    committed: !!commits[myUid ?? ""],
    revealed: !!reveals[myUid ?? ""],
    bothCommitted:
      !!lobby?.guestUid &&
      !!commits[lobby.hostUid] &&
      !!commits[lobby.guestUid],
  };
}

function houseBotWaitingIn(
  lobby: LobbyDoc | null,
  myUid: string | undefined
): string | null {
  return isHouseBotBrowser() &&
    lobby?.status === "lobby" &&
    lobby.hostUid === myUid &&
    !lobby.guestUid
    ? lobby.code
    : null;
}

function lobbyWaitingOn(
  lobby: LobbyDoc,
  me: LobbyPlayer | undefined,
  isHost: boolean
): string[] {
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
  return waitingOn;
}

function JoinByCode({
  inbox,
  openGames,
  joinInput,
  onJoinInput,
  busy,
  error,
  onJoin,
  onBack,
}: {
  inbox: ReactNode;
  openGames: ReactNode;
  joinInput: string;
  onJoinInput: (value: string) => void;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onBack: () => void;
}) {
  return (
    <PageShell width="narrow" className="flex flex-col justify-center">
      <Panel
        accent="gold"
        className="flex flex-col items-center gap-5 px-6 py-8 text-center"
      >
        <div>
          <Eyebrow tone="gold">Online</Eyebrow>
          <h1 className="mt-1 font-hud-display text-hud-3xl uppercase tracking-[0.02em] text-hud-bone">
            Join Game
          </h1>
        </div>
        {inbox}
        <input
          value={joinInput}
          onChange={(e) => {
            onJoinInput(e.target.value.toUpperCase());
          }}
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
          onClick={onJoin}
        >
          Join
        </HudButton>
        {error && <ErrorText text={error} />}
        {openGames}
        <HudButton variant="ghost" onClick={onBack}>
          Back
        </HudButton>
      </Panel>
    </PageShell>
  );
}

function LobbyLoading({
  busy,
  error,
}: {
  busy: boolean;
  error: string | null;
}) {
  return (
    <PageShell
      width="narrow"
      className="flex flex-col items-center justify-center gap-4"
    >
      <p role="status" className="hud-label text-hud-base text-hud-dim">
        {busy ? "Creating lobby…" : "Loading lobby…"}
      </p>
      {error && <ErrorText text={error} />}
    </PageShell>
  );
}

function LobbyActions({
  lobby,
  isHost,
  me,
  onLeave,
  onReady,
  onStart,
}: {
  lobby: LobbyDoc;
  isHost: boolean;
  me: LobbyPlayer | undefined;
  onLeave: () => void;
  onReady: () => void;
  onStart: () => void;
}) {
  const waitingOn = lobbyWaitingOn(lobby, me, isHost);
  const startable = isHost && canStart(lobby);
  return (
    <>
      <HudButton variant="ghost" onClick={onLeave}>
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
          onClick={onReady}
        >
          {me?.ready ? "Not ready" : "Ready!"}
        </HudButton>
        {isHost && (
          <HudButton
            variant={startable ? "primary" : "secondary"}
            size="lg"
            disabled={!canStart(lobby)}
            onClick={onStart}
          >
            Start Match
          </HudButton>
        )}
      </div>
    </>
  );
}

function LobbyPlayers({
  lobby,
  isHost,
  opponentAction,
}: {
  lobby: LobbyDoc;
  isHost: boolean;
  opponentAction: ReactNode;
}) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <PlayerCard
        label={isHost ? "You (Host)" : "Host"}
        player={lobby.players[lobby.hostUid]}
        action={isHost ? null : opponentAction}
      />
      <PlayerCard
        label={isHost ? "Guest" : "You (Guest)"}
        player={lobby.guestUid ? lobby.players[lobby.guestUid] : null}
        empty={!lobby.guestUid ? "Waiting for opponent…" : undefined}
        action={isHost ? opponentAction : null}
      />
    </div>
  );
}

function TeamPicker({
  me,
  fixture,
  myTeams,
  gameType,
  onPick,
}: {
  me: LobbyPlayer | undefined;
  fixture: boolean;
  myTeams: Team[];
  gameType: GameType;
  onPick: (team: Team) => void;
}) {
  if (fixture && me?.team)
    return (
      <p className="font-hud-body text-hud-base text-hud-bone">
        {me.team.name} ({me.team.rosterName}) — locked for this fixture
      </p>
    );
  if (myTeams.length === 0)
    return (
      <p className="font-hud-body text-hud-base text-hud-dim">
        No saved teams — build one first.
      </p>
    );
  return (
    <TeamChoice
      chosen={me?.team ?? null}
      myTeams={myTeams}
      gameType={gameType}
      onPick={onPick}
    />
  );
}

function TeamChoice({
  chosen,
  myTeams,
  gameType,
  onPick,
}: {
  chosen: Team | null;
  myTeams: Team[];
  gameType: GameType;
  onPick: (team: Team) => void;
}) {
  const label = GAME_TYPE_LABELS[gameType];
  return (
    <>
      <select
        value={chosen?.id ?? ""}
        onChange={(e) => {
          const team = myTeams.find((t: Team) => t.id === e.target.value);
          if (team) onPick(team);
        }}
        aria-label="Your team"
        className="hud-field"
      >
        <option value="" disabled>
          Pick a team…
        </option>
        {myTeams.map((team: Team) => (
          <option
            key={team.id}
            value={team.id}
            disabled={!teamPlaysGameType(team, gameType)}
          >
            {team.name} ({team.rosterName})
            {teamPlaysGameType(team, gameType)
              ? ""
              : ` · not legal for ${label}`}
          </option>
        ))}
      </select>
      {chosen && !teamPlaysGameType(chosen, gameType) && (
        <Notice tone="warn" className="mt-3">
          {chosen.name} does not meet the {label} draft rules. Pick another
          team.
        </Notice>
      )}
    </>
  );
}

function PlayerCard({
  label,
  player,
  empty,
  action,
}: {
  label: string;
  player: LobbyPlayer | null | undefined;
  empty?: string | undefined;
  action: ReactNode;
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {player.ready ? (
              <Chip tone="good">READY</Chip>
            ) : (
              <Chip>not ready</Chip>
            )}
            {action}
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

export function SettingsPanel({
  settings,
  readOnly,
  gameTypeLocked = false,
  onChange,
}: {
  settings: LobbySettings;
  readOnly: boolean;
  gameTypeLocked?: boolean;
  onChange: (settings: LobbySettings) => void;
}) {
  return (
    <Section
      title={readOnly ? "Match settings (host decides)" : "Match settings"}
      bodyClassName="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Turn timer"
          hint="Choose No time limit for a relaxed game. Turns and decisions can take as long as you need."
        >
          <select
            disabled={readOnly}
            value={settings.turnSeconds}
            onChange={(e) => {
              onChange({ ...settings, turnSeconds: Number(e.target.value) });
            }}
            className="hud-field"
          >
            {[60, 90, 120, 180, 240].map((s) => (
              <option key={s} value={s}>
                {s / 60} min
              </option>
            ))}

            <option value={0}>No time limit</option>
          </select>
        </Field>
        <Field label="Timeout bank">
          <select
            disabled={readOnly}
            value={settings.timeoutBankMs}
            onChange={(e) => {
              onChange({ ...settings, timeoutBankMs: Number(e.target.value) });
            }}
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
          onChange={(event) => {
            onChange({
              ...settings,
              progressionEnabled: event.target.checked,
            });
          }}
        />
      </label>
      <GameTypeSelector
        {...(settings.gameType === undefined
          ? {}
          : { value: settings.gameType })}
        disabled={readOnly || gameTypeLocked}
        onChange={(gameType) => {
          onChange({ ...settings, gameType });
        }}
      />
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
