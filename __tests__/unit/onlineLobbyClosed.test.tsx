import type * as LobbyModule from "../../src/firebase/lobby";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { OnlineLobby } from "../../src/ui/components/pages/OnlineLobby";

vi.mock("../../src/ui/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "me" } }),
}));

vi.mock("../../src/ui/hooks/useTeamLibrary", () => ({
  useTeamLibrary: () => [[], vi.fn()],
}));

vi.mock("../../src/ui/hooks/useSocial", () => ({
  useFriends: () => [],
  useInvites: () => [],
}));

vi.mock("../../src/firebase/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof LobbyModule>()),
  subscribeLobby: (_code: string, onChange: (lobby: "closed") => void) => {
    onChange("closed");
    return vi.fn();
  },
}));

describe("a lobby that closes while it is open", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={["/online/lobby/GONE01"]}>
          <Routes>
            <Route path="/" element={<p>Main menu</p>} />
            <Route path="/online/lobby/:code" element={<OnlineLobby mode="host" />} />
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
  });

  it("says so and leads back to the menu", () => {
    expect(container.textContent).toContain("This lobby has closed.");
    const back = fixtureValue(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "Back to Menu"
      )
    );
    act(() => {
      back.click();
    });
    expect(container.textContent).toBe("Main menu");
  });
});
