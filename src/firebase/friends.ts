import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { readEach } from "../boundary/readEach";
import { type Friendship, readFriendship } from "../boundary/social";
import { friendshipKey, newFriendship } from "../social/friends";
import { getDb } from "./config";

export type FriendRequestOutcome = "requested" | "accepted" | "already";

function friendshipRef(key: string) {
  return doc(getDb(), "friendships", key);
}

export async function requestFriend({
  me,
  other,
}: {
  me: string;
  other: string;
}): Promise<FriendRequestOutcome> {
  if (me === other) throw new Error("That is your own friend code.");
  const ref = friendshipRef(friendshipKey(me, other));
  return runTransaction(getDb(), async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) {
      tx.set(ref, newFriendship({ me, other, now: Date.now() }));
      return "requested";
    }
    const existing = readFriendship(snapshot.data());
    if (existing.status === "pending" && existing.requesterUid !== me) {
      tx.update(ref, { status: "accepted" });
      return "accepted";
    }
    return "already";
  });
}

export async function acceptFriend(key: string): Promise<void> {
  await updateDoc(friendshipRef(key), { status: "accepted" });
}

export async function removeFriendship(key: string): Promise<void> {
  await deleteDoc(friendshipRef(key));
}

export function subscribeFriendships(
  uid: string,
  onChange: (friendships: Friendship[]) => void
): () => void {
  return onSnapshot(
    query(
      collection(getDb(), "friendships"),
      where("uids", "array-contains", uid)
    ),
    (snapshot) => {
      onChange(
        readEach(snapshot.docs, (document) => readFriendship(document.data()))
      );
    },
    (error) => {
      console.warn("[friends] could not follow friendships", error);
    }
  );
}
