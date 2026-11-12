import { act } from "react";
import { createRoot, Root } from "react-dom/client";
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
  Team,
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
  const player = team.players.find((p) => (p.primary ?? []).length > 0)!;
  player.spp = spp;
  saveTeams([team]);
  return { team, playerId: player.id };
}

function dice(...values: number[]) {
  let index = 0;
  return { rollDie: () => values[index++ % values.length] };
}

/**
 * Player page / Manage Team SPP advancement: only affordable advancements
 * can be picked, and rolls are saved immediately so reloading the page
 * cannot re-roll them.
 */
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
    await act(async () => root.unmount());
    container.remove();
    localStorage.clear();
  });

  async function renderFromStorage(
    teamId: string,
    playerId: string,
    rng: { rollDie: () => number }
  ) {
    const team = loadTeams().find((t) => t.id === teamId)!;
    const player = team.players.find((p) => p.id === playerId)!;
    await act(async () => {
      root.render(
        <PlayerDevelopment player={player} team={team} rngService={rng} />
      );
    });
  }

  /** Simulates leaving and coming back: a fresh tree read from storage. */
  async function reload(
    teamId: string,
    playerId: string,
    rng: { rollDie: () => number }
  ) {
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderFromStorage(teamId, playerId, rng);
  }

  function option(kind: string) {
    return container.querySelector<HTMLButtonElement>(
      `[data-testid="advancement-${kind}"]`
    )!;
  }

  function click(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function choose(select: HTMLSelectElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )!.set!;
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
    // No category or skill drop-downs before an advancement is chosen.
    expect(container.querySelectorAll("select")).toHaveLength(0);

    click(option("random-primary"));
    expect(
      container.querySelector('select[aria-label="Skill category"]')
    ).toBeTruthy();
    // Random Primary rolls the skill, so there is no skill picker.
    expect(container.querySelector('select[aria-label="Skill"]')).toBeNull();
  });

  it("saves rolled candidates at once and shows the same roll after a reload", async () => {
    const { team, playerId } = savedTeam(20);
    const player = team.players.find((p) => p.id === playerId)!;
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));

    click(option("random-primary"));
    choose(
      container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )!,
      player.primary![0]
    );
    click(buttonWithText("Roll two candidates")!);

    const stored = loadTeams()
      .find((t) => t.id === team.id)!
      .players.find((p) => p.id === playerId)!.pendingAdvancementRoll;
    expect(stored?.kind).toBe("random-primary");
    const rolledSkills =
      stored?.kind === "random-primary"
        ? stored.candidates.map((candidate) => candidate.skill)
        : [];

    // Different dice after the reload: the saved roll must still win.
    await reload(team.id, playerId, dice(6));
    const shown = Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).map((button) => button.textContent ?? "");
    expect(shown.length).toBeGreaterThan(0);
    shown.forEach((text) =>
      expect(rolledSkills.some((skill) => text.endsWith(skill))).toBe(true)
    );
    expect(buttonWithText("Roll two candidates")).toBeUndefined();
    // Locked to the roll: no switching to another advancement.
    expect(option("chosen-primary").disabled).toBe(true);
    expect(option("characteristic").disabled).toBe(true);
    expect(
      container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )!.disabled
    ).toBe(true);

    click(container.querySelector('[data-testid="random-candidate"]')!);
    const after = loadTeams()
      .find((t) => t.id === team.id)!
      .players.find((p) => p.id === playerId)!;
    expect(after.pendingAdvancementRoll).toBeUndefined();
    expect(rolledSkills).toContain(after.advancements?.[0].name);
    expect(after.spp).toBe(17);
  });

  it("rolls again before saving when a roll lands on a skill the player has", async () => {
    const { team, playerId } = savedTeam(20);
    const stored = loadTeams().find((t) => t.id === team.id)!;
    const player = stored.players.find((p) => p.id === playerId)!;
    expect(player.primary).toContain(SkillCategory.GENERAL);
    // Learned as earlier advancements, which is how a save keeps a skill
    for (const skill of [SkillType.BLOCK, SkillType.DAUNTLESS]) {
      player.skills.push(getSkill(skill));
      player.advancements = [
        ...(player.advancements ?? []),
        {
          id: `adv-${(player.advancements?.length ?? 0) + 1}`,
          type: "primary-skill",
          name: skill,
          sppCost: 0,
          valueIncrease: 0,
        },
      ];
    }
    saveTeams([stored]);
    const owned = loadTeams()
      .find((t) => t.id === team.id)!
      .players.find((p) => p.id === playerId)!
      .skills.map((skill) => skill.type);
    expect(owned).toEqual(
      expect.arrayContaining([SkillType.BLOCK, SkillType.DAUNTLESS])
    );
    // General 1,1 Block and 1,2 Dauntless are owned, so each is rolled again.
    await renderFromStorage(team.id, playerId, dice(1, 1, 4, 1, 1, 2, 1, 3));

    click(option("random-primary"));
    choose(
      container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )!,
      SkillCategory.GENERAL
    );
    click(buttonWithText("Roll two candidates")!);

    const expected = ["4, 1: Steady Footing", "1, 3: Fend"];
    const shownNow = () =>
      Array.from(
        container.querySelectorAll('[data-testid="random-candidate"]')
      ).map((button) => button.textContent);
    expect(shownNow()).toEqual(expected);
    const saved = loadTeams()
      .find((t) => t.id === team.id)!
      .players.find((p) => p.id === playerId)!.pendingAdvancementRoll;
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
    click(buttonWithText("Roll D8")!);
    expect(container.textContent).toContain("Rolled 3");

    await reload(team.id, playerId, dice(8));
    expect(container.textContent).toContain("Rolled 3");
    expect(buttonWithText("Roll D8")).toBeUndefined();
    expect(option("random-primary").disabled).toBe(true);
  });

  function storedPlayer(teamId: string, playerId: string) {
    return loadTeams()
      .find((t) => t.id === teamId)!
      .players.find((p) => p.id === playerId)!;
  }

  async function rollCandidatesFor(
    teamId: string,
    playerId: string,
    category: string
  ) {
    click(option("random-primary"));
    choose(
      container.querySelector<HTMLSelectElement>(
        'select[aria-label="Skill category"]'
      )!,
      category
    );
    click(buttonWithText("Roll two candidates")!);
  }

  it("keeps a roll another tab already saved instead of rolling again", async () => {
    const { team, playerId } = savedTeam(20);
    const category = team.players.find((p) => p.id === playerId)!.primary![0];
    await renderFromStorage(team.id, playerId, dice(6));

    // Another tab loads the same team, rolls and saves first
    const otherTab = loadTeams().find((t) => t.id === team.id)!;
    const otherRoll = rollPendingRandomPrimary(
      otherTab.players.find((p) => p.id === playerId)!,
      category,
      dice(1, 2, 4, 5)
    );
    saveTeams([otherTab]);

    await rollCandidatesFor(team.id, playerId, category);

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
    shown.forEach((text) =>
      expect(otherSkills.some((skill) => text.endsWith(skill))).toBe(true)
    );
  });

  it("shows no roll and says so when the roll cannot be saved", async () => {
    const { team, playerId } = savedTeam(20);
    const category = team.players.find((p) => p.id === playerId)!.primary![0];
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await rollCandidatesFor(team.id, playerId, category);

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
    const stored = loadTeams().find((t) => t.id === team.id)!;
    stored.pendingDevelopment = [
      {
        id: "entry-1",
        kind: "advanced-league-advancement",
        playerId,
      } as NonNullable<Team["pendingDevelopment"]>[number],
    ];
    saveTeams([stored]);
    const category = team.players.find((p) => p.id === playerId)!.primary![0];
    await renderFromStorage(team.id, playerId, dice(1, 2, 4, 5));
    await rollCandidatesFor(team.id, playerId, category);

    // 15 SPP must advance (Characteristic costs 14); after Random Primary
    // (3) 12 SPP is below the next Characteristic cost (16), so it is done.
    const writes = vi.spyOn(Storage.prototype, "setItem");
    click(container.querySelector('[data-testid="random-candidate"]')!);

    expect(writes).toHaveBeenCalledTimes(1);
    const after = loadTeams().find((t) => t.id === team.id)!;
    expect(after.pendingDevelopment ?? []).toHaveLength(0);
    expect(
      after.players.find((p) => p.id === playerId)!.advancements
    ).toHaveLength(1);
  });

  it("refuses a candidate another window has already spent, and shows the latest state", async () => {
    const { team, playerId } = savedTeam(20);
    const category = team.players.find((p) => p.id === playerId)!.primary![0];
    // A roll is saved, and this window shows its candidates
    const first = loadTeams().find((t) => t.id === team.id)!;
    const roll = rollPendingRandomPrimary(
      first.players.find((p) => p.id === playerId)!,
      category,
      dice(1, 2, 4, 5)
    );
    saveTeams([first]);
    await renderFromStorage(team.id, playerId, dice(6));
    expect(
      container.querySelectorAll('[data-testid="random-candidate"]').length
    ).toBeGreaterThan(0);

    // Another window spends that roll
    const other = loadTeams().find((t) => t.id === team.id)!;
    if (roll.kind !== "random-primary") throw new Error("unexpected roll");
    applyAdvancement(other.players.find((p) => p.id === playerId)!, {
      kind: "random-primary",
      skill: roll.candidates[0].skill,
    });
    saveTeams([other]);

    // Pick the other candidate, which is still a legal skill
    const spent = roll.candidates[0].skill;
    expect(roll.candidates[1].skill).not.toBe(spent);
    const stale = Array.from(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).find((button) => !button.textContent?.endsWith(spent))!;
    click(stale);

    const after = storedPlayer(team.id, playerId);
    expect(after.advancements).toHaveLength(1);
    expect(after.spp).toBe(17);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "another window"
    );
    // The form now shows the latest state: the roll is gone
    expect(
      container.querySelectorAll('[data-testid="random-candidate"]')
    ).toHaveLength(0);
  });
});
