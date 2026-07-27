import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlayerDevelopment } from "../../src/ui/components/TeamBuilder/PlayerDevelopment";
import { TeamBuilder as TestTeamBuilder } from "../utils/test-builders";
import { Team } from "../../src/types/Team";
import { SkillCategory } from "../../src/types/Skills";

/**
 * Advancement selection was moved out of the match results screen and into
 * Manage Team (see match-results-screen / post-match-summary specs): a
 * player becomes "pending development" purely from persisted SPP — no
 * separate flag — so this exercises that a player who earned enough SPP in
 * a match is surfaced here and can complete a characteristic advancement,
 * without ever needing the results screen open.
 */
describe("PlayerDevelopment (Manage Team pending advancement)", () => {
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

  function buildTeam(): Team {
    const team = new TestTeamBuilder()
      .withId("team-1")
      .withName("Reikland Reavers")
      .withPlayers(1)
      .build();
    team.players[0].spp = 20; // enough for any single advancement
    team.players[0].primary = [SkillCategory.GENERAL];
    return team;
  }

  it("renders nothing when no player has enough SPP to advance", async () => {
    const team = new TestTeamBuilder()
      .withId("team-1")
      .withName("Reikland Reavers")
      .withPlayers(1)
      .build();

    await act(async () => {
      root.render(<PlayerDevelopment team={team} onTeamChanged={() => {}} />);
    });

    expect(container.textContent).toBe("");
  });

  it("surfaces an eligible player and applies a characteristic advancement end to end", async () => {
    const team = buildTeam();
    let latestTeam: Team = team;

    await act(async () => {
      root.render(
        <PlayerDevelopment
          team={team}
          onTeamChanged={(next) => {
            latestTeam = next;
          }}
        />
      );
    });

    expect(container.textContent).toContain("Pending Player Development");
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = team.players[0].id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const characteristicButton = [
      ...container.querySelectorAll("button"),
    ].find((b) => b.textContent?.startsWith("Characteristic ("))!;
    await act(async () => {
      characteristicButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const rollButton = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Roll D8")
    )!;
    await act(async () => {
      rollButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const improveButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.startsWith("Improve ")
    )!;
    expect(improveButton).toBeDefined();
    await act(async () => {
      improveButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 20 SPP - 14 (characteristic cost at level 0) = 6 remaining.
    expect(team.players[0].spp).toBe(6);
    expect(team.players[0].advancements).toHaveLength(1);
    expect(latestTeam.players[0].advancements).toHaveLength(1);
  });
});
