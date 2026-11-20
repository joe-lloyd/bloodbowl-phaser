import type * as CoachesModule from "../../src/firebase/coaches";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESENCE_INTERVAL_MS } from "../../src/social/friends";
import { useCoachPresence } from "../../src/ui/hooks/useSocial";

const coaches = vi.hoisted(() => ({
  ensureCoachProfile: vi.fn<[string], Promise<void>>(),
  touchPresence: vi.fn<[string], Promise<void>>(),
}));

vi.mock("../../src/firebase/coaches", async (importOriginal) => ({
  ...(await importOriginal<typeof CoachesModule>()),
  ensureCoachProfile: coaches.ensureCoachProfile,
  touchPresence: coaches.touchPresence,
}));

function Presence({ uid }: { uid: string }) {
  useCoachPresence(uid);
  return null;
}

describe("coach presence", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockReturnValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps trying to create the profile until it works, then only marks the coach present", async () => {
    coaches.ensureCoachProfile
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    coaches.touchPresence.mockResolvedValue(undefined);

    await act(async () => {
      root.render(<Presence uid="coach" />);
      await Promise.resolve();
    });
    expect(coaches.ensureCoachProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS);
    });
    expect(coaches.ensureCoachProfile).toHaveBeenCalledTimes(2);
    expect(coaches.touchPresence).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESENCE_INTERVAL_MS);
    });
    expect(coaches.ensureCoachProfile).toHaveBeenCalledTimes(2);
    expect(coaches.touchPresence).toHaveBeenCalledWith("coach");
  });
});
