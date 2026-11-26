import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as OfflineArtModule from "../../src/boundary/offlineArt";
import type * as PwaModule from "../../src/boundary/pwa";

vi.mock("../../src/firebase/config", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  getDb: vi.fn(),
}));
vi.mock("../../src/boundary/pwa", async (original) => ({
  ...(await original<typeof PwaModule>()),
  runsInstalled: true,
}));
vi.mock("../../src/boundary/offlineArt", async (original) => ({
  ...(await original<typeof OfflineArtModule>()),
  wantModels: vi.fn(),
}));

import { wantModels } from "../../src/boundary/offlineArt";
import { saveTeam } from "../../src/game/managers/TeamManager";
import { createReadyMadeTeam } from "../../src/simulation/lineups";
import { RosterName } from "../../src/types/Team";
import { OfflineArtKeeper } from "../../src/ui/components/common/OfflineArtKeeper";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  vi.mocked(wantModels).mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function Leave({ to }: { to: string | null }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (to) void navigate(to);
  }, [to, navigate]);
  return null;
}

function show(to: string | null): void {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/build-team/new-team"]}>
        <OfflineArtKeeper />
        <Leave to={to} />
      </MemoryRouter>
    );
  });
}

const lastWanted = () => vi.mocked(wantModels).mock.lastCall?.[0] ?? [];

it("keeps the art of a team built this session once the player leaves the builder", async () => {
  show(null);
  expect(lastWanted()).toEqual([]);

  await saveTeam(createReadyMadeTeam(RosterName.ORC, "Offline Orcs", 0x22_66_22));
  show("/");

  expect(lastWanted()).toEqual([
    "big_un",
    "goblin_lineman",
    "orc_blitzer",
    "orc_lineman",
    "orc_thrower",
    "troll",
  ]);
});
