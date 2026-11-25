import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { GameEventNames } from "../../src/types/events";
import { type BlockAnalysis } from "../../src/types/Actions";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";

describe("BlockDiceDialog — Brawler re-roll button", () => {
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
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const analysis: BlockAnalysis = {
    diceCount: 1,
    isUphill: false,
    attackerST: 3,
    defenderST: 3,
    barricadeCover: false,
    attackerAssists: [],
    defenderAssists: [],
  };

  const openAndRoll = async (brawlerAvailable: boolean) => {
    await act(async () => {
      root.render(<BlockDiceDialog eventBus={eventBus} />);
    });

    await act(async () => {
      eventBus.emit(GameEventNames.UI_BlockDialog, {
        attackerId: "team1-player-1",
        defenderId: "team2-player-1",
        analysis,
      });
    });

    await act(async () => {
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "team1-player-1",
        defenderId: "team2-player-1",
        numDice: 1,
        isAttackerChoice: true,
        results: [
          {
            type: "both-down",
            icon: "/assets/dice/block_dice_both_down_1765911752228.png",
            label: "Both Down",
          },
        ],
        teamRerollAvailable: false,
        proAvailable: false,
        brawlerAvailable,
      });
    });
  };

  it("shows the block popup with the roll and a Brawler re-roll button — no separate yes/no popup", async () => {
    await openAndRoll(true);

    expect(
      container.querySelector('[data-testid="block-dice-dialog"]')
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="block-die-0"]')).toBeTruthy();
    expect(
      container.querySelector('[data-testid="reaction-dialog"]')
    ).toBeNull();

    const brawlerButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="block-brawler-reroll"]'
    );
    expect(brawlerButton).toBeTruthy();
    expect(fixtureValue(brawlerButton).textContent).toMatch(/brawler/i);
    expect(fixtureValue(brawlerButton).textContent).toMatch(/re-roll/i);
    expect(fixtureValue(brawlerButton).textContent).toMatch(/both down/i);
  });

  it("clicking the button emits UI_BrawlerRerollBlockDie for the attacker and keeps the dialog open", async () => {
    await openAndRoll(true);

    const emitted: { attackerId: string }[] = [];
    eventBus.on(GameEventNames.UI_BrawlerRerollBlockDie, (data) =>
      emitted.push(data)
    );

    const brawlerButton = fixtureValue(container.querySelector<HTMLButtonElement>(
      '[data-testid="block-brawler-reroll"]'
    ));
    await act(async () => {
      brawlerButton.click();
    });

    expect(emitted).toEqual([{ attackerId: "team1-player-1" }]);

    expect(
      container.querySelector('[data-testid="block-dice-dialog"]')
    ).toBeTruthy();
  });

  it("the popup refreshes in place when the engine re-emits BlockDiceRolled after the re-roll", async () => {
    await openAndRoll(true);

    await act(async () => {
      eventBus.emit(GameEventNames.BlockDiceRolled, {
        attackerId: "team1-player-1",
        defenderId: "team2-player-1",
        numDice: 1,
        isAttackerChoice: true,
        results: [
          {
            type: "push",
            icon: "/assets/dice/block_dice_push_1765911780125.png",
            label: "Push",
          },
        ],
        teamRerollAvailable: false,
        proAvailable: false,
        brawlerAvailable: false,
      });
    });

    expect(container.querySelector('[data-block-result="push"]')).toBeTruthy();
    expect(
      container.querySelector('[data-testid="block-brawler-reroll"]')
    ).toBeNull();
  });

  it("no Brawler button when the attacker lacks the skill or no die reads Both Down", async () => {
    await openAndRoll(false);
    expect(
      container.querySelector('[data-testid="block-brawler-reroll"]')
    ).toBeNull();
  });
});
