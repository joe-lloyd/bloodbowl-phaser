import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import type { Player } from "../../src/types/Player";
import { getSkill, SkillType } from "../../src/types/Skills";
import {
  type OnlineMatch,
  setActiveOnlineMatch,
} from "../../src/network/OnlineMatch";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize({ eventBus: bus, team1: game.ctx.team1, team2: game.ctx.team2 });
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

async function showBlock(
  myTeamId: string,
  defender: Player | undefined,
  isUphill: boolean
) {
  setActiveOnlineMatch({
    myTeamId,
    mayAct: () => true,
  } as unknown as OnlineMatch);
  const attacker = game.ctx.team1.players[0];
  fixtureValue(defender).skills = [getSkill(SkillType.BLOCK)];
  await act(async () => {
    root.render(<BlockDiceDialog eventBus={bus} />);
  });
  await act(async () => {
    bus.emit(GameEventNames.UI_BlockDialog, {
      attackerId: fixtureValue(attacker).id,
      defenderId: fixtureValue(defender).id,
      analysis: {
        diceCount: 2,
        isUphill,
        attackerST: 3,
        defenderST: 4,
        barricadeCover: false,
        attackerAssists: [],
        defenderAssists: [fixtureValue(game.ctx.team2.players[1])],
      },
    });
  });
  return [
    ...container.querySelectorAll(
      '[data-testid="block-roll-analysis"] > p, [data-testid="block-roll-analysis"] > div > div'
    ),
  ].map((line) => line.textContent);
}

const showUphillBlock = (myTeamId: string) =>
  showBlock(myTeamId, game.ctx.team2.players[0], true);

it("tells a coach whose Fanatic hits their own teammate that they pick", async () => {
  const lines = await showBlock(
    game.ctx.team1.id,
    game.ctx.team1.players[1],
    false
  );
  expect(lines[0]).toBe("2 dice, you pick");
});

it("speaks to the defending coach as the one who picks", async () => {
  const defenderNumber = fixtureValue(game.ctx.team2.players[1]).number;
  expect(await showUphillBlock(game.ctx.team2.id)).toEqual([
    "2 dice, you pick",
    "ST 3 vs 4 (3 +1)",
    `Our assists: #${String(defenderNumber)}`,
    "Our Block: safe on Both Down",
  ]);
});

it("still speaks to the attacking coach from their side", async () => {
  const defenderNumber = fixtureValue(game.ctx.team2.players[1]).number;
  expect(await showUphillBlock(game.ctx.team1.id)).toEqual([
    "2 dice, they pick",
    "ST 3 vs 4 (3 +1)",
    `Their assists: #${String(defenderNumber)}`,
    "Their Block: safe on Both Down",
  ]);
});
