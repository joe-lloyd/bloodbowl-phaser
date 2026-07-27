import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import type { AnnouncementKind } from "../../src/types/events";
import { Announcer } from "../../src/ui/components/hud/Announcer";

describe("Announcer", () => {
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

  const kinds: AnnouncementKind[] = [
    "turn-started",
    "round-passed",
    "halftime",
    "full-time",
  ];

  for (const kind of kinds) {
    it(`shows the headline for the ${kind} kind`, async () => {
      await act(async () => {
        root.render(<Announcer eventBus={eventBus} />);
      });

      await act(async () => {
        eventBus.emit(GameEventNames.UI_Announce, {
          kind,
          headline: `Headline for ${kind}`,
        });
      });

      expect(container.textContent).toContain(`Headline for ${kind}`);
    });
  }

  it("replaces the current announcement with a later one instead of stacking", async () => {
    await act(async () => {
      root.render(<Announcer eventBus={eventBus} />);
    });

    await act(async () => {
      eventBus.emit(GameEventNames.UI_Announce, {
        kind: "turn-started",
        headline: "Away Team's Turn",
      });
    });
    expect(container.textContent).toContain("Away Team's Turn");

    await act(async () => {
      eventBus.emit(GameEventNames.UI_Announce, {
        kind: "halftime",
        headline: "Halftime",
      });
    });

    expect(container.textContent).toContain("Halftime");
    expect(container.textContent).not.toContain("Away Team's Turn");
  });

  it("only accepts the four announcement kinds — the type union is the only entry point", () => {
    // @ts-expect-error "kickoff" is not a structural transition and must
    // never be able to raise an announcement.
    const invalidKind: AnnouncementKind = "kickoff";
    void invalidKind;
  });
});
