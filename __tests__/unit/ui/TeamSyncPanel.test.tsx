import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSyncPanel } from "../../../src/ui/components/TeamManagement/TeamSyncPanel";
import { publishTeamSyncStatus, type TeamSyncStatus } from "../../../src/firebase/teamSyncStatus";

vi.mock("../../../src/firebase/config", () => ({ isFirebaseConfigured: () => false, getDb: vi.fn() }));

const SYNCED: TeamSyncStatus = { waiting: 0, conflicts: [], syncing: false, offline: false, syncedAt: null };

describe("TeamSyncPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
      publishTeamSyncStatus(null);
    });
    container.remove();
  });

  function show(status: TeamSyncStatus | null): string {
    act(() => {
      publishTeamSyncStatus(status);
      root.render(<TeamSyncPanel />);
    });
    return container.textContent;
  }

  it("shows nothing for a coach who is not signed in", () => {
    expect(show(null)).toBe("");
  });

  it("counts the changes waiting to upload even while a sync is trying", () => {
    expect(show({ ...SYNCED, waiting: 2, syncing: true, offline: true })).toContain(
      "2 team changes saved on this device. They upload when you are back online."
    );
  });

  it("asks which version to keep for a team changed on another device", () => {
    const text = show({ ...SYNCED, waiting: 1, conflicts: [{ id: "t1", name: "Busy Humans", deletedElsewhere: false }] });

    expect(text).toContain("Busy Humans");
    expect(text).toContain("This team changed on another device while this one had changes to upload.");
    expect(text).toContain("Keep this device's version");
    expect(text).toContain("Use the other device's version");
  });
});
