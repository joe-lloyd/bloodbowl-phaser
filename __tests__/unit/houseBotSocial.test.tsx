import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invite } from "../../src/boundary/social";
import type { FriendRow, InviteRow } from "../../src/ui/hooks/useSocial";
import { HouseBotSocial } from "../../src/ui/components/social/HouseBotSocial";

const world = vi.hoisted(() => {
  const current: { status: string; guestUid: string | null } = { status: "lobby", guestUid: null };
  return {
    friends: new Array<FriendRow>(),
    invites: new Array<InviteRow>(),
    current,
    minute: 0,
    acceptFriend: vi.fn((): Promise<void> => Promise.resolve()),
    acceptLobbyInvite: vi.fn((): Promise<string> => Promise.resolve("FRIEND")),
    dismissInvite: vi.fn((): Promise<void> => Promise.resolve()),
  };
});

vi.mock("../../src/ui/hooks/useAuth", () => ({ useAuth: () => ({ user: { uid: "bot" } }) }));
vi.mock("../../src/ui/hooks/useSocial", () => ({
  useFriends: () => world.friends,
  useInvites: () => world.invites,
  useNow: () => world.minute,
}));
vi.mock("../../src/firebase/friends", () => ({ acceptFriend: world.acceptFriend }));
vi.mock("../../src/firebase/invites", () => ({
  acceptLobbyInvite: world.acceptLobbyInvite,
  dismissInvite: world.dismissInvite,
}));
vi.mock("../../src/firebase/lobby", () => ({
  getActiveMatchCode: () => Promise.resolve("OWN001"),
  fetchLobby: () => Promise.resolve({ code: "OWN001", hostUid: "bot", ...world.current }),
}));

const ignore = () => undefined;
const invite: Invite = { kind: "match", fromUid: "joe", toUid: "bot", code: "FRIEND", createdAt: Date.now() };

function Lobby() {
  const { code } = useParams();
  return <p>Lobby {code}</p>;
}

describe("the house bot's browser", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    world.friends = [];
    world.invites = [];
    world.current = { status: "lobby", guestUid: null };
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  const show = async (path: string) => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <HouseBotSocial />
          <Routes>
            <Route path="/" element={<p>Menu</p>} />
            <Route path="/online/play/:code" element={<p>Playing</p>} />
            <Route path="/online/lobby/:code" element={<Lobby />} />
          </Routes>
        </MemoryRouter>
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  it("accepts a friend request once", async () => {
    world.friends = [{ kind: "incoming", uid: "joe", key: "bot__joe", name: "Joe", lastSeen: undefined }];
    await show("/");
    await show("/");
    expect(world.acceptFriend).toHaveBeenCalledTimes(1);
    expect(world.acceptFriend).toHaveBeenCalledWith("bot__joe");
  });

  it("joins a friend's game and opens that lobby", async () => {
    world.invites = [{ invite, fromName: "Joe" }];
    await show("/");
    expect(world.acceptLobbyInvite).toHaveBeenCalledWith(invite);
    expect(container.textContent).toBe("Lobby FRIEND");
  });

  it("leaves the invite waiting while it plays, or while a guest sits in its own lobby", async () => {
    world.invites = [{ invite, fromName: "Joe" }];
    await show("/online/play/OWN001");
    world.current = { status: "lobby", guestUid: "stranger" };
    await show("/");
    expect(world.acceptLobbyInvite).not.toHaveBeenCalled();
  });

  it("drops an invite it cannot join", async () => {
    world.invites = [{ invite, fromName: "Joe" }];
    world.acceptLobbyInvite.mockRejectedValueOnce(new Error("That game is already full."));
    await show("/");
    expect(world.dismissInvite).toHaveBeenCalledWith(invite);
  });

  it("takes the next invite once a slow first one fails", async () => {
    const second: Invite = { ...invite, fromUid: "ann", code: "SECOND" };
    let failFirst: (error: Error) => void = ignore;
    world.acceptLobbyInvite.mockImplementationOnce(
      () => new Promise<string>((_resolve, reject) => { failFirst = reject; })
    );
    world.invites = [{ invite, fromName: "Joe" }];
    await show("/");
    world.invites = [{ invite: second, fromName: "Ann" }];
    await show("/");
    expect(world.acceptLobbyInvite).toHaveBeenCalledTimes(1);

    world.acceptLobbyInvite.mockResolvedValueOnce("SECOND");
    await act(async () => {
      failFirst(new Error("That game is already full."));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(world.acceptLobbyInvite).toHaveBeenLastCalledWith(second);
    expect(container.textContent).toBe("Lobby SECOND");
  });

  it("tries a new invite from the same coach after an earlier one failed", async () => {
    const replacement: Invite = { ...invite, code: "SECOND", createdAt: invite.createdAt + 1 };
    world.acceptLobbyInvite.mockRejectedValueOnce(new Error("That game has already started."));
    world.invites = [{ invite, fromName: "Joe" }];
    await show("/");
    world.acceptLobbyInvite.mockResolvedValueOnce("SECOND");
    world.invites = [{ invite: replacement, fromName: "Joe" }];
    await show("/");
    expect(world.acceptLobbyInvite).toHaveBeenLastCalledWith(replacement);
  });

  it("takes an invite once the guest who blocked it has left", async () => {
    world.invites = [{ invite, fromName: "Joe" }];
    world.current = { status: "lobby", guestUid: "stranger" };
    await show("/");
    expect(world.acceptLobbyInvite).not.toHaveBeenCalled();

    world.current = { status: "lobby", guestUid: null };
    world.minute += 60_000;
    await show("/");
    expect(world.acceptLobbyInvite).toHaveBeenCalledWith(invite);
  });

  it("accepts a new request from a coach who unfriended it", async () => {
    const request: FriendRow = { kind: "incoming", uid: "joe", key: "bot__joe", name: "Joe", lastSeen: undefined };
    world.friends = [request];
    await show("/");
    world.friends = [{ ...request, kind: "friend" }];
    await show("/");
    world.friends = [];
    await show("/");
    world.friends = [request];
    await show("/");
    expect(world.acceptFriend).toHaveBeenCalledTimes(2);
  });
});
