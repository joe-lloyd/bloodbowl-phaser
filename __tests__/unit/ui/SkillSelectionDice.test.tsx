import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingDevelopmentPanel } from "../../../src/ui/components/TeamManagement/PendingDevelopmentPanel";
import {
  loadTeams,
  saveTeams,
  setTeamRepository,
} from "../../../src/game/managers/TeamManager";
import { RNGService } from "../../../src/services/rng/RNGService";
import { fixtureValue } from "../../../src/testing/fixtureValue";
import { RosterName, type Team } from "../../../src/types/Team";
import { SkillCategory, SkillType } from "../../../src/types/Skills";
import { createComputerTeam } from "../../fixtures/computerTeam";

const playRoll = vi.hoisted(() => vi.fn<[HTMLElement, unknown], unknown>());
vi.mock("../../../src/ui/dice/diceScene", () => ({ playRoll }));

const NAMED = [SkillType.DAUNTLESS, SkillType.FRENZY, SkillType.KICK];

function readyForD3(named: readonly SkillType[] = NAMED): Team {
  const team = createComputerTeam({
    rosterName: RosterName.HUMAN,
    name: "Selection",
    primaryColour: 0x224488,
    advancementMode: "sevens-skill-selection",
  });
  team.firstMatchPlayedAt = 1;
  const player = fixtureValue(
    team.players.find(({ primary }) => primary?.includes(SkillCategory.GENERAL))
  );
  team.pendingDevelopment = [
    {
      id: "pick",
      kind: "sevens-skill-selection",
      matchId: "m",
      createdAt: 1,
      eligibleParticipantIds: [player.id],
      progress: {
        route: "primary",
        playerId: player.id,
        category: SkillCategory.GENERAL,
        named: [...named],
      },
    },
  ];
  return team;
}

describe("rolling a Skill Selection D3", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    playRoll.mockReset();
    playRoll.mockReturnValue({
      landed: Promise.resolve([]),
      stop: vi.fn(),
      still: () => null,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    vi.spyOn(RNGService.prototype, "rollDie").mockReturnValue(2);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    container.remove();
    setTeamRepository(null);
    vi.restoreAllMocks();
  });

  async function open(team: Team) {
    const render = () => {
      root.render(<PendingDevelopmentPanel team={team} onChange={render} />);
    };
    await act(async () => {
      render();
      await Promise.resolve();
    });
  }

  async function press(text: string) {
    const button = fixtureValue(
      [...container.querySelectorAll("button")].find(({ textContent }) =>
        textContent.includes(text)
      )
    );
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function rollD3(team: Team) {
    await open(team);
    await press("Roll D3");
  }

  it("saves each named skill in turn", async () => {
    await saveTeams([readyForD3([])]);
    await open(fixtureValue(loadTeams()[0]));
    for (const skill of NAMED) {
      await press(skill);
      await press("Name skill");
    }
    expect(fixtureValue(loadTeams()[0]).pendingDevelopment).toMatchObject([
      { progress: { named: NAMED } },
    ]);
    expect(container.textContent).toContain("Roll D3");
  });

  it("throws a doubled D6 once the result is saved, then names the skill", async () => {
    await saveTeams([readyForD3()]);
    const team = fixtureValue(loadTeams()[0]);
    await rollD3(team);
    await vi.waitFor(
      async () => {
        await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
        expect(container.textContent).toContain("learned Frenzy");
      },
      { timeout: 4500 }
    );
    expect(playRoll.mock.calls[0]?.[1]).toMatchObject({
      kind: "d6",
      values: [4],
    });
    expect(fixtureValue(loadTeams()[0]).pendingDevelopment).toEqual([]);
  });

  it("shows no dice and keeps the nominations when the save is refused", async () => {
    const stored = readyForD3();
    setTeamRepository({
      loadTeams: () => [stored],
      saveTeams: () => Promise.reject(new Error("Cloud offline")),
      deleteTeam: () => undefined,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const team = structuredClone(stored);
    await rollD3(team);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Cloud offline"
    );
    expect(playRoll).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="roll-tray"]')).toBeNull();
    expect(team).toEqual(stored);
    expect(stored.pendingDevelopment).toMatchObject([
      { progress: { named: NAMED } },
    ]);
  });

  it("holds every other development control until the D3 is saved", async () => {
    let library = [readyForD3()];
    const journeyman = structuredClone(
      fixtureValue(fixtureValue(library[0]).players[1])
    );
    journeyman.id = "journeyman";
    journeyman.playerKind = "journeyman";
    fixtureValue(library[0]).players.push(journeyman);
    fixtureValue(library[0]).pendingDevelopment?.push({
      id: "offer",
      kind: "journeyman-offer",
      playerId: journeyman.id,
      matchId: "m",
      createdAt: 1,
    });
    let accept: () => void = () => undefined;
    setTeamRepository({
      loadTeams: () => [...library],
      saveTeams: (teams) => {
        library = structuredClone(teams);
        return new Promise<void>((resolve) => {
          accept = resolve;
        });
      },
      deleteTeam: () => undefined,
    });
    await rollD3(structuredClone(fixtureValue(library[0])));

    await press("Let them go");
    expect(playRoll).not.toHaveBeenCalled();
    expect(fixtureValue(library[0]).pendingDevelopment).toMatchObject([
      { id: "offer" },
    ]);
    expect(
      fixtureValue(library[0]).players.map(({ id }) => id)
    ).toContain("journeyman");

    await act(async () => {
      accept();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[data-testid="roll-tray"]')).not.toBeNull();
    expect(container.querySelector("fieldset")?.disabled).toBe(false);
  });
});
