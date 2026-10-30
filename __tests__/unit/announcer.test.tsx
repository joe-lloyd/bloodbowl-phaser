import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import type { AnnouncementKind } from "../../src/types/events";
import { Announcer } from "../../src/ui/components/hud/Announcer";

describe("Announcer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let eventBus: EventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    eventBus = new EventBus();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const kinds: AnnouncementKind[] = [
    "turn-started",
    "halftime",
    "full-time",
    "touchdown",
    "kickoff-result",
    "casualty",
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

  it("queues a later announcement until the current one finishes", async () => {
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

    expect(container.textContent).toContain("Away Team's Turn");
    expect(container.textContent).not.toContain("Halftime");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2300);
    });
    expect(container.textContent).toContain("Halftime");
    expect(container.textContent).not.toContain("Away Team's Turn");
  });

  it("keeps announcement kinds in a closed type union", () => {
    // @ts-expect-error "kickoff" is not a structural transition and must
    // never be able to raise an announcement.
    const invalidKind: AnnouncementKind = "kickoff";
    void invalidKind;
  });
});
