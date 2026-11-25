import { type ReactNode, useEffect, useState } from "react";
import { readLobby } from "../boundary/firebaseLobby";
import type { LobbyDoc } from "../firebase/lobby";
import { onCloudChange, putDocument, readDocument } from "./cloud/cloudData";

function readLive(path: string, fallback: LobbyDoc): LobbyDoc {
  const data = readDocument(path);
  return data ? readLobby(data) : fallback;
}

function opponentTosses(path: string, lobby: LobbyDoc, winnerTeamId: string) {
  const { coinFlip } = lobby;
  const waiting =
    coinFlip?.hostReady && coinFlip.guestReady && !coinFlip.winnerTeamId;
  if (!waiting) return undefined;
  const timer = setTimeout(() => {
    putDocument(path, { ...lobby, coinFlip: { ...coinFlip, winnerTeamId } });
  }, 1500);
  return () => {
    clearTimeout(timer);
  };
}

export function LiveLobby({
  lobby,
  hostTossWinner,
  children,
}: {
  lobby: LobbyDoc;
  hostTossWinner?: string;
  children: (lobby: LobbyDoc) => ReactNode;
}) {
  const path = `games/${lobby.code}`;
  const [live, setLive] = useState(() => {
    putDocument(path, lobby);
    return lobby;
  });
  useEffect(
    () =>
      onCloudChange(() => {
        setLive((held) => readLive(path, held));
      }),
    [path]
  );
  useEffect(
    () =>
      hostTossWinner ? opponentTosses(path, live, hostTossWinner) : undefined,
    [path, live, hostTossWinner]
  );
  return children(live);
}
