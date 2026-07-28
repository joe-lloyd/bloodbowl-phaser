import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { PlayerInfoPanel } from "../../src/ui/components/hud/PlayerInfoPanel";
import { getSidelineCrewInfo } from "../../src/game/presentation/sidelineStaff";
import { Team } from "../../src/types/Team";

describe("PlayerInfoPanel: sideline crew subject", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the crew's name, effect, and count with no player fields", async () => {
    await act(async () => {
      root.render(<PlayerInfoPanel eventBus={eventBus} />);
    });

    const team = {
      coaches: 2,
      cheerleaders: 0,
      apothecary: false,
      dedicatedFans: 0,
    } as Team;
    const crew = getSidelineCrewInfo("coach", team);

    await act(async () => {
      eventBus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew,
      });
    });

    const html = container.innerHTML;
    expect(html).toContain("Assistant Coach");
    expect(html).toContain("2 on this team");
    expect(html).toContain(crew.effect);

    // No player-shaped fields: no statline labels, no Skills section.
    expect(html).not.toContain(">MA<");
    expect(html).not.toContain(">AV<");
    expect(html).not.toContain("Skills");
  });

  it("clears the crew subject on hide, the same way a player hover clears", async () => {
    await act(async () => {
      root.render(<PlayerInfoPanel eventBus={eventBus} />);
    });

    const team = {
      coaches: 0,
      cheerleaders: 0,
      apothecary: false,
      dedicatedFans: 0,
    } as Team;

    await act(async () => {
      eventBus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew: getSidelineCrewInfo("cheerleader", team),
      });
    });
    expect(container.innerHTML).toContain("Cheerleader");

    await act(async () => {
      eventBus.emit(GameEventNames.UI_HidePlayerInfo);
    });
    expect(container.innerHTML.trim()).toBe(
      "<div class=\"w-full flex flex-col items-end\"></div>"
    );
  });

  it("does not disturb a selected player when a crew subject is hovered", async () => {
    await act(async () => {
      root.render(<PlayerInfoPanel eventBus={eventBus} />);
    });

    const player = {
      id: "p1",
      number: 4,
      playerName: "Griff",
      positionName: "Blitzer",
      level: 1,
      spp: 0,
      status: "Active",
      injuries: [],
      skills: [],
      stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
    } as unknown as import("../../src/types/Player").Player;

    await act(async () => {
      eventBus.emit(GameEventNames.PlayerSelected, { player });
    });
    expect(container.innerHTML).toContain("Griff");

    const team = {
      coaches: 0,
      cheerleaders: 0,
      apothecary: true,
      dedicatedFans: 0,
    } as Team;
    await act(async () => {
      eventBus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew: getSidelineCrewInfo("apothecary", team),
      });
    });

    // Selected player panel remains, crew panel is shown alongside it.
    expect(container.innerHTML).toContain("Griff");
    expect(container.innerHTML).toContain("Apothecary");
  });
});
