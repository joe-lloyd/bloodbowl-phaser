import { describe, expect, it } from "vitest";
import { nextComputerPregameCommand } from "../../../src/game/inducements/computerPurchases";
import { sevensInducementCatalog } from "../../../src/game/inducements/catalog";
import { InducementSession } from "../../../src/game/inducements/InducementSession";
import {
  Inducement,
  buildSeventsInducementProfile,
  type InducementSelectionLine,
  type PregameInducementsState,
} from "../../../src/types/Inducements";
import { RosterName } from "../../../src/types/Team";

function computerShopping(
  rosterName: RosterName,
  pettyCash: number,
  basket: InducementSelectionLine[] = []
) {
  const profile = buildSeventsInducementProfile({ advancedLeague: false });
  const session = new InducementSession(
    profile,
    { computer: pettyCash, human: 0 },
    { computer: sevensInducementCatalog({ rosterName }), human: [] },
    { selections: { computer: basket }, confirmed: {} }
  );
  for (let step = 0; step < 20; step++) {
    const pregame: PregameInducementsState = {
      ready: { computer: true, human: true },
      buyOrder: ["computer", "human"],
      offer: {
        profile,
        budgets: session.getBudgets(),
        catalogs: session.getCatalogs(),
        selections: { computer: session.getSelection("computer") },
        confirmed: {},
      },
    };
    const command = nextComputerPregameCommand(pregame, "computer", [
      "computer",
      "human",
    ]);
    if (command?.type === "confirm-inducements")
      return session
        .getSelection("computer")
        .map((line) => `${line.inducement} x${String(line.quantity)}`)
        .toSorted();
    if (command?.type !== "select-inducement")
      throw new Error(`Unexpected ${String(command?.type)}`);
    const inducement = Object.values(Inducement).find(
      (known) => known === command.inducement
    );
    if (!inducement) throw new Error(`Unknown ${command.inducement}`);
    const result = session.select("computer", inducement, command.quantity);
    if (!result.ok) throw new Error(result.errors.join(", "));
  }
  throw new Error("The computer never confirmed its inducements");
}

describe("the computer's pregame inducements", () => {
  it("buys a Halfling team the Master Chef first", () => {
    expect(computerShopping(RosterName.HALFLING, 130_000)).toEqual([
      "Halfling Master Chef x1",
      "Part-time Assistant Coach x2",
    ]);
  });

  it("drops an older basket's Extra Team Training before buying a Halfling team the Chef", () => {
    expect(
      computerShopping(RosterName.HALFLING, 130_000, [
        { inducement: Inducement.EXTRA_TEAM_TRAINING, quantity: 1 },
      ])
    ).toEqual(["Halfling Master Chef x1", "Part-time Assistant Coach x2"]);
  });

  it("buys other teams Extra Team Training first", () => {
    expect(computerShopping(RosterName.HUMAN, 130_000)).toEqual([
      "Extra Team Training x1",
    ]);
  });
});
