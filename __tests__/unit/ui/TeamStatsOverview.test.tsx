import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TeamStatsOverview } from "../../../src/ui/components/TeamManagement/TeamStatsOverview";
import { TeamBuilder as TeamTestBuilder } from "../../utils/test-builders";

/**
 * team-management-layout: "Detail page shows the stats grid" — the shared
 * component that both TeamManagement (removed) and TeamBuilder (added) rely
 * on to avoid duplicating the formatGold/numToHex helpers.
 */
describe("TeamStatsOverview", () => {
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

  it("renders team value, treasury, roster count, and record", async () => {
    const team = new TeamTestBuilder()
      .withPlayers(5)
      .withTreasury(75000)
      .withStats(3, 1, 2)
      .build();

    await act(async () => {
      root.render(<TeamStatsOverview team={team} />);
    });

    expect(container.textContent).toContain("Team Value");
    expect(container.textContent).toContain("Treasury");
    expect(container.textContent).toContain("75k");
    expect(container.textContent).toContain("5/11");
    expect(container.textContent).toContain("3-2-1");
  });
});
