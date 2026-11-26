import type * as LobbyModule from "../../src/firebase/lobby";
import type * as SocialModule from "../../src/ui/hooks/useSocial";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { OnlineLobby } from "../../src/ui/components/pages/OnlineLobby";

const calls = vi.hoisted(() => ({
  joinLobby: vi.fn(() => new Promise<never>(() => undefined)),
  acceptLobbyInvite: vi.fn((): Promise<string> => new Promise(() => undefined)),
}));

vi.mock("../../src/ui/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));

vi.mock("../../src/ui/hooks/useTeamLibrary", () => ({
  useTeamLibrary: () => [[], vi.fn()],
}));

vi.mock("../../src/firebase/coaches", () => ({
  resolveCoachName: () => Promise.resolve("Me"),
}));

vi.mock("../../src/firebase/invites", () => ({
  acceptLobbyInvite: calls.acceptLobbyInvite,
}));

vi.mock("../../src/firebase/lobby", async (importOriginal) => {
  const original = await importOriginal<typeof LobbyModule>();
  const waiting: LobbyModule.LobbyDoc = {
    code: "OPEN01",
    hostUid: "host",
    guestUid: null,
    status: "lobby",
    listed: true,
    settings: original.DEFAULT_SETTINGS,
    players: {
      host: {
        uid: "host",
        displayName: "Host",
        team: null,
        ready: false,
        lastSeen: Date.now(),
      },
    },
    createdAt: null,
  };
  return {
    ...original,
    joinLobby: calls.joinLobby,
    subscribeLobby: () => vi.fn(),
    subscribeOpenLobbies: (onChange: (lobbies: LobbyModule.LobbyDoc[]) => void) => {
      onChange([waiting]);
      return vi.fn();
    },
  };
});

vi.mock("../../src/ui/hooks/useSocial", async (importOriginal) => ({
  ...(await importOriginal<typeof SocialModule>()),
  useFriends: () => [],
  useInvites: () => [
    {
      invite: { kind: "match", fromUid: "alice", toUid: "me", code: "INVITE", createdAt: Date.now() },
      fromName: "Alice",
    },
  ],
}));

function JoinedLobby() {
  const { code } = useParams();
  return <p>Lobby {code}</p>;
}

describe("joining from the Join Game page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/online/join"]}>
          <Routes>
            <Route path="/online/join" element={<OnlineLobby mode="join" />} />
            <Route path="/online/lobby/:code" element={<JoinedLobby />} />
          </Routes>
        </MemoryRouter>
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  const button = (selector: string) =>
    fixtureValue(container.querySelector<HTMLButtonElement>(`${selector} button`));

  it("holds every other join while one is still pending", async () => {
    await act(async () => {
      button('[data-testid="open-game"]').click();
      await Promise.resolve();
    });
    expect(calls.joinLobby).toHaveBeenCalledWith("OPEN01", "me", "Me");

    const invite = button('[data-testid="match-invite"]');
    expect(invite.disabled).toBe(true);
    expect(button('[data-testid="open-game"]').disabled).toBe(true);
    act(() => {
      invite.click();
    });
    expect(calls.acceptLobbyInvite).not.toHaveBeenCalled();
  });

  it("holds the open games while an invitation is being accepted", () => {
    act(() => {
      button('[data-testid="match-invite"]').click();
    });
    expect(calls.acceptLobbyInvite).toHaveBeenCalledTimes(1);

    const open = button('[data-testid="open-game"]');
    expect(open.disabled).toBe(true);
    act(() => {
      open.click();
    });
    expect(calls.joinLobby).not.toHaveBeenCalled();
  });

  it("opens the accepted lobby at its own address, so a reload keeps it", async () => {
    calls.acceptLobbyInvite.mockResolvedValueOnce("INVITE");
    await act(async () => {
      button('[data-testid="match-invite"]').click();
      await Promise.resolve();
    });
    expect(container.textContent).toBe("Lobby INVITE");
  });
});
