import { describe, expect, it } from "vitest";
import { nextComputerPregameCommand } from "../../../src/game/inducements/computerPurchases";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import {
  Inducement,
  buildSeventsInducementProfile,
  type InducementSelectionLine,
  type PregameInducementsState,
} from "../../../src/types/Inducements";
import { RosterName } from "../../../src/types/Team";

function computerShopping(rosterName: RosterName, pettyCash: number) {
  const selections: InducementSelectionLine[] = [];
  const pregame: PregameInducementsState = {
    ready: { computer: true, human: true },
    buyOrder: ["computer", "human"],
    offer: {
      profile: buildSeventsInducementProfile({ advancedLeague: false }),
      budgets: { computer: pettyCash, human: 0 },
      catalogs: {
        computer: sevensInducementCatalog({ rosterName }),
        human: [],
      },
      selections: { computer: selections },
      confirmed: {},
    },
  };
  const bought: string[] = [];
  for (;;) {
    const command = nextComputerPregameCommand(pregame, "computer", [
      "computer",
      "human",
    ]);
    if (command?.type !== "select-inducement") return bought;
    const inducement = Object.values(Inducement).find(
      (known) => known === command.inducement
    );
    if (!inducement) throw new Error(`Unknown ${command.inducement}`);
    bought.push(`${inducement} x${String(command.quantity)}`);
    selections.push({ inducement, quantity: command.quantity });
  }
}

describe("the computer's pregame inducements", () => {
  it("buys a Halfling team the Master Chef first", () => {
    expect(computerShopping(RosterName.HALFLING, 130_000)).toEqual([
      "Halfling Master Chef x1",
      "Part-time Assistant Coach x2",
    ]);
  });

  it("buys other teams Extra Team Training first", () => {
    expect(computerShopping(RosterName.HUMAN, 130_000)).toEqual([
      "Extra Team Training x1",
    ]);
  });
});
