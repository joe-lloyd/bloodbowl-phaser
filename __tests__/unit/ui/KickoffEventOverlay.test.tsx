import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ServiceContainer } from "../../../src/services/ServiceContainer";
import { EventBus } from "../../../src/services/EventBus";
import { GameEventNames } from "../../../src/types/events";
import { KickoffEventOverlay } from "../../../src/ui/components/hud/KickoffEventOverlay";
import { KickoffEvent } from "../../../src/game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../../../src/game/kickoff/KickoffEventManager";
import {
  getActiveOnlineMatch,
  setActiveOnlineMatch,
  OnlineMatch,
} from "../../../src/network/OnlineMatch";
import { TeamBuilder } from "../../utils/test-builders";

/**
 * redesign-multiplayer-selection-visibility, tasks.md 1.1/1.4: the passive
 * (non-deciding) coach in an online match must see no Skip/Confirm controls
 * for a kickoff event step they cannot act in — only the event/outcome text.
 */
describe("KickoffEventOverlay", () => {
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
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
  });

  function setup() {
    const team1 = new TeamBuilder()
      .withId("team-1")
      .withName("Reikland Reavers")
      .withPlayers(2)
      .build();
    const team2 = new TeamBuilder()
      .withId("team-2")
      .withName("Bad Badgers")
      .withPlayers(2)
      .build();
    const eventBus = new EventBus();
    const services = ServiceContainer.initialize(eventBus, team1, team2);

    const step: KickoffEventStepState = {
      event: KickoffEvent.SOLID_DEFENCE,
      teamId: team1.id,
      selectionLimit: 2,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
    };
    // The engine's real dice-roll path to reach an interactive step is
    // exercised elsewhere (headless/session tests); this test only needs a
    // step to exist so it can assert on rendering around `canAct`.
    services.gameService.getKickoffEventStep = () => step;

    return { eventBus, team1, team2 };
  }

  function fakeMatch(myTeamId: string, mayAct: boolean): OnlineMatch {
    return {
      myTeamId,
      mayAct: () => mayAct,
    } as unknown as OnlineMatch;
  }

  async function render(eventBus: EventBus) {
    await act(async () => {
      root.render(<KickoffEventOverlay eventBus={eventBus} />);
    });
    // The overlay only reads the step on specific engine events (it does not
    // poll on mount) — KickoffEventStepStarted is what a real step-open does.
    await act(async () => {
      eventBus.emit(GameEventNames.KickoffEventStepStarted, {
        event: KickoffEvent.SOLID_DEFENCE,
        teamId: "team-1",
        selectionLimit: 2,
      });
    });
  }

  it("shows Skip/Confirm to the deciding coach", async () => {
    const { eventBus, team1 } = setup();
    setActiveOnlineMatch(fakeMatch(team1.id, true));

    await render(eventBus);

    expect(container.textContent).toContain(KickoffEvent.SOLID_DEFENCE);
    const skip = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Skip"
    );
    const confirm = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Confirm"
    );
    expect(skip).toBeDefined();
    expect(confirm).toBeDefined();
  });

  it("hides Skip/Confirm from the non-deciding coach, but still shows the event", async () => {
    const { eventBus, team1, team2 } = setup();
    // team2's coach is watching a step that belongs to team1.
    setActiveOnlineMatch(fakeMatch(team2.id, false));

    await render(eventBus);

    expect(container.textContent).toContain(KickoffEvent.SOLID_DEFENCE);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.textContent).toContain("Waiting for");
  });

  it("shows Skip/Confirm with no online match at all (local/offline play)", async () => {
    const { eventBus } = setup();
    expect(getActiveOnlineMatch()).toBeNull();

    await render(eventBus);

    const buttons = [...container.querySelectorAll("button")].map(
      (b) => b.textContent
    );
    expect(buttons).toEqual(["Skip", "Confirm"]);
  });
});
