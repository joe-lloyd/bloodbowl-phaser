import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameFlowManager } from "@/game/core/GameFlowManager";
import { GameOperation } from "@/game/core/GameOperation";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ignore = () => {};

class MockOperation extends GameOperation {
  public name: string;
  private action: (context: any) => Promise<void>;
  constructor(name: string, action: (context: any) => Promise<void>) {
    super();
    this.name = name;
    this.action = action;
  }

  async execute(context: any): Promise<void> {
    await this.action(context);
  }
}

describe("GameFlowManager", () => {
  let flowManager: GameFlowManager;
  let context: any;

  beforeEach(() => {
    context = { eventBus: { emit: vi.fn() } };
    flowManager = new GameFlowManager(context);
  });

  it("should execute operations sequentially", async () => {
    const sequence: string[] = [];

    const op1 = new MockOperation("Op1", async () => {
      sequence.push("Op1 Start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      sequence.push("Op1 End");
    });

    const op2 = new MockOperation("Op2", async () => {
      sequence.push("Op2 Start", "Op2 End");
    });

    flowManager.add(op1);
    flowManager.add(op2);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sequence).toEqual(["Op1 Start", "Op1 End", "Op2 Start", "Op2 End"]);
  });

  it("should support recursive reactions (adding to front)", async () => {
    const sequence: string[] = [];

    const reactionOp = new MockOperation("Reaction", async () => {
      sequence.push("Reaction Executed");
    });

    const triggerOp = new MockOperation("Trigger", async () => {
      sequence.push("Trigger Start");

      flowManager.add(reactionOp, true);
      sequence.push("Trigger End");
    });

    const followUpOp = new MockOperation("FollowUp", async () => {
      sequence.push("FollowUp Executed");
    });

    flowManager.add(triggerOp);
    flowManager.add(followUpOp);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sequence).toEqual([
      "Trigger Start",
      "Trigger End",
      "Reaction Executed",
      "FollowUp Executed",
    ]);
  });

  it("should clear queue on error", async () => {
    const op1 = new MockOperation("ErrorOp", async () => {
      throw new Error("Failure");
    });

    const op2 = new MockOperation("Survivor", async () => {});

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    flowManager.add(op1);
    flowManager.add(op2);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(consoleSpy).toHaveBeenCalled();
  });

  describe("running a chain to rest", () => {
    it("runs the chain, and what it queues, before the caller goes on", async () => {
      const ran: string[] = [];
      flowManager.add(
        new MockOperation("Block", async () => {
          await tick();
          await flowManager.runToRest(
            new MockOperation("Bounce", async () => {
              ran.push("Bounce");
              flowManager.add(
                new MockOperation("Catch", async () => {
                  await tick();
                  ran.push("Catch");
                }),
                true
              );
            })
          );
          ran.push("Block dice");
        })
      );
      flowManager.add(
        new MockOperation("Later", async () => {
          ran.push("Later");
        })
      );
      await tick();
      await flowManager.whenIdle();

      expect(ran).toEqual(["Bounce", "Catch", "Block dice", "Later"]);
    });

    it("drops what was queued behind it when the chain clears the flow", async () => {
      const ran: string[] = [];
      flowManager.add(
        new MockOperation("Block", async () => {
          await tick();
          await flowManager.runToRest(
            new MockOperation("Turnover", async () => {
              ran.push("Turnover");
              flowManager.clear();
            })
          );
        })
      );
      flowManager.add(
        new MockOperation("Later", async () => {
          ran.push("Later");
        })
      );
      await tick();
      await flowManager.whenIdle();

      expect(ran).toEqual(["Turnover"]);
    });

    it("leaves a flow that was abandoned under it alone", async () => {
      const ran: string[] = [];
      let resume = ignore;
      flowManager.add(
        new MockOperation("Block", async () => {
          await tick();
          await flowManager.runToRest(
            new MockOperation(
              "Paused",
              () => new Promise<void>((resolve) => (resume = resolve))
            )
          );
        })
      );
      flowManager.add(
        new MockOperation("Later", async () => {
          ran.push("Later");
        })
      );
      await tick();

      flowManager.abandon();
      flowManager.add(
        new MockOperation("Fresh", async () => {
          ran.push("Fresh");
        })
      );
      await flowManager.whenIdle();

      resume();
      await tick();
      await tick();

      expect(ran).toEqual(["Fresh"]);
      await flowManager.whenIdle();
    });

    it("lets an abandoned operation fail without clearing the fresh flow", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const ran: string[] = [];
      let fail = (_error: Error) => {};
      flowManager.add(
        new MockOperation(
          "Paused",
          () => new Promise<void>((_resolve, reject) => (fail = reject))
        )
      );
      await tick();
      flowManager.abandon();

      let finish = ignore;
      flowManager.add(
        new MockOperation(
          "Fresh",
          () =>
            new Promise<void>((resolve) => {
              finish = () => {
                ran.push("Fresh");
                resolve();
              };
            })
        )
      );
      flowManager.add(
        new MockOperation("Queued behind it", async () => {
          ran.push("Queued behind it");
        })
      );

      fail(new Error("abandoned"));
      await tick();
      finish();
      await flowManager.whenIdle();

      expect(ran).toEqual(["Fresh", "Queued behind it"]);
    });
  });
});
