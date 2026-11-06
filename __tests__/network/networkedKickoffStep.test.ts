/**
 * A kick-off event step on a networked board: the decision the board reads
 * is away while a command for it runs. The step must still show, and the
 * board must hear when the result can be read.
 */
import { describe, expect, it } from "vitest";
import { NetworkedGameService } from "../../src/network/NetworkedGameService";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import type {
  CommandResponse,
  PendingDecision,
} from "../../src/headless/protocol";

const quickSnap = (picked: string[]): PendingDecision => ({
  type: "kickoff-event",
  chooserTeamId: "team1",
  event: KickoffEvent.QUICK_SNAP,
  selectionLimit: 3,
  selectedPlayerIds: picked,
  movedPlayerIds: [],
  awaitingPlacement: [],
});

describe("a kick-off event step on a networked board", () => {
  it("still shows while a pick is on its way, and announces the result", async () => {
    let pending: PendingDecision | null = quickSnap([]);
    let answer: (response: CommandResponse) => void = () => {};
    const eventBus = new EventBus();
    let changed = 0;
    eventBus.on(GameEventNames.KickoffEventStepChanged, () => changed++);
    const board = new NetworkedGameService(
      {} as never,
      () => new Promise<CommandResponse>((resolve) => (answer = resolve)),
      () => pending,
      eventBus
    );

    expect(board.selectKickoffEventPlayer("p1")).toBe(true);
    // The engine has taken the decision to apply the pick
    pending = null;
    expect(board.getKickoffEventStep()?.event).toBe(KickoffEvent.QUICK_SNAP);
    expect(changed).toBe(0);

    pending = quickSnap(["p1"]);
    answer({ ok: true, events: [] } as unknown as CommandResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changed).toBe(1);
    expect(board.getKickoffEventStep()?.selectedPlayerIds).toEqual(["p1"]);
  });

  it("shows no step once Done has ended it", async () => {
    let pending: PendingDecision | null = quickSnap(["p1"]);
    const board = new NetworkedGameService(
      {} as never,
      async () => {
        pending = null;
        return { ok: true, events: [] } as unknown as CommandResponse;
      },
      () => pending,
      new EventBus()
    );
    board.confirmKickoffEventStep();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(board.getKickoffEventStep()).toBeNull();
  });
});
