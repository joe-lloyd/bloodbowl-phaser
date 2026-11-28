import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { arenaSquad } from "../../src/game/deathbowl/squad";
import { entryProblems } from "../../src/game/deathbowl/entry";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { createPlayer } from "../../src/types/Player";
import { RosterName, type Team } from "../../src/types/Team";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { computerSeats } from "../../src/ui/components/pages/deathbowlSeats";
import { deathbowlRoutes } from "../../src/ui/deathbowlRoutes";
import { readDeathbowlEntry } from "../../src/boundary/deathbowlEntry";

const seen = vi.hoisted(() => {
  const shared: { admin: boolean; library: Team[]; state: unknown } = {
    admin: true,
    library: [],
    state: null,
  };
  return shared;
});

vi.mock("../../src/firebase/admin", () => ({ isAdminUser: () => seen.admin }));
vi.mock("../../src/ui/hooks/useAuth", () => ({
  useAuth: () => ({ user: { uid: "coach" }, ready: true }),
}));
vi.mock("../../src/ui/hooks/useTeamLibrary", () => ({
  useTeamLibrary: () => [seen.library, vi.fn()],
  useTeamLibraryStatus: () => "loaded",
}));
vi.mock("../../src/ui/pages/DeathbowlPlayPage", async () => {
  const { useLocation } = await import("react-router-dom");
  return {
    DeathbowlPlayPage: () => {
      seen.state = useLocation().state;
      return <p>Deathbowl match</p>;
    },
  };
});

const human = (name: string) => arenaSquad(RosterName.HUMAN, name, 0x4169e1);

function bloated(): Team {
  const team = human("Too Many Humans");
  const template = fixtureValue(getRosterByRosterName(RosterName.HUMAN).playerTemplates[0]);
  while (team.players.length < 12)
    team.players.push(createPlayer(template, team.id, team.players.length + 1));
  team.cheerleaders = 2;
  return team;
}

function withStar(): Team {
  const team = human("Starry Humans");
  fixtureValue(team.players[0]).playerKind = "star";
  team.players.push(createPlayer(fixtureValue(getRosterByRosterName(RosterName.HUMAN).playerTemplates[0]), team.id, 11));
  return team;
}

let container: HTMLDivElement;
let root: Root;

function open(path: string) {
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>Main menu</p>} />
          {deathbowlRoutes(new EventBus())}
        </Routes>
      </MemoryRouter>
    );
  });
}

const button = (name: RegExp) =>
  fixtureValue([...container.querySelectorAll("button")].find((element) => name.test(element.textContent)));

const pick = (name: string) => {
  act(() => {
    button(new RegExp(name)).click();
  });
};

beforeEach(() => {
  seen.admin = true;
  seen.state = null;
  vi.stubGlobal("confirm", () => true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("the Deathbowl entry", () => {
  it("sends a non-admin from the lobby and the match to the main menu", () => {
    seen.admin = false;
    open("/deathbowl");
    expect(container.textContent).toBe("Main menu");
    open("/deathbowl/play");
    expect(container.textContent).toBe("Main menu");
  });

  it("names each failed DB-D1 and DB-D3 rule and will not start", () => {
    seen.library = [bloated()];
    open("/deathbowl");
    pick("Too Many Humans");
    const report = fixtureValue(container.querySelector("[data-testid=deathbowl-entry]")).textContent;
    expect(report).toContain("This team cannot enter");
    expect(report).toContain("DB-D112 players; a Deathbowl team needs 8 to 11.");
    expect(report).toContain("DB-D3");
    expect(report).toContain("Deathbowl teams cannot have");
    expect(button(/Start Match/).disabled).toBe(true);
  });

  it("starts a team with a Star Player, who stays home, against three computer teams", () => {
    seen.library = [withStar()];
    open("/deathbowl");
    pick("Starry Humans");
    const report = fixtureValue(container.querySelector("[data-testid=deathbowl-entry]")).textContent;
    expect(report).toContain("Ready to enter");
    expect(report).toContain("These stay home");
    expect(report).toContain("DB-D4");
    act(() => {
      button(/Start Match/).click();
    });
    expect(container.textContent).toBe("Deathbowl match");
    const { teams, humanTeamId, difficulty } = fixtureValue(readDeathbowlEntry(seen.state));
    expect(teams.map(({ name }) => name)).toEqual(["Starry Humans", "Arena Orcs", "Arena Skaven", "Arena Dwarfs"]);
    expect(humanTeamId).toBe(fixtureValue(teams[0]).id);
    expect(difficulty).toBe("standard");
    expect(fixtureValue(teams[0]).players.some(({ playerKind }) => playerKind === "star")).toBe(false);
  });
});

describe("the computer seats", () => {
  it("each meet DB-D1 to DB-D5", () => {
    const seats = computerSeats(arenaSquad(RosterName.ELVEN_UNION, "Elves", 1), () => 0.99);
    for (const team of seats)
      expect(entryProblems(team, getRosterByRosterName(team.rosterName))).toEqual([]);
  });
});
