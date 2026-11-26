import { usePregameInducements } from "./pregameInducementHooks";
import { PregameInducements } from "./PregameInducements";
import React, { useState, useEffect, useRef } from "react";
import { useEventBus } from "../../hooks/useEventBus";
import { GameEventNames } from "../../../types/events";
import { type Team } from "../../../types/Team";
import { HudButton } from "../componentWarehouse/HudKit";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { ServiceContainer } from "../../../services/ServiceContainer";
import { soundSettings } from "../../sound/settings";
import type { DiceThrow } from "../../dice/diceScene";
import { CoinTossPanel, KickOrReceive, TossWinner } from "./CoinTossPanel";
import { RollBusy } from "./RollShell";
import { teamLook } from "./diceTrayData";
import type { EventBus } from "../../../services/EventBus";

export const RESULT_BEAT_MS = 700;

interface CoinFlipProps {
  eventBus: EventBus;
}

export const CoinFlipOverlay: React.FC<CoinFlipProps> = ({ eventBus }) => {
  const pregame = usePregameInducements(eventBus);
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState<"START" | "FLIPPING" | "RESULT">("START");
  const [teams, setTeams] = useState<{ team1: Team; team2: Team } | null>(null);
  const [winner, setWinner] = useState<Team | null>(null);
  const [faceImages, setFaceImages] = useState<[string, string] | null>(null);
  const coinHost = useRef<HTMLDivElement>(null);
  const throwing = useRef<DiceThrow | null>(null);

  useEventBus(eventBus, GameEventNames.UI_StartCoinFlip, (data) => {
    const match = getActiveOnlineMatch();
    if (match && match.kind !== "computer") return;
    setTeams({ team1: data.team1, team2: data.team2 });
    setIsVisible(true);
    setStep("START");
    setWinner(null);
  });

  useEffect(() => {
    if (!teams) return;
    const faces = [teamLook(teams.team1.id), teamLook(teams.team2.id)];
    if (!faces[0] || !faces[1]) return;
    let live = true;
    void import("../../dice/diceScene").then((scene) => {
      if (live)
        setFaceImages([
          scene.coinFaceImage(faces[0]!),
          scene.coinFaceImage(faces[1]!),
        ]);
    });
    return () => {
      live = false;
    };
  }, [teams]);

  useEffect(() => () => throwing.current?.stop(), []);

  useEffect(() => {
    const checkState = () => {
      eventBus.emit(GameEventNames.UI_RequestCoinFlipState, undefined);
    };

    const timer = setTimeout(checkState, 100);
    return () => {
      clearTimeout(timer);
    };
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

  const computer = getActiveOnlineMatch();
  const computerWon =
    computer?.kind === "computer" &&
    !!winner &&
    winner.id !== computer.myTeamId;
  useEffect(() => {
    if (step !== "RESULT" || !computerWon) return;
    const timer = setTimeout(() => {
      handleChoice("receive");
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [step, computerWon]);

  if (!isVisible || !teams) return null;
  if (pregame.pending) return <PregameInducements eventBus={eventBus} />;

  return (
    <CoinTossPanel
      stage={coinHost}
      thrown={step !== "START"}
      idle={<CoinSides teams={teams} images={faceImages} />}
      action={
        <TossAction
          step={step}
          computerWon={computerWon}
          onFlip={() => void handleFlip()}
          onChoose={handleChoice}
        />
      }
    >
      {step === "START" && <p className="text-hud-bone">Who will kick off?</p>}
      {step === "RESULT" && winner && (
        <TossWinner
          name={winner.name}
          note={
            computerWon
              ? `${computer.opponentName} chooses to receive`
              : "Choose to kick or receive"
          }
        />
      )}
    </CoinTossPanel>
  );
};

function TossAction({
  step,
  computerWon,
  onFlip,
  onChoose,
}: {
  step: "START" | "FLIPPING" | "RESULT";
  computerWon: boolean;
  onFlip: () => void;
  onChoose: (choice: "kick" | "receive") => void;
}) {
  if (step === "START")
    return (
      <HudButton variant="primary" size="lg" block onClick={onFlip}>
        FLIP COIN
      </HudButton>
    );
  if (step === "FLIPPING") return <RollBusy>Flipping…</RollBusy>;
  return computerWon ? null : (
    <KickOrReceive onChoose={onChoose} />
  );
}

function CoinSides({
  teams,
  images,
}: {
  teams: { team1: Team; team2: Team };
  images: [string, string] | null;
}) {
  return (
    <div className="flex items-start justify-center gap-4">
        {[teams.team1, teams.team2].map((team, i) => (
          <div
            key={team.id}
            className="flex w-28 flex-col items-center gap-2"
            data-testid={`coin-side-${i === 0 ? "heads" : "tails"}`}
          >
            {images && (
              <img
                src={images[i === 0 ? 0 : 1]}
                alt=""
                className="h-20 w-20 rounded-full border-4 border-hud-gold shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
              />
            )}
            <span className="line-clamp-2 max-w-full text-center font-hud-label text-hud-lg font-bold uppercase tracking-[0.03em] text-hud-bone">
              {team.name}
            </span>
          </div>
        ))}
      </div>
  );
}
