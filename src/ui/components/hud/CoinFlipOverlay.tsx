import React, { useState, useEffect, useRef } from "react";
import { EventBus } from "../../../services/EventBus";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { Team } from "../../../types/Team";
import { DialogShell, HudButton } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { soundSettings } from "../../sound/settings";
import type { DiceThrow } from "../../dice/diceScene";
import { teamLook } from "./DiceTray";

/** How long the landed coin shows its face before the winner is named. */
const RESULT_BEAT_MS = 700;

interface CoinFlipProps {
  eventBus: EventBus;
}

export const CoinFlipOverlay: React.FC<CoinFlipProps> = ({ eventBus }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState<"START" | "FLIPPING" | "RESULT">("START");
  const [teams, setTeams] = useState<{ team1: Team; team2: Team } | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);
  const [faceImages, setFaceImages] = useState<[string, string] | null>(null);
  const coinHost = useRef<HTMLDivElement>(null);
  const throwing = useRef<DiceThrow | null>(null);

  // Listen for start request. Online matches use the shared OnlineCoinFlip
  // (ready check + host-authoritative result) instead of this local overlay.
  useEventBus(eventBus, GameEventNames.UI_StartCoinFlip, (data) => {
    if (getActiveOnlineMatch()) return;
    setTeams({ team1: data.team1, team2: data.team2 });
    setIsVisible(true);
    setStep("START");
    setWinner(null);
  });

  // Show the coach which side is whose before the toss
  useEffect(() => {
    if (!teams) return;
    const faces = [teamLook(teams.team1.id), teamLook(teams.team2.id)];
    if (!faces[0] || !faces[1]) return;
    let live = true;
    void import("../../dice/diceScene").then((scene) => {
      if (live)
        setFaceImages([
          scene.coinFaceImage(faces[0]!, false),
          scene.coinFaceImage(faces[1]!, false),
        ]);
    });
    return () => {
      live = false;
    };
  }, [teams]);

  // The coin stops drawing once the overlay goes
  useEffect(() => () => throwing.current?.stop(), []);

  // Initial check for active coin flip (Race condition fix)
  useEffect(() => {
    const checkState = () => {
      eventBus.emit(GameEventNames.UI_RequestCoinFlipState);
    };
    // Small delay to ensure GameScene is ready
    const timer = setTimeout(checkState, 100);
    return () => clearTimeout(timer);
  }, [eventBus]);

  const handleFlip = async () => {
    if (!teams || step !== "START") return;
    setStep("FLIPPING");
    const { gameService } = ServiceContainer.getInstance();
    const winnerId = gameService.tossCoin();
    const winningTeam = winnerId === teams.team1.id ? teams.team1 : teams.team2;
    const faces = [teamLook(teams.team1.id), teamLook(teams.team2.id)];
    try {
      if (!coinHost.current || !faces[0] || !faces[1])
        throw new Error("no stage");
      const scene = await import("../../dice/diceScene");
      const handle = scene.playRoll(
        coinHost.current,
        {
          kind: "coin",
          side: winningTeam === teams.team1 ? 1 : 2,
          faces: [faces[0], faces[1]],
          neon: false,
        },
        { sound: !soundSettings.get().muted }
      );
      throwing.current = handle;
      await handle.landed;
      await new Promise((resolve) => setTimeout(resolve, RESULT_BEAT_MS));
    } catch (error) {
      console.warn("[CoinFlipOverlay] could not show the coin", error);
    }
    setWinner(winningTeam);
    setStep("RESULT");
  };

  const handleChoice = (choice: "kick" | "receive") => {
    if (!teams || !winner) return;

    const loser = winner.id === teams.team1.id ? teams.team2 : teams.team1;
    const kickingTeam = choice === "kick" ? winner : loser;
    const receivingTeam = choice === "receive" ? winner : loser;

    eventBus.emit(GameEventNames.UI_CoinFlipComplete, {
      kickingTeam,
      receivingTeam,
    });
    throwing.current?.stop();
    throwing.current = null;
    setIsVisible(false);
  };

  if (!isVisible || !teams) return null;

  return (
    <DialogShell
      zClass="z-50"
      placement="center"
      backdrop="heavy"
      titleAs="h1"
      title="COIN TOSS"
      width="w-[480px]"
      className="text-center"
    >
      {step === "START" && (
        <div className="space-y-5 [@media(max-height:500px)]:space-y-3">
          <p className="font-hud-label text-hud-lg font-bold uppercase tracking-[0.06em] text-hud-gold">
            Who will kick off?
          </p>
          <div className="flex items-start justify-center gap-6">
            {[teams.team1, teams.team2].map((team, i) => (
              <div
                key={team.id}
                className="flex w-40 flex-col items-center gap-2"
                data-testid={`coin-side-${i === 0 ? "heads" : "tails"}`}
              >
                {faceImages && (
                  <img
                    src={faceImages[i]}
                    alt=""
                    className="h-20 w-20 rounded-full border-4 border-hud-gold shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
                  />
                )}
                <span className="hud-label">
                  {i === 0 ? "Heads" : "Tails"}
                </span>
                <span className="min-w-0 truncate font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
                  {team.name}
                </span>
              </div>
            ))}
          </div>
          <HudButton variant="primary" size="lg" block onClick={handleFlip}>
            FLIP COIN
          </HudButton>
        </div>
      )}

      <div
        ref={coinHost}
        data-testid="coin-stage"
        className={
          step === "START" ? "hidden" : "mx-auto h-[min(220px,34dvh)] w-full"
        }
      />

      {step === "RESULT" && winner && (
        <div className="space-y-5 animate-hud-in [@media(max-height:500px)]:space-y-3">
          <div className="font-hud-display text-hud-2xl uppercase tracking-[0.02em] text-hud-gold">
            {winner.name} Wins!
          </div>
          <p className="text-hud-dim">Choose to Kick or Receive</p>

          <div className="grid grid-cols-2 gap-3">
            <HudButton
              variant="gold"
              size="lg"
              onClick={() => handleChoice("kick")}
            >
              KICK
            </HudButton>
            <HudButton
              variant="primary"
              size="lg"
              onClick={() => handleChoice("receive")}
            >
              RECEIVE
            </HudButton>
          </div>
        </div>
      )}
    </DialogShell>
  );
};
