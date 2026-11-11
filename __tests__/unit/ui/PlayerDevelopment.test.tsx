import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayerDevelopment } from "../../../src/ui/components/hud/PlayerDevelopment";
import { loadTeams, saveTeams } from "../../../src/game/managers/TeamManager";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { createPlayer } from "../../../src/types/Player";
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
});
