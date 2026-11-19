import { usePregameInducements } from "../components/hud/pregameInducementHooks";
import { PregameInducements } from "../components/hud/PregameInducements";
import { useEffect, useRef, useState } from "react";
import { EventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { SubPhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import {
  DialogShell,
  HudButton,
  HudCoin,
} from "../components/componentWarehouse/HudKit";
import {
  type LobbyDoc,
  setCoinFlipReady,
  setCoinFlipWinner,
  setCoinFlipChoice,
} from "../../firebase/lobby";
import { type OnlineMatch } from "../../network/OnlineMatch";
import { soundSettings } from "../sound/settings";
import type { DiceThrow } from "../dice/diceScene";
import { teamLook } from "../components/hud/diceTrayData";
import { RESULT_BEAT_MS } from "../components/hud/CoinFlipOverlay";
import { DIE_LANDING_TIMEOUT_MS } from "../../game/presentation/diceWatch";
import { weatherRolled } from "../../services/gameService/matchStart";
import { useEventBus } from "../hooks/useEventBus";
import {
  WeatherResult,
  WeatherStage,
  WeatherTable,
  useWeatherThrow,
} from "../components/hud/WeatherReveal";
import type { Weather } from "../../game/rules/weather";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
}

function readyForToss(
  pregame: ReturnType<typeof usePregameInducements>,
  cf: NonNullable<LobbyDoc["coinFlip"]>
): boolean {
  return (
    (!pregame.pregame || !pregame.pending) && !!cf.hostReady && !!cf.guestReady
  );
}

export function OnlineCoinFlip(props: Props) {
  const cf = props.lobby.coinFlip ?? {};

  const [weatherRead, setWeatherRead] = useState(
    !!(cf.hostReady || cf.guestReady || cf.winnerTeamId)
  );
  if (!weatherRead)
    return (
      <OnlineWeather
        {...props}
        onRead={() => {
          setWeatherRead(true);
        }}
      />
    );
  return <OnlineToss {...props} />;
}

function engineState() {
  return ServiceContainer.isInitialized()
    ? ServiceContainer.getInstance().gameService.getState()
    : null;
}

function OnlineWeather({
  match,
  eventBus,
  onRead,
}: Props & { onRead: () => void }) {
  const { team1, team2 } = match.teams;
  const myTeamId = match.myTeamId;
  const amHost = match.role === "host";
  const readyNow = () => engineState()?.weatherReady ?? [];
  const [ready, setReady] = useState<string[]>(readyNow);
  useEventBus(eventBus, GameEventNames.WeatherReady, ({ teamIds }) => {
    setReady(teamIds);
  });
  const sent = useRef(false);

  useEventBus(eventBus, GameEventNames.GameStateRestored, () => {
    const now = readyNow();
    if (!now.includes(myTeamId)) sent.current = false;
    setReady(now);
  });
  const { stage, step, total } = useWeatherThrow({ eventBus: eventBus, teamId: team1.id, rolled: () => {
    const state = engineState();
    return !!state && weatherRolled(state);
  } });
  const weather: Weather = engineState()?.weather ?? "Nice";

  const [wantReady, setWantReady] = useState(false);

  useEventBus(eventBus, GameEventNames.NetworkCommandRejected, (rejected) => {
    if (rejected.commandType !== "ready-weather") return;
    sent.current = false;
    setWantReady(false);
    setReady(readyNow());
  });
  const iAmReady = wantReady || ready.includes(myTeamId);
  const guestTeamId = amHost
    ? myTeamId === team1.id
      ? team2.id
      : team1.id
    : myTeamId;
  useEffect(() => {
    if (!wantReady || sent.current || ready.includes(myTeamId)) return;
    if (amHost && !ready.includes(guestTeamId)) return;
    if (!ServiceContainer.isInitialized()) return;
    sent.current = true;
    ServiceContainer.getInstance().gameService.readyForWeather(myTeamId);
  }, [wantReady, ready, amHost, guestTeamId, myTeamId]);
  const readyUp = () => {
    setWantReady(true);
  };

  return (
    <DialogShell
      zClass="z-[100]"
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title="WEATHER"
      width="w-[480px]"
      className="text-center"
      testId="weather-dialog"
    >
      <div className="mb-4 flex items-center justify-center gap-4">
        <TeamChip name={team1.name} me={myTeamId === team1.id} />
        <span className="font-hud-display text-hud-lg text-hud-gold">VS</span>
        <TeamChip name={team2.name} me={myTeamId === team2.id} />
      </div>
      <div className="space-y-4 [@media(max-height:500px)]:space-y-2">
        {step === "waiting" && (
          <p className="text-hud-dim">
            Before kick-off the coaches roll 2D6 on the Weather Table. It sets
            the conditions for the whole match.
          </p>
        )}
        <WeatherStage stage={stage} step={step} />
        {step === "shown" && <WeatherResult weather={weather} total={total} />}
        <WeatherTable result={step === "shown" ? weather : null} />
        {step === "waiting" &&
          (iAmReady ? (
            <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-dim">
              Waiting for {match.opponentName} to ready up…
            </p>
          ) : (
            <HudButton variant="primary" size="lg" block onClick={readyUp}>
              READY — ROLL WEATHER
            </HudButton>
          ))}
        {step === "shown" && (
          <HudButton variant="primary" size="lg" block onClick={onRead}>
            ON TO THE COIN TOSS
          </HudButton>
        )}
      </div>
    </DialogShell>
  );
}

function OnlineToss({ code, lobby, match, eventBus }: Props) {
  const pregame = usePregameInducements(eventBus);
  const amHost = match.role === "host";
  const { team1, team2 } = match.teams;
  const myTeamId = match.myTeamId;
  const cf = lobby.coinFlip ?? {};

  const [spin, setSpin] = useState(0);
  const rolledRef = useRef(false);

  const appliedRef = useRef(lobby.coinFlip?.kickingTeamId != null);

  const [resumed] = useState(lobby.coinFlip?.winnerTeamId != null);
  const [landed, setLanded] = useState(resumed);
  const [coinFailed, setCoinFailed] = useState(false);
  const coinHost = useRef<HTMLDivElement>(null);
  const throwing = useRef<DiceThrow | null>(null);

  const iAmReady = amHost ? !!cf.hostReady : !!cf.guestReady;
  const bothReady = readyForToss(pregame, cf);
  const winnerId = cf.winnerTeamId ?? null;
  const kickingId = cf.kickingTeamId ?? null;
  const teamById = (id: string | null) =>
    id === team1.id ? team1 : id === team2.id ? team2 : null;

  useEffect(() => {
    if (!amHost || !bothReady || winnerId || rolledRef.current) return;
    rolledRef.current = true;
    const winner = Math.random() < 0.5 ? team1 : team2;

    eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Coin Toss",
      diceType: "1d2",
      value: winner.id === team1.id ? 1 : 2,
      total: winner.id === team1.id ? 1 : 2,
      description: `Coin Toss: ${winner.name} wins`,
      resultState: "none",
      teamId: winner.id,
    });
    void setCoinFlipWinner(code, winner.id);
  }, [amHost, bothReady, winnerId, code, eventBus, team1, team2]);

  useEffect(() => {
    if (!bothReady || winnerId) return;
    const id = setInterval(() => {
      setSpin((s) => s + 72);
    }, 60);
    return () => {
      clearInterval(id);
    };
  }, [bothReady, winnerId]);

  useEffect(() => {
    if (!amHost || !kickingId || appliedRef.current) return;
    appliedRef.current = true;

    const gs = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService
      : null;

    if (!gs || gs.getSubPhase() !== SubPhase.INTRO) return;

    const kickingTeam = teamById(kickingId);
    const receivingTeam = kickingId === team1.id ? team2 : team1;
    if (kickingTeam) {
      eventBus.emit(GameEventNames.UI_CoinFlipComplete, {
        kickingTeam,
        receivingTeam,
      });
    }
  }, [amHost, kickingId]);

  useEffect(() => {
    if (!winnerId || landed) return;
    let live = true;
    const faces = [teamLook(team1.id), teamLook(team2.id)];
    void (async () => {
      try {
        if (!coinHost.current || !faces[0] || !faces[1])
          throw new Error("no stage");
        const scene = await import("../dice/diceScene");
        if (!live || !coinHost.current) return;
        const handle = scene.playRoll(
          coinHost.current,
          {
            kind: "coin",
            side: winnerId === team1.id ? 1 : 2,
            faces: [faces[0], faces[1]],
          },
          { sound: !soundSettings.get().muted }
        );
        throwing.current = handle;

        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          handle.landed,
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              handle.stop();
              resolve();
            }, DIE_LANDING_TIMEOUT_MS);
          }),
        ]).finally(() => {
          clearTimeout(timer);
        });
        await new Promise((resolve) => setTimeout(resolve, RESULT_BEAT_MS));
      } catch (error) {
        console.warn("[OnlineCoinFlip] could not show the coin", error);
        if (live) setCoinFailed(true);
      }
      if (live) setLanded(true);
    })();
    return () => {
      live = false;
    };
  }, [winnerId]);

  useEffect(() => {
    if (kickingId) throwing.current?.stop();
  }, [kickingId]);
  useEffect(() => () => throwing.current?.stop(), []);

  const ready = () => void setCoinFlipReady(code, amHost);
  const choose = (choice: "kick" | "receive") => {
    if (winnerId !== myTeamId) return;
    const kicking =
      choice === "kick"
        ? winnerId
        : winnerId === team1.id
          ? team2.id
          : team1.id;
    void setCoinFlipChoice(code, kicking);
  };

  if (kickingId) return null;

  if (pregame.pending) return <PregameInducements eventBus={eventBus} />;

  const winner = teamById(winnerId);
  const iWon = winnerId === myTeamId;

  return (
    <DialogShell
      zClass="z-[100]"
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title="COIN TOSS"
      width="w-[480px]"
      className="text-center"
    >
      <div className="mb-5 flex items-center justify-center gap-4">
        <TeamChip name={team1.name} me={myTeamId === team1.id} />
        <span className="font-hud-display text-hud-lg text-hud-gold">VS</span>
        <TeamChip name={team2.name} me={myTeamId === team2.id} />
      </div>

      {!winner && (
        <ReadyCheck
          spin={spin}
          bothReady={bothReady}
          iAmReady={iAmReady}
          opponentName={match.opponentName}
          onReady={ready}
        />
      )}

      <div
        ref={coinHost}
        data-testid="coin-stage"
        className={
          winner && !resumed && !coinFailed
            ? "mx-auto h-[min(220px,34dvh)] w-full"
            : "hidden"
        }
      />

      {winner && landed && (
        <TossResult
          winnerName={winner.name}
          iWon={iWon}
          opponentName={match.opponentName}
          onChoose={choose}
        />
      )}
    </DialogShell>
  );
}

function ReadyCheck({
  spin,
  bothReady,
  iAmReady,
  opponentName,
  onReady,
}: {
  spin: number;
  bothReady: boolean;
  iAmReady: boolean;
  opponentName: string;
  onReady: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center py-4 [perspective:600px]">
        <HudCoin spin={spin} />
      </div>
      {!bothReady ? (
        iAmReady ? (
          <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-dim">
            Waiting for {opponentName} to ready up…
          </p>
        ) : (
          <HudButton variant="primary" size="lg" block onClick={onReady}>
            READY — FLIP COIN
          </HudButton>
        )
      ) : (
        <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-gold">
          Flipping…
        </p>
      )}
    </div>
  );
}

function TossResult({
  winnerName,
  iWon,
  opponentName,
  onChoose,
}: {
  winnerName: string;
  iWon: boolean;
  opponentName: string;
  onChoose: (choice: "kick" | "receive") => void;
}) {
  return (
    <div className="space-y-5 animate-hud-in">
      <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
        {winnerName} wins the toss!
      </div>
      {iWon ? (
        <>
          <p className="text-hud-dim">Choose to kick or receive</p>
          <div className="grid grid-cols-2 gap-3">
            <HudButton
              variant="gold"
              size="lg"
              onClick={() => {
                onChoose("kick");
              }}
            >
              KICK
            </HudButton>
            <HudButton
              variant="primary"
              size="lg"
              onClick={() => {
                onChoose("receive");
              }}
            >
              RECEIVE
            </HudButton>
          </div>
        </>
      ) : (
        <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-dim">
          {opponentName} is choosing to kick or receive…
        </p>
      )}
    </div>
  );
}

function TeamChip({ name, me }: { name: string; me: boolean }) {
  return (
    <span
      className={`min-w-0 truncate rounded-hud border px-3 py-1.5 font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] ${
        me
          ? "border-hud-gold bg-hud-gold/15 text-hud-bone"
          : "border-white/10 text-hud-bone/80"
      }`}
    >
      {name}
      {me && <span className="ml-1 text-hud-xs text-hud-gold">(you)</span>}
    </span>
  );
}
