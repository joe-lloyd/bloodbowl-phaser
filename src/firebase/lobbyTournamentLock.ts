import { doc, type Transaction } from "firebase/firestore";
import { readCloudTeam } from "../boundary/firebaseTeam";
import { friendlyRefusal } from "../game/rules/club";
import { getDb } from "./config";
import type { LobbyDoc } from "./lobby";

export async function tournamentLock(
  tx: Transaction,
  lobby: LobbyDoc
): Promise<string | undefined> {
  if (lobby.competitionContext) return undefined;
  const seats = Object.values(lobby.players).flatMap((player) =>
    player.team ? [{ uid: player.uid, teamId: player.team.id }] : []
  );
  const saved = await Promise.all(
    seats.map(({ uid, teamId }) =>
      tx.get(doc(getDb(), "users", uid, "teams", teamId))
    )
  );
  return saved
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => friendlyRefusal(readCloudTeam(snapshot.data()).team))
    .find((refusal) => refusal !== undefined);
}
