/**
 * Online, both coaches see the block card. Round 2, 27:11: the defender's
 * card read "2 dice, they pick" and "They have Block" to the coach who picks
 * and whose player has Block. The card speaks from the viewing coach's side.
 */
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { EventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import { GameEventNames } from "../../src/types/events";
import { getSkill, SkillType } from "../../src/types/Skills";
import { OnlineMatch, setActiveOnlineMatch } from "../../src/network/OnlineMatch";
import { BlockDiceDialog } from "../../src/ui/components/hud/BlockDiceDialog";

let container: HTMLDivElement;
let root: Root;
let bus: EventBus;
let game: HeadlessGame;

beforeEach(() => {
  game = new HeadlessGame({ seed: 1 });
  bus = new EventBus();
  ServiceContainer.initialize(bus, game.ctx.team1, game.ctx.team2);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setActiveOnlineMatch(null);
  ServiceContainer.reset();
});

/** An uphill block on a defender with Block, seen from `myTeamId`. */
async function showUphillBlock(myTeamId: string) {
  setActiveOnlineMatch({
    myTeamId,
    mayAct: () => true,
  } as unknown as OnlineMatch);
  const attacker = game.ctx.team1.players[0];
  const defender = game.ctx.team2.players[0];
  defender.skills = [getSkill(SkillType.BLOCK)];
  await act(async () => root.render(<BlockDiceDialog eventBus={bus} />));
  await act(async () =>
    bus.emit(GameEventNames.UI_BlockDialog, {
      attackerId: attacker.id,
      defenderId: defender.id,
      analysis: {
        diceCount: 2,
        isUphill: true,
        attackerST: 3,
        defenderST: 4,
        attackerAssists: [],
        defenderAssists: [game.ctx.team2.players[1]],
      },
    })
  );
  return [
    ...container.querySelectorAll('[data-testid="block-roll-analysis"] > div'),
  ].map((line) => line.textContent);
}

it("speaks to the defending coach as the one who picks", async () => {
  const defenderNumber = game.ctx.team2.players[1].number;
  expect(await showUphillBlock(game.ctx.team2.id)).toEqual([
    "2 dice, you pick",
    `Our assists: #${defenderNumber}`,
    "Their assists: none",
    "We have Block: safe on Both Down",
  ]);
});

it("still speaks to the attacking coach from their side", async () => {
  const defenderNumber = game.ctx.team2.players[1].number;
  expect(await showUphillBlock(game.ctx.team1.id)).toEqual([
    "2 dice, they pick",
    "Our assists: none",
    `Their assists: #${defenderNumber}`,
    "They have Block: safe on Both Down",
  ]);
});
