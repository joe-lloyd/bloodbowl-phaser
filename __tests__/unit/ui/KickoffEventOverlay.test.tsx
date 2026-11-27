import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  type OnlineMatch,
} from "../../../src/network/OnlineMatch";
import { TeamBuilder } from "../../utils/test-builders";

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
  const services = ServiceContainer.initialize({ eventBus: eventBus, teams: [team1, team2] });

  const step: KickoffEventStepState = {
    event: KickoffEvent.ALERT_DEFENCE,
    teamId: team1.id,
    selectionLimit: 2,
    selectedPlayerIds: [],
    movedPlayerIds: [],
    awaitingPlacement: [],
    stage: "choose",
    canReselect: false,
  };

  services.gameService.getKickoffEventStep = () => step;

  return { eventBus, team1, team2 };
}

function fakeMatch(myTeamId: string, mayAct: boolean): OnlineMatch {
  return {
    myTeamId,
    mayAct: () => mayAct,
  } as unknown as OnlineMatch;
}

describe("KickoffEventOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    setActiveOnlineMatch(null);
    ServiceContainer.reset();
  });



  async function render(eventBus: EventBus) {
    await act(async () => {
      root.render(<KickoffEventOverlay eventBus={eventBus} />);
    });

    await act(async () => {
      eventBus.emit(GameEventNames.KickoffEventStepStarted, {
        event: KickoffEvent.ALERT_DEFENCE,
        teamId: "team-1",
        selectionLimit: 2,
      });
    });
  }

  it("shows Skip and Start to the deciding coach", async () => {
    const { eventBus, team1 } = setup();
    setActiveOnlineMatch(fakeMatch(team1.id, true));

    await render(eventBus);

    expect(container.textContent).toContain(KickoffEvent.ALERT_DEFENCE);
    const skip = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Skip"
    );
    const done = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "Start Alert Defence"
    );
    expect(skip).toBeDefined();
    expect(done).toBeDefined();
  });

  it("hides Skip and Start from the non-deciding coach, but still shows the event", async () => {
    const { eventBus, team2 } = setup();

    setActiveOnlineMatch(fakeMatch(team2.id, false));

    await render(eventBus);

    expect(container.textContent).toContain(KickoffEvent.ALERT_DEFENCE);
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.textContent).toContain("Waiting for");
  });

  it("shows Skip and Start with no online match at all (local/offline play)", async () => {
    const { eventBus } = setup();
    expect(getActiveOnlineMatch()).toBeNull();

    await render(eventBus);

    const buttons = [...container.querySelectorAll("button")].map(
      (b) => b.textContent
    );
    expect(buttons).toEqual(["Skip", "Start Alert Defence"]);
  });

  it("asks for one click on a High Kick, with nothing to confirm", async () => {
    const { eventBus, team1 } = setup();
    const services = ServiceContainer.getInstance();
    services.gameService.getKickoffEventStep = () => ({
      event: KickoffEvent.HIGH_KICK,
      teamId: team1.id,
      selectionLimit: 1,
      selectedPlayerIds: [],
      movedPlayerIds: [],
      awaitingPlacement: [],
      stage: "choose",
      canReselect: false,
    });

    await render(eventBus);

    expect(
      [...container.querySelectorAll("li")].map((line) => line.textContent)
    ).toEqual(["1Choose a ringed player to stand under the ball"]);
    expect(
      [...container.querySelectorAll("button")].map((b) => b.textContent)
    ).toEqual(["Skip"]);
  });
});
