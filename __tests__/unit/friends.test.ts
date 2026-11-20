import { describe, expect, it } from "vitest";
import { parseFriendCode } from "../../src/boundary/social";
import {
  formatFriendCode,
  friendLink,
  friendshipKey,
  inviteIsFresh,
  isOnline,
  newFriendship,
} from "../../src/social/friends";

describe("friend links", () => {
  it("key a pair the same way whoever asks", () => {
    expect(friendshipKey("bob", "alice")).toBe("alice__bob");
    expect(friendshipKey("alice", "bob")).toBe("alice__bob");
  });

  it("show a pending request as outgoing to the asker and incoming to the other coach", () => {
    const asked = newFriendship({ me: "zed", other: "amy", now: 5 });

    expect(asked).toEqual({
      uids: ["amy", "zed"],
      requesterUid: "zed",
      status: "pending",
      createdAt: 5,
    });
    expect(friendLink(asked, "zed")).toEqual({
      kind: "outgoing",
      uid: "amy",
      key: "amy__zed",
    });
    expect(friendLink(asked, "amy")).toEqual({
      kind: "incoming",
      uid: "zed",
      key: "amy__zed",
    });
    expect(friendLink({ ...asked, status: "accepted" }, "amy")).toEqual({
      kind: "friend",
      uid: "zed",
      key: "amy__zed",
    });
  });
});

describe("friend codes", () => {
  it("read a typed code with dashes, spaces and lower case", () => {
    expect(parseFriendCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(formatFriendCode("ABCD2345")).toBe("ABCD-2345");
  });

  it("refuse codes with the letters and digits that look alike", () => {
    expect(parseFriendCode("ABCD-1O0I")).toBeNull();
    expect(parseFriendCode("ABC")).toBeNull();
  });
});

describe("presence and invites", () => {
  it("count a coach online for five minutes after they were last seen", () => {
    expect(isOnline(1_000, 1_000 + 4 * 60_000)).toBe(true);
    expect(isOnline(1_000, 1_000 + 5 * 60_000)).toBe(false);
    expect(isOnline(undefined, 1_000)).toBe(false);
  });

  it("drop a match invite two hours after it was sent", () => {
    const invite = {
      kind: "match" as const,
      fromUid: "amy",
      toUid: "zed",
      code: "ABC234",
      createdAt: 0,
    };
    expect(inviteIsFresh(invite, 2 * 60 * 60_000 - 1)).toBe(true);
    expect(inviteIsFresh(invite, 2 * 60 * 60_000)).toBe(false);
  });
});
