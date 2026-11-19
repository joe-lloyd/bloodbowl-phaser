import { fixtureValue } from "../../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerDevelopment } from "../../../src/ui/components/hud/PlayerDevelopment";
import { loadTeams, saveTeams } from "../../../src/game/managers/TeamManager";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import {
  applyAdvancement,
  rollPendingRandomPrimary,
} from "../../../src/game/progression/progression";
import { createPlayer } from "../../../src/types/Player";
import { getSkill, SkillCategory, SkillType } from "../../../src/types/Skills";
import {
  calculateTeamValue,
  createTeam,
  RosterName,
  type Team,
} from "../../../src/types/Team";

function savedTeam(spp: number): { team: Team; playerId: string } {
  const roster = getRosterByRosterName(RosterName.HUMAN);
  const team = createTeam(
    "Development Test",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    roster.rerollCost
  );
  team.players = roster.playerTemplates.map((template, index) =>
    createPlayer(template, team.id, index + 1)
  );
  team.teamValue = calculateTeamValue(team);
  const player = fixtureValue(team.players.find((p) => (p.primary ?? []).length > 0));
  player.spp = spp;
  saveTeams([team]);
  return { team, playerId: player.id };
}

function dice(...values: number[]) {
  let index = 0;
  return { rollDie: () => fixtureValue(values[index++ % values.length]) };
}

describe("PlayerDevelopment", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  async function renderFromStorage(
    teamId: string,
    playerId: string,
    rng: { rollDie: () => number }
  ) {
    const team = fixtureValue(loadTeams().find((t) => t.id === teamId));
    const player = fixtureValue(team.players.find((p) => p.id === playerId));
    await act(async () => {
      root.render(
        <PlayerDevelopment player={player} team={team} rngService={rng} />
      );
    });
  }

  async function reload(
    teamId: string,
    playerId: string,
    rng: { rollDie: () => number }
  ) {
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderFromStorage(teamId, playerId, rng);
  }

  function option(kind: string) {
    return fixtureValue(container.querySelector<HTMLButtonElement>(
      `[data-testid="advancement-${kind}"]`
    ));
  }

  function click(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function choose(select: HTMLSelectElement, value: string) {
    const setter = fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )).set);
    act(() => {
      setter.call(select, value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function buttonWithText(text: string) {
    return Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(text)
    );
  }

  it("only lets the coach pick advancements they can afford, and shows nothing else until they do", async () => {
    const { team, playerId } = savedTeam(4);
    await renderFromStorage(team.id, playerId, dice(1));

    expect(container.textContent).toContain("4 SPP");
    expect(option("random-primary").disabled).toBe(false);
    expect(option("chosen-primary").disabled).toBe(true);
    expect(option("chosen-primary").textContent).toContain("needs 2 more");
    expect(option("chosen-secondary").disabled).toBe(true);
    expect(option("characteristic").disabled).toBe(true);

    expect(container.querySelectorAll("select")).toHaveLength(0);

    click(option("random-primary"));
    expect(
      container.querySelector('select[aria-label="Skill category"]')
    ).toBeTruthy();

    expect(container.querySelector('select[aria-label="Skill"]')).toBeNull();
  });

  it("saves rolled candidates at once and shows the same roll after a reload", async () => {
    const { team, playerId } = savedTeam(20);
    const player = fixtureValue(team.players.find((p) => p.id === playerId));
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));

    click(option("random-primary"));
    choose(
      fixtureValue(container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )),
      fixtureValue(fixtureValue(player.primary)[0])
    );
    click(fixtureValue(buttonWithText("Roll two candidates")));

    const stored = fixtureValue(fixtureValue(loadTeams()
      .find((t) => t.id === team.id))
      .players.find((p) => p.id === playerId)).pendingAdvancementRoll;
    expect(stored?.kind).toBe("random-primary");
    const rolledSkills =
      stored?.kind === "random-primary"
        ? stored.candidates.map((candidate) => candidate.skill)
        : [];

    await reload(team.id, playerId, dice(6));
    const shown = Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).map((button) => button.textContent ?? "");
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((text) => {
      expect(rolledSkills.some((skill) => text.endsWith(skill))).toBe(true);
    });
    expect(buttonWithText("Roll two candidates")).toBeUndefined();

    expect(option("chosen-primary").disabled).toBe(true);
    expect(option("characteristic").disabled).toBe(true);
    expect(
      fixtureValue(container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )).disabled
    ).toBe(true);

    click(fixtureValue(container.querySelector('[data-testid="random-candidate"]')));
    const after = fixtureValue(fixtureValue(loadTeams()
      .find((t) => t.id === team.id))
      .players.find((p) => p.id === playerId));
    expect(after.pendingAdvancementRoll).toBeUndefined();
    expect(rolledSkills).toContain(fixtureValue(after.advancements?.[0]).name);
    expect(after.spp).toBe(17);
  });

  it("rolls again before saving when a roll lands on a skill the player has", async () => {
    const { team, playerId } = savedTeam(20);
    const stored = fixtureValue(loadTeams().find((t) => t.id === team.id));
    const player = fixtureValue(stored.players.find((p) => p.id === playerId));
    expect(player.primary).toContain(SkillCategory.GENERAL);

    for (const skill of [SkillType.BLOCK, SkillType.DAUNTLESS]) {
      player.skills.push(getSkill(skill));
      player.advancements = [
        ...(player.advancements ?? []),
        {
          id: `adv-${String((player.advancements?.length ?? 0) + 1)}`,
          type: "primary-skill",
          name: skill,
          sppCost: 0,
          valueIncrease: 0,
        },
      ];
    }
    saveTeams([stored]);
    const owned = fixtureValue(fixtureValue(loadTeams()
      .find((t) => t.id === team.id))
      .players.find((p) => p.id === playerId))
      .skills.map((skill) => skill.type);
    expect(owned).toEqual(
      expect.arrayContaining([SkillType.BLOCK, SkillType.DAUNTLESS])
    );

    await renderFromStorage(team.id, playerId, dice(1, 1, 4, 1, 1, 2, 1, 3));

    click(option("random-primary"));
    choose(
      fixtureValue(container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )),
      SkillCategory.GENERAL
    );
    click(fixtureValue(buttonWithText("Roll two candidates")));

    const expected = ["4, 1: Steady Footing", "1, 3: Fend"];
    const shownNow = () =>
      Array.from(
        container.querySelectorAll('[data-testid="random-candidate"]')
      ).map((button) => button.textContent);
    expect(shownNow()).toEqual(expected);
    const saved = fixtureValue(fixtureValue(loadTeams()
      .find((t) => t.id === team.id))
      .players.find((p) => p.id === playerId)).pendingAdvancementRoll;
    expect(saved).toMatchObject({
      candidates: [
        { skill: SkillType.STEADY_FOOTING },
        { skill: SkillType.FEND },
      ],
    });

    await reload(team.id, playerId, dice(1, 1));
    expect(shownNow()).toEqual(expected);
  });

  it("saves the Characteristic D8 so a reload shows the same result", async () => {
    const { team, playerId } = savedTeam(20);
    await renderFromStorage(team.id, playerId, dice(3));
    click(option("characteristic"));
    click(fixtureValue(buttonWithText("Roll D8")));
    expect(container.textContent).toContain("Rolled 3");

    await reload(team.id, playerId, dice(8));
    expect(container.textContent).toContain("Rolled 3");
    expect(buttonWithText("Roll D8")).toBeUndefined();
    expect(option("random-primary").disabled).toBe(true);
  });

  function storedPlayer(teamId: string, playerId: string) {
    return fixtureValue(fixtureValue(loadTeams()
      .find((t) => t.id === teamId))
      .players.find((p) => p.id === playerId));
  }

  async function rollCandidatesFor(category: string) {
    click(option("random-primary"));
    choose(
      fixtureValue(container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )),
      category
    );
    click(fixtureValue(buttonWithText("Roll two candidates")));
  }

  it("keeps a roll another tab already saved instead of rolling again", async () => {
    const { team, playerId } = savedTeam(20);
    const category = fixtureValue(fixtureValue(team.players.find((p) => p.id === playerId)).primary)[0];
    await renderFromStorage(team.id, playerId, dice(6));

    const otherTab = fixtureValue(loadTeams().find((t) => t.id === team.id));
    const otherRoll = rollPendingRandomPrimary(
      fixtureValue(otherTab.players.find((p) => p.id === playerId)),
      fixtureValue(category),
      dice(1, 2, 4, 5)
    );
    saveTeams([otherTab]);

    await rollCandidatesFor(fixtureValue(category));

    expect(storedPlayer(team.id, playerId).pendingAdvancementRoll).toEqual(
      otherRoll
    );
    const shown = Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).map((button) => button.textContent ?? "");
    const otherSkills =
      otherRoll.kind === "random-primary"
        ? otherRoll.candidates.map((candidate) => candidate.skill)
        : [];
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((text) => {
      expect(otherSkills.some((skill) => text.endsWith(skill))).toBe(true);
    });
  });

  it("shows no roll and says so when the roll cannot be saved", async () => {
    const { team, playerId } = savedTeam(20);
    const category = fixtureValue(fixtureValue(team.players.find((p) => p.id === playerId)).primary)[0];
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await rollCandidatesFor(fixtureValue(category));

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be saved"
    );
    expect(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).toHaveLength(0);
    vi.mocked(Storage.prototype.setItem).mockRestore();
    expect(
      storedPlayer(team.id, playerId).pendingAdvancementRoll
    ).toBeUndefined();
  });

  it("spends the roll and resolves the Advanced League entry in one save", async () => {
    const { team, playerId } = savedTeam(15);
    const stored = fixtureValue(loadTeams().find((t) => t.id === team.id));
    stored.pendingDevelopment = [
      {
        id: "entry-1",
        kind: "advanced-league-advancement",
        playerId,
      } as NonNullable<Team["pendingDevelopment"]>[number],
    ];
    saveTeams([stored]);
    const category = fixtureValue(fixtureValue(team.players.find((p) => p.id === playerId)).primary)[0];
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));
    await rollCandidatesFor(fixtureValue(category));

    const writes = vi.spyOn(Storage.prototype, "setItem");
    click(fixtureValue(container.querySelector('[data-testid="random-candidate"]')));

    expect(writes).toHaveBeenCalledTimes(1);
    const after = fixtureValue(loadTeams().find((t) => t.id === team.id));
    expect(after.pendingDevelopment ?? []).toHaveLength(0);
    expect(
      fixtureValue(after.players.find((p) => p.id === playerId)).advancements
    ).toHaveLength(1);
  });

  it("refuses a candidate another window has already spent, and shows the latest state", async () => {
    const { team, playerId } = savedTeam(20);
    const category = fixtureValue(fixtureValue(team.players.find((p) => p.id === playerId)).primary)[0];

    const first = fixtureValue(loadTeams().find((t) => t.id === team.id));
    const roll = rollPendingRandomPrimary(
      fixtureValue(first.players.find((p) => p.id === playerId)),
      fixtureValue(category),
      dice(1, 2, 4, 5)
    );
    saveTeams([first]);
    await renderFromStorage(team.id, playerId, dice(6));
    expect(
      container.querySelectorAll('[data-testid="random-candidate"]').length
    ).toBeGreaterThan(0);

    const other = fixtureValue(loadTeams().find((t) => t.id === team.id));
    if (roll.kind !== "random-primary") throw new Error("unexpected roll");
    applyAdvancement(fixtureValue(other.players.find((p) => p.id === playerId)), {
      kind: "random-primary",
      skill: roll.candidates[0].skill,
    });
    saveTeams([other]);

    const spent = roll.candidates[0].skill;
    expect(roll.candidates[1].skill).not.toBe(spent);
    const stale = fixtureValue(Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).find((button) => !button.textContent?.endsWith(spent)));
    click(stale);

    const after = storedPlayer(team.id, playerId);
    expect(after.advancements).toHaveLength(1);
    expect(after.spp).toBe(17);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "another window"
    );

    expect(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).toHaveLength(0);
  });
});
