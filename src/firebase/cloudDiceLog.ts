import { doc, setDoc } from "firebase/firestore";
import { subscribeToAuth } from "./auth";
import { getDb } from "./config";
import { setDiceLogUploader } from "../game/persistence/diceLogStore";

/** A signed-in coach's dice logs also go to users/{uid}/dice-logs/{logId}. */
export function connectDiceLogsToAuth(): void {
  subscribeToAuth((user) => {
    setDiceLogUploader(
      user
        ? (log) =>
            setDoc(
              doc(getDb(), "users", user.uid, "dice-logs", log.id),
              JSON.parse(JSON.stringify(log))
            )
        : null
    );
  });
}
