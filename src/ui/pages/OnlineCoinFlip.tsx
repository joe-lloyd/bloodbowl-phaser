import { useEffect, useRef, useState } from "react";
import { EventBus } from "../../services/EventBus";
import { GameEventNames } from "../../types/events";
import { SubPhase } from "../../types/GameState";
import { ServiceContainer } from "../../services/ServiceContainer";
import { Button, DangerButton } from "../components/componentWarehouse/Button";
import { Title } from "../components/componentWarehouse/Titles";
import { LobbyDoc, setCoinFlipReady, setCoinFlipWinner, setCoinFlipChoice } from "../../firebase/lobby";
import { OnlineMatch } from "../../network/OnlineMatch";

interface Props {
  code: string;
  lobby: LobbyDoc;
  match: OnlineMatch;
  eventBus: EventBus;
}

/**
 * Shared, host-authoritative coin toss for online matches.
 *
 * 1. Both players ready up (dual-active ready check).
 * 2. The host rolls the winner and writes it to the lobby doc; both see the
 *    same result in real time.
 * 3. Only the winner may choose kick/receive — the loser watches.
 * 4. The host applies the result to its engine (UI_CoinFlipComplete →
 *    startSetup), which flows setup to both sides via broadcasts.
 */
export function OnlineCoinFlip({ code, lobby, match, eventBus }: Props) {
  const amHost = match.role === "host";
  const { team1, team2 } = match.teams;
  const myTeamId = match.myTeamId;
  const cf = lobby.coinFlip ?? {};

  const [spin, setSpin] = useState(0);
  const rolledRef = useRef(false);
  // If the toss was already resolved when we mounted (a resumed match), never
  // re-apply it — that would re-run setup. Only a toss completed live applies.
  const appliedRef = useRef(lobby.coinFlip?.kickingTeamId != null);

  const iAmReady = amHost ? !!cf.hostReady : !!cf.guestReady;
  const bothReady = !!cf.hostReady && !!cf.guestReady;
  const winnerId = cf.winnerTeamId ?? null;
  const kickingId = cf.kickingTeamId ?? null;
  const teamById = (id: string | null) =>
    id === team1.id ? team1 : id === team2.id ? team2 : null;

  // Host: once both are ready, roll the winner (authoritative) — exactly once.
  useEffect(() => {
    if (!amHost || !bothReady || winnerId || rolledRef.current) return;
    rolledRef.current = true;
    const winner = Math.random() < 0.5 ? team1 : team2;
    // Log the toss like any other dice roll; broadcasts to the guest.
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

  // A little spin animation while waiting for the result
  useEffect(() => {
    if (!bothReady || winnerId) return;
    const id = setInterval(() => setSpin((s) => s + 72), 60);
    return () => clearInterval(id);
  }, [bothReady, winnerId]);

  // Host: apply the finished toss to the engine — exactly once — which starts
  // setup. The guard is the live engine state, not just a ref: startSetup
  // moves the engine to SETUP_KICKING, so if we ever re-run this effect
  // (re-render/remount) we detect the toss is already applied and do nothing.
  // Without this, a repeated apply re-emits startSetup in a loop.
  useEffect(() => {
    if (!amHost || !kickingId || appliedRef.current) return;
    appliedRef.current = true;

    const gs = ServiceContainer.isInitialized()
      ? ServiceContainer.getInstance().gameService
      : null;
    // Already past the toss (applied here or on a resumed match) — skip.
    if (!gs || gs.getSubPhase() !== SubPhase.INTRO) return;

    const kickingTeam = teamById(kickingId);
    const receivingTeam = kickingId === team1.id ? team2 : team1;
    if (kickingTeam) {
      eventBus.emit(GameEventNames.UI_CoinFlipComplete, {
        kickingTeam,
        receivingTeam,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amHost, kickingId]);

  const ready = () => void setCoinFlipReady(code, amHost);
  const choose = (choice: "kick" | "receive") => {
    if (winnerId !== myTeamId) return; // only the winner chooses
    const kicking = choice === "kick" ? winnerId : winnerId === team1.id ? team2.id : team1.id;
    void setCoinFlipChoice(code, kicking);
  };

  // Done — the engine takes over from here.
  if (kickingId) return null;

  const winner = teamById(winnerId);
  const iWon = winnerId === myTeamId;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 pointer-events-auto">
      <div className="bg-bb-parchment p-8 rounded-lg border-4 border-bb-gold shadow-2xl text-center max-w-lg w-full">
        <Title className="mb-6">COIN TOSS</Title>

        <div className="flex justify-center gap-6 text-bb-text-dark font-bold mb-6">
          <TeamChip name={team1.name} me={myTeamId === team1.id} />
          <span className="self-center">VS</span>
          <TeamChip name={team2.name} me={myTeamId === team2.id} />
        </div>

        {!winner && (
          <div className="space-y-6">
            <div className="py-6 flex justify-center">
              <div
                className="text-6xl select-none transition-transform"
                style={{ transform: `rotateY(${spin}deg)` }}
              >
                🪙
              </div>
            </div>
            {!bothReady ? (
              iAmReady ? (
                <p className="text-lg font-heading text-bb-muted-text">
                  Waiting for {match.opponentName} to ready up…
                </p>
              ) : (
                <Button className="w-full text-xl py-3" onClick={ready}>
                  READY — FLIP COIN
                </Button>
              )
            ) : (
              <p className="text-lg font-heading text-bb-blood-red">
                Flipping…
              </p>
            )}
          </div>
        )}

        {winner && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-2xl font-heading text-bb-ink-blue">
              {winner.name} wins the toss!
            </div>
            {iWon ? (
              <>
                <p className="text-bb-muted-text">Choose to kick or receive</p>
                <div className="grid grid-cols-2 gap-4">
                  <Button onClick={() => choose("kick")}>KICK</Button>
                  <DangerButton onClick={() => choose("receive")}>
                    RECEIVE
                  </DangerButton>
                </div>
              </>
            ) : (
              <p className="text-lg font-heading text-bb-muted-text">
                {match.opponentName} is choosing to kick or receive…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamChip({ name, me }: { name: string; me: boolean }) {
  return (
    <span
      className={
        me
          ? "px-3 py-1 rounded bg-bb-blood-red text-bb-parchment"
          : "px-3 py-1"
      }
    >
      {name}
      {me && <span className="ml-1 text-xs">(you)</span>}
    </span>
  );
}
