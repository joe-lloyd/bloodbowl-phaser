import { describe, expect, it, vi } from "vitest";
import { handleKickoffClick } from "../../src/game/controllers/interaction/kickoffInteraction";
import { SubPhase } from "../../src/types/GameState";

/**
 * A kicking team with nobody on the pitch kicks on a target click alone,
 * so nothing clears between clicks the way a selected kicker does.
 */
function controller(kick: () => Promise<void>) {
  const kickBall = vi.fn(kick);
  const c: any = {
    selectedPlayerId: null,
    isBusy: false,
    scene: {
      team1: { id: "team1" },
      kickingTeam: { id: "team1", players: [{ id: "a" }] },
    },
    gameService: {
      getKickoffEventStep: () => null,
      getSubPhase: () => SubPhase.ROLL_KICKOFF,
      kickBall,
    },
    eventBus: { emit: vi.fn() },
  };
  return { c, kickBall };
}

describe("kick-off target clicks with nobody on the pitch", () => {
  it("starts one kick, however many times the target is clicked", async () => {
    let finish = () => {};
    const { c, kickBall } = controller(
      () => new Promise<void>((resolve) => (finish = resolve))
    );

    handleKickoffClick(c, 15, 5, null);
    handleKickoffClick(c, 16, 5, null);
    expect(kickBall).toHaveBeenCalledTimes(1);
    expect(kickBall).toHaveBeenCalledWith(true, null, 15, 5);

    // Once the first kick has resolved, a stale re-entry may replay it.
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    handleKickoffClick(c, 16, 5, null);
    expect(kickBall).toHaveBeenCalledTimes(2);
  });

  it("asks for a kicker while the kicking team has anyone on the pitch", () => {
    const { c, kickBall } = controller(() => Promise.resolve());
    c.scene.kickingTeam.players[0].gridPosition = { x: 5, y: 5 };

    handleKickoffClick(c, 15, 5, null);
    expect(kickBall).not.toHaveBeenCalled();
    expect(c.eventBus.emit).toHaveBeenCalledWith(
      expect.anything(),
      "Select a Kicker first!"
    );
  });
});
