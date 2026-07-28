import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamRoster } from "../../../src/ui/components/TeamBuilder/TeamRoster";
import {
  TeamBuilder as TeamTestBuilder,
  PlayerBuilder,
} from "../../utils/test-builders";
import { SkillType, SKILL_DEFINITIONS, getSkill } from "../../../src/types/Skills";

/**
 * Team Builder readability (overhaul-team-lifecycle-management,
 * team-lifecycle-modes: "Team-builder roster information remains
 * readable"). jsdom has no real layout engine, so this checks the things
 * that are actually verifiable in a component test: no miniature
 * (10px-class) text is rendered for critical roster information, and the
 * table is wrapped for horizontal scrolling rather than assuming every
 * column fits — the narrow-viewport fallback this requirement calls for.
 */
describe("TeamRoster readability", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders roster rows without shrinking critical text to miniature sizes", async () => {
    const team = new TeamTestBuilder().withPlayers(7).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    // No element uses an arbitrary sub-body text size (e.g. text-[10px]).
    const miniature = container.querySelectorAll('[class*="text-[10px]"]');
    expect(miniature.length).toBe(0);
    const microscopic = container.querySelectorAll('[class*="text-[9px]"]');
    expect(microscopic.length).toBe(0);

    // Player names render at the normal body scale, not a shrunk one.
    const firstPlayerName = container.querySelector(
      `button[title="View player development page"]`
    );
    expect(firstPlayerName).toBeTruthy();
    expect(firstPlayerName?.closest("td")?.className).toContain("text-base");
  });

  it("wraps the roster table so it scrolls horizontally instead of clipping", async () => {
    const team = new TeamTestBuilder().withPlayers(11).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    const scrollWrapper = container.querySelector(".overflow-x-auto");
    expect(scrollWrapper).toBeTruthy();
    expect(scrollWrapper?.querySelector("table")).toBeTruthy();

    // Header and row cell counts share the same column tracks (colgroup).
    const cols = container.querySelectorAll("colgroup col");
    const headerCells = container.querySelectorAll("thead th");
    expect(cols.length).toBe(headerCells.length);
  });
});

/**
 * team-builder-rule-tooltips: "Hovering a rostered player's skill shows its
 * rule text" / "Multiple skills are each independently hoverable" — each
 * skill on a drafted player is its own hover target carrying only that
 * skill's own rule text.
 */
describe("TeamRoster skill tooltips", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders each rostered player's skill as its own tooltip trigger with the skill's rule text", async () => {
    const player = new PlayerBuilder().withNumber(1).build();
    player.skills = [getSkill(SkillType.BLOCK), getSkill(SkillType.DODGE)];
    const team = new TeamTestBuilder().withCustomPlayers([player]).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    const blockText = SKILL_DEFINITIONS[SkillType.BLOCK].text;
    const dodgeText = SKILL_DEFINITIONS[SkillType.DODGE].text;

    const tooltipPanels = Array.from(
      container.querySelectorAll('[role="tooltip"]')
    ).map((panel) => panel.textContent);

    expect(tooltipPanels).toContain(blockText);
    expect(tooltipPanels).toContain(dodgeText);
    // Independent per-skill tooltips, not a single combined joined string.
    expect(tooltipPanels.some((t) => t === `${blockText} ${dodgeText}`)).toBe(
      false
    );
  });

  /**
   * team-builder-rule-tooltips: "Tabbing to a skill reveals its rule text"
   * — the tooltip is keyboard-reachable, not mouse-only.
   */
  it("makes each skill's tooltip reachable and revealed by keyboard focus, not just mouse hover", async () => {
    const player = new PlayerBuilder().withNumber(1).build();
    player.skills = [getSkill(SkillType.BLOCK), getSkill(SkillType.DODGE)];
    const team = new TeamTestBuilder().withCustomPlayers([player]).build();

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TeamRoster
            team={team}
            onFirePlayer={() => {}}
            onReorderPlayers={() => {}}
          />
        </MemoryRouter>
      );
    });

    const triggers = Array.from(
      container.querySelectorAll('span[tabindex="0"]')
    );
    expect(triggers.length).toBe(2);

    triggers.forEach((trigger) => {
      // Each trigger owns an aria-describedby pointing at its own
      // role="tooltip" panel, so screen readers announce the right rule.
      const describedBy = trigger.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const panel = container.querySelector(`#${describedBy}`);
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute("role")).toBe("tooltip");

      // Focus, not just hover, must be able to reveal the panel.
      expect(panel?.className).toContain("group-focus:opacity-100");
      expect(panel?.className).toContain("group-focus-within:opacity-100");

      act(() => {
        (trigger as HTMLElement).focus();
      });
      expect(document.activeElement).toBe(trigger);
    });
  });
});
