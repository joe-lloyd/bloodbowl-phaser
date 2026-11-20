import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import type { FriendRow } from "../../src/ui/hooks/useSocial";
import { FriendButton } from "../../src/ui/components/social/LobbyFriends";

vi.mock("../../src/firebase/friends", () => ({
  requestFriend: () => Promise.resolve("requested"),
}));

const incoming: FriendRow = {
  kind: "incoming",
  uid: "rival",
  key: "me__rival",
  name: "Rival",
  lastSeen: undefined,
};

describe("the friend button on an opponent's card", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = (friends: FriendRow[]) => {
    act(() => {
      root.render(<FriendButton me="me" other="rival" friends={friends} />);
    });
  };

  it("offers to accept a new request from the opponent after ours was declined", async () => {
    show([]);
    await act(async () => {
      fixtureValue(container.querySelector("button")).click();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("Request sent");

    show([incoming]);
    expect(container.textContent).toBe("Accept friend request");
  });
});
