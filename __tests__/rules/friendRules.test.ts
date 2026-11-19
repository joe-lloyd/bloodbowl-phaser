import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ADMIN,
  as,
  closeEmulatorApps,
  dbFor,
  denied,
  EMULATOR,
  loadRules,
  uniqueUid,
} from "./emulator";

vi.mock("../../src/firebase/config", async () => {
  const { current } = await import("./emulator");
  return { getDb: () => current.db, isFirebaseConfigured: () => true };
});

import {
  ensureCoachProfile,
  findCoachByFriendCode,
  getCoachName,
  setCoachName,
} from "../../src/firebase/coaches";
import {
  acceptFriend,
  removeFriendship,
  requestFriend,
} from "../../src/firebase/friends";
import {
  acceptLobbyInvite,
  dismissInvite,
  inviteFriendToMatch,
  sendMatchInvite,
} from "../../src/firebase/invites";
import { createLobby, fetchLobby } from "../../src/firebase/lobby";
import { friendshipKey } from "../../src/social/friends";
import { readFriendship, readInvite } from "../../src/boundary/social";

async function friends(): Promise<[string, string]> {
  const alice = uniqueUid("alice");
  const bob = uniqueUid("bob");
  await as(alice, () => requestFriend({ me: alice, other: bob }));
  await as(bob, () => acceptFriend(friendshipKey(alice, bob)));
  return [alice, bob];
}

async function friendshipStatus(a: string, b: string) {
  const snapshot = await getDoc(
    doc(dbFor(ADMIN), "friendships", friendshipKey(a, b))
  );
  return snapshot.exists() ? readFriendship(snapshot.data()).status : undefined;
}

describe.skipIf(!EMULATOR)("friends and invites", () => {
  beforeAll(loadRules);
  afterAll(closeEmulatorApps);

  describe("a coach profile", () => {
    it("gets a friend code that finds the coach and stays the same", async () => {
      const alice = uniqueUid("alice");
      const profile = await as(alice, () => ensureCoachProfile(alice));

      expect(profile.friendCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(
        await as(uniqueUid("bob"), () =>
          findCoachByFriendCode(profile.friendCode)
        )
      ).toBe(alice);
      expect(
        (await as(alice, () => ensureCoachProfile(alice))).friendCode
      ).toBe(profile.friendCode);
    });

    it("is made once when two pages ask for it at the same moment", async () => {
      const alice = uniqueUid("alice");
      const [first, second] = await Promise.all([
        as(alice, () => ensureCoachProfile(alice)),
        as(alice, () => ensureCoachProfile(alice)),
      ]);

      expect(second.friendCode).toBe(first.friendCode);
      expect(
        (await as(alice, () => ensureCoachProfile(alice))).friendCode
      ).toBe(first.friendCode);
    });

    it("keeps the name a coach chose before profiles existed", async () => {
      const alice = uniqueUid("alice");
      await setDoc(doc(dbFor(alice), "users", alice), {
        coachName: "Grim Gutrot",
      });

      expect(
        (await as(alice, () => ensureCoachProfile(alice))).coachName
      ).toBe("Grim Gutrot");
      await as(alice, () => setCoachName(alice, "Snotling Sam"));
      expect(await as(alice, () => getCoachName(alice))).toBe("Snotling Sam");
    });

    it("fits a long name saved before profiles existed, and still takes a new one", async () => {
      const alice = uniqueUid("alice");
      await setDoc(doc(dbFor(alice), "users", alice), {
        coachName: "Grimgor Ironhide, Da Biggest Boss of Da Black Crag Boyz",
      });

      expect(
        (await as(alice, () => ensureCoachProfile(alice))).coachName
      ).toBe("Grimgor Ironhide, Da Biggest Boss of Da");
      await as(alice, () => setCoachName(alice, "Grim"));
      expect(await as(alice, () => getCoachName(alice))).toBe("Grim");
    });

    it("keeps a character whole when a name is cut to fit", async () => {
      const alice = uniqueUid("alice");
      const family = "👨‍👩‍👧";
      await setDoc(doc(dbFor(alice), "users", alice), {
        coachName: `${"A".repeat(39)}🏈 and more`,
      });

      expect(
        (await as(alice, () => ensureCoachProfile(alice))).coachName
      ).toBe(`${"A".repeat(39)}🏈`);
      await as(alice, () => setCoachName(alice, `${"B".repeat(39)}${family}${family}`));
      expect(await as(alice, () => getCoachName(alice))).toBe(`${"B".repeat(39)}${family}`);
    });

    it("fits forty wide characters into what the rules accept", async () => {
      const alice = uniqueUid("alice");
      const family = "👨‍👩‍👧‍👦";
      await setDoc(doc(dbFor(alice), "users", alice), {
        coachName: family.repeat(40),
      });

      expect(
        (await as(alice, () => ensureCoachProfile(alice))).coachName
      ).toBe(family.repeat(8));
      await as(alice, () => setCoachName(alice, family.repeat(40)));
      expect(await as(alice, () => getCoachName(alice))).toBe(family.repeat(8));
    });

    it("is written only by its coach, and a code only claimed for yourself", async () => {
      const alice = uniqueUid("alice");
      const mallory = uniqueUid("mallory");
      const profile = await as(alice, () => ensureCoachProfile(alice));

      await denied(
        setDoc(doc(dbFor(mallory), "coaches", alice), {
          ...profile,
          coachName: "Hacked",
        })
      );
      await denied(
        setDoc(doc(dbFor(mallory), "friendCodes", "ZZZZ2222"), { uid: alice })
      );
      await denied(getDocs(collection(dbFor(mallory), "coaches")));
      await denied(getDocs(collection(dbFor(mallory), "friendCodes")));
    });
  });

  describe("a friendship", () => {
    it("is accepted by the coach who was asked, not by the one who asked", async () => {
      const alice = uniqueUid("alice");
      const bob = uniqueUid("bob");

      expect(await as(alice, () => requestFriend({ me: alice, other: bob }))).toBe(
        "requested"
      );
      await denied(as(alice, () => acceptFriend(friendshipKey(alice, bob))));
      await as(bob, () => acceptFriend(friendshipKey(alice, bob)));

      expect(await friendshipStatus(alice, bob)).toBe("accepted");
    });

    it("forms when both coaches ask each other", async () => {
      const alice = uniqueUid("alice");
      const bob = uniqueUid("bob");
      await as(alice, () => requestFriend({ me: alice, other: bob }));

      expect(await as(bob, () => requestFriend({ me: bob, other: alice }))).toBe(
        "accepted"
      );
      expect(await friendshipStatus(alice, bob)).toBe("accepted");
    });

    it("is hidden from other coaches, who cannot end it or forge one", async () => {
      const [alice, bob] = await friends();
      const carol = uniqueUid("carol");
      const key = friendshipKey(alice, bob);

      await denied(getDoc(doc(dbFor(carol), "friendships", key)));
      await denied(deleteDoc(doc(dbFor(carol), "friendships", key)));
      await denied(
        getDocs(
          query(
            collection(dbFor(carol), "friendships"),
            where("uids", "array-contains", alice)
          )
        )
      );
      await denied(
        setDoc(
          doc(dbFor(carol), "friendships", friendshipKey(alice, carol)),
          {
            uids: [alice, carol].sort(),
            requesterUid: alice,
            status: "accepted",
            createdAt: Date.now(),
          }
        )
      );
    });

    it("lists for either coach, and either can end it", async () => {
      const [alice, bob] = await friends();
      const listed = await getDocs(
        query(
          collection(dbFor(bob), "friendships"),
          where("uids", "array-contains", bob)
        )
      );
      expect(listed.docs.map((entry) => entry.id)).toEqual([
        friendshipKey(alice, bob),
      ]);

      await as(alice, () => removeFriendship(friendshipKey(alice, bob)));
      expect(await friendshipStatus(alice, bob)).toBeUndefined();
    });
  });

  describe("a match invite", () => {
    it("brings a friend straight into the host's lobby", async () => {
      const [alice, bob] = await friends();
      const code = await as(alice, () =>
        inviteFriendToMatch({ fromUid: alice, toUid: bob })
      );
      const inbox = await getDocs(
        query(collection(dbFor(bob), "invites"), where("toUid", "==", bob))
      );
      expect(inbox.docs.map((entry) => entry.data())).toEqual([
        expect.objectContaining({ kind: "match", fromUid: alice, code }),
      ]);

      const invite = inbox.docs.map((entry) => readInvite(entry.data()))[0];
      if (invite?.kind !== "match") throw new Error("no invite");
      const joined = await as(bob, () => acceptLobbyInvite(invite));

      expect(joined).toBe(code);
      expect((await as(alice, () => fetchLobby(code)))?.guestUid).toBe(bob);
      expect(
        (
          await getDocs(
            query(collection(dbFor(bob), "invites"), where("toUid", "==", bob))
          )
        ).size
      ).toBe(0);
    });

    it("reuses the host's open lobby for a second friend", async () => {
      const [alice, bob] = await friends();
      const carol = uniqueUid("carol");
      await as(alice, () => requestFriend({ me: alice, other: carol }));
      await as(carol, () => acceptFriend(friendshipKey(alice, carol)));

      const first = await as(alice, () =>
        inviteFriendToMatch({ fromUid: alice, toUid: bob })
      );
      const second = await as(alice, () =>
        inviteFriendToMatch({ fromUid: alice, toUid: carol })
      );
      expect(second).toBe(first);
    });

    it("is shared when the host invites two friends at once", async () => {
      const [alice, bob] = await friends();
      const carol = uniqueUid("carol");
      await as(alice, () => requestFriend({ me: alice, other: carol }));
      await as(carol, () => acceptFriend(friendshipKey(alice, carol)));

      const codes = await as(alice, () =>
        Promise.all([
          inviteFriendToMatch({ fromUid: alice, toUid: bob }),
          inviteFriendToMatch({ fromUid: alice, toUid: carol }),
        ])
      );
      expect(codes[1]).toBe(codes[0]);
    });

    it("cannot pull a coach out of a match they are playing", async () => {
      const [alice, bob] = await friends();
      const { code } = await as(alice, () => createLobby(alice, "Alice"));
      await setDoc(doc(dbFor(ADMIN), "users", bob), { activeMatchCode: "PLAYIN" });
      await setDoc(doc(dbFor(ADMIN), "games", "PLAYIN"), {
        code: "PLAYIN",
        hostUid: bob,
        guestUid: alice,
        status: "active",
        settings: { turnSeconds: 0, timeoutBankMs: 0, progressionEnabled: false },
        players: {},
        createdAt: null,
      });

      await expect(
        as(bob, () =>
          acceptLobbyInvite({ kind: "match", fromUid: alice, toUid: bob, code, createdAt: 1 })
        )
      ).rejects.toThrow("Finish your current match before accepting an invite.");
      expect((await as(alice, () => fetchLobby(code)))?.guestUid).toBeNull();
    });

    it("is cleared only if it is still the one the coach answered", async () => {
      const [alice, bob] = await friends();
      const first = await as(alice, () => createLobby(alice, "Alice"));
      await as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code: first.code }));
      const answered = (
        await getDocs(query(collection(dbFor(bob), "invites"), where("toUid", "==", bob)))
      ).docs.map((entry) => readInvite(entry.data()))[0];
      if (!answered) throw new Error("no invite");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code: "NEWONE" }));

      await as(bob, () => dismissInvite(answered));
      const left = await getDocs(query(collection(dbFor(bob), "invites"), where("toUid", "==", bob)));
      expect(left.docs.map((entry) => readInvite(entry.data()))).toEqual([
        expect.objectContaining({ code: "NEWONE" }),
      ]);
      await as(bob, () => dismissInvite(answered));
    });

    it("is cleared without touching a replacement sent in the same millisecond", async () => {
      const [alice, bob] = await friends();
      const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      try {
        await as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code: "FIRST1" }));
        const answered = (
          await getDocs(query(collection(dbFor(bob), "invites"), where("toUid", "==", bob)))
        ).docs.map((entry) => readInvite(entry.data()))[0];
        if (!answered) throw new Error("no invite");
        await as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code: "SECOND" }));

        await as(bob, () => dismissInvite(answered));
      } finally {
        now.mockRestore();
      }
      const left = await getDocs(query(collection(dbFor(bob), "invites"), where("toUid", "==", bob)));
      expect(left.docs.map((entry) => readInvite(entry.data()))).toEqual([
        expect.objectContaining({ code: "SECOND", createdAt: 1_700_000_000_000 }),
      ]);
    });

    it("goes only to friends, and only the two coaches can see it", async () => {
      const [alice, bob] = await friends();
      const carol = uniqueUid("carol");
      const { code } = await as(alice, () => createLobby(alice, "Alice"));

      await denied(
        as(alice, () => sendMatchInvite({ fromUid: alice, toUid: carol, code }))
      );
      await as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code }));
      await denied(
        getDocs(
          query(collection(dbFor(carol), "invites"), where("toUid", "==", bob))
        )
      );
      await denied(
        as(carol, () => sendMatchInvite({ fromUid: alice, toUid: bob, code }))
      );
    });

    it("stops once the coaches are no longer friends", async () => {
      const [alice, bob] = await friends();
      const { code } = await as(alice, () => createLobby(alice, "Alice"));
      await as(bob, () => removeFriendship(friendshipKey(alice, bob)));

      await denied(
        as(alice, () => sendMatchInvite({ fromUid: alice, toUid: bob, code }))
      );
    });
  });
});
