import { firebaseDocument } from "../boundary/firebaseJson";
import { doc, setDoc } from "firebase/firestore";
import { subscribeToAuth } from "./auth";
import { getDb } from "./config";
import { setDiceLogUploader } from "../game/persistence/diceLogStore";

export function connectDiceLogsToAuth(): void {
  subscribeToAuth((user) => {
    setDiceLogUploader(
      user
        ? (log) =>
            setDoc(
              doc(getDb(), "users", user.uid, "dice-logs", log.id),
              firebaseDocument(log)
            )
        : null
    );
  });
}
