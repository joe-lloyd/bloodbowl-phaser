import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTeamRepository } from "../../src/game/managers/TeamManager";
import { useTeamLibrary } from "../../src/ui/hooks/useTeamLibrary";
import { Team } from "../../src/types/Team";
import { HeadlessGame } from "../../src/headless/HeadlessGame";

/**
 * A signed-in coach's teams arrive from the cloud a moment after the app
 * loads. A page that read the library before then, the online lobby for
 * one, showed "No saved teams" for as long as it stayed open.
 */
function Names() {
  const [teams] = useTeamLibrary();
  return <p>{teams.map((team) => team.name).join(",")}</p>;
}

describe("useTeamLibrary", () => {
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
    setTeamRepository(null);
  });

  it("shows the cloud library when it arrives after the page mounted", async () => {
    await act(async () => root.render(<Names />));
    expect(container.textContent).toBe("");

    const team: Team = {
      ...new HeadlessGame({ seed: 1 }).ctx.team1,
      name: "Cloud Team",
    };
    await act(async () =>
      setTeamRepository({ loadTeams: () => [team], saveTeams: () => {} })
    );

    expect(container.textContent).toBe("Cloud Team");
  });
});
