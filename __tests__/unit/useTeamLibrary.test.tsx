import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  setTeamLibraryStatus,
  setTeamRepository,
} from "../../src/game/managers/TeamManager";
import {
  useTeamLibrary,
  useTeamLibraryStatus,
} from "../../src/ui/hooks/useTeamLibrary";
import { type Team } from "../../src/types/Team";
import { HeadlessGame } from "../../src/headless/HeadlessGame";

function Names() {
  const [teams] = useTeamLibrary();
  return <p>{teams.map((team) => team.name).join(",")}</p>;
}

function Status() {
  return <p data-testid="status">{useTeamLibraryStatus()}</p>;
}

function ChangeWhileRendering({ change }: { change: () => void }) {
  const done = React.useRef(false);
  if (!done.current) {
    done.current = true;
    change();
  }
  return null;
}

function cloudTeam(): Team {
  return { ...new HeadlessGame({ seed: 1 }).ctx.team1, name: "Cloud Team" };
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
    await act(async () => {
      root.unmount();
    });
    container.remove();
    setTeamRepository(null);
  });

  it("shows the cloud library when it arrives after the page mounted", async () => {
    await act(async () => {
      root.render(<Names />);
    });
    expect(container.textContent).toBe("");

    const team: Team = {
      ...new HeadlessGame({ seed: 1 }).ctx.team1,
      name: "Cloud Team",
    };
    await act(async () => {
      setTeamRepository({
        loadTeams: () => [team],
        saveTeams: () => {},
        deleteTeam: () => {},
      });
    });

    expect(container.textContent).toBe("Cloud Team");
  });

  it("does not miss a library that arrives between render and subscribing", async () => {
    const team = cloudTeam();
    await act(async () => {
      root.render(
        <>
          <Names />
          <ChangeWhileRendering
            change={() => {
              setTeamRepository({
                loadTeams: () => [team],
                saveTeams: () => {},
                deleteTeam: () => {},
              });
            }}
          />
        </>
      );
    });

    expect(container.textContent).toBe("Cloud Team");
  });

  it("does not miss a status change between render and subscribing", async () => {
    await act(async () => {
      root.render(
        <>
          <Status />
          <ChangeWhileRendering
            change={() => {
              setTeamLibraryStatus("failed");
            }}
          />
        </>
      );
    });

    expect(container.textContent).toBe("failed");
  });
});
