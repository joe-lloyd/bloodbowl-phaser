import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { readEach } from "../boundary/readEach";
import { type Invite, readInvite } from "../boundary/social";
import { inviteId, sameInvite } from "../social/friends";
import { getDb } from "./config";
import { resolveCoachName } from "./coaches";
import {
  createLobby,
  fetchLobby,
  getActiveMatchCode,
  joinInvitedLobby,
} from "./lobby";

function inviteRef(invite: Invite) {
  return doc(getDb(), "invites", inviteId(invite));
}

export async function sendMatchInvite({
  fromUid,
  toUid,
  code,
}: {
  fromUid: string;
  toUid: string;
  code: string;
}): Promise<void> {
  const invite: Invite = {
    kind: "match",
    fromUid,
    toUid,
    code,
    createdAt: Date.now(),
  };
  await setDoc(inviteRef(invite), invite);
}

const choosingLobby = new Map<string, Promise<string>>();

function friendlyLobbyCode(uid: string): Promise<string> {
  const pending = choosingLobby.get(uid);
  if (pending) return pending;
  const choice = chooseFriendlyLobby(uid).finally(() => {
    choosingLobby.delete(uid);
  });
  choosingLobby.set(uid, choice);
  return choice;
}

async function chooseFriendlyLobby(uid: string): Promise<string> {
  const current = await getActiveMatchCode(uid);
  const lobby = current ? await fetchLobby(current) : null;
  if (lobby?.status === "active")
    throw new Error("Finish your current match before inviting a friend.");
  const reusable =
    lobby?.status === "lobby" &&
    lobby.hostUid === uid &&
    !lobby.guestUid &&
    !lobby.competitionContext;
  if (reusable) return lobby.code;
  return (await createLobby(uid, await resolveCoachName(uid))).code;
}

export async function inviteFriendToMatch({
  fromUid,
  toUid,
}: {
  fromUid: string;
  toUid: string;
}): Promise<string> {
  const code = await friendlyLobbyCode(fromUid);
  await sendMatchInvite({ fromUid, toUid, code });
  return code;
}

export async function dismissInvite(invite: Invite): Promise<void> {
  const ref = inviteRef(invite);
  await runTransaction(getDb(), async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return;
    if (sameInvite(readInvite(snapshot.data()), invite)) tx.delete(ref);
  });
}

export async function acceptMatchInvite(invite: Invite): Promise<string> {
  const joined = await joinInvitedLobby(invite.code, {
    uid: invite.toUid,
    displayName: await resolveCoachName(invite.toUid),
  });
  await dismissInvite(invite).catch((error: unknown) => {
    console.warn("[invites] could not clear an accepted invite", error);
  });
  return joined.code;
}

export function subscribeInvites(
  uid: string,
  onChange: (invites: Invite[]) => void
): () => void {
  return onSnapshot(
    query(collection(getDb(), "invites"), where("toUid", "==", uid)),
    (snapshot) => {
      onChange(
        readEach(snapshot.docs, (document) => readInvite(document.data()))
      );
    },
    (error) => {
      console.warn("[invites] could not follow invites", error);
    }
  );
}
