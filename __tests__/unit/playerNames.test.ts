import { describe, expect, it } from "vitest";
import { RosterName } from "../../src/types/Team";
import {
  formatPlayerName,
  generatePlayerName,
  nameBookFor,
} from "../../src/game/names/playerNames";

function scripted(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

function book(position: string) {
  const found = nameBookFor(RosterName.VAMPIRE, position);
  if (!found) throw new Error(`no name book for ${position}`);
  return found;
}

describe("player names", () => {
  it("names a vampire blitzer from a noble house with an epithet", () => {
    const name = generatePlayerName(
      book("Vampire Blitzer"),
      "male",
      scripted(0, 0.1, 0, 0, 0, 0.1, 0)
    );
    expect(formatPlayerName(name)).toBe("Anton von Ashmoor, the Red Hand");
  });

  it("names a female runner with a plain surname and no epithet", () => {
    const name = generatePlayerName(
      book("Vampire Runner"),
      "female",
      scripted(0.99, 0.9, 0, 0.9)
    );
    expect(formatPlayerName(name)).toBe("Lucretia Draganescu");
  });

  it("gives thralls peasant family names with no particle", () => {
    const name = generatePlayerName(
      book("Thrall Lineman"),
      "female",
      scripted(0.15, 0.1, 0, 0, 0.9)
    );
    expect(formatPlayerName(name)).toBe("Dana Mudwater");
  });

  it("has no book for a roster it does not know yet", () => {
    expect(nameBookFor(RosterName.ORC, "Orc Lineman")).toBeUndefined();
  });

  it("only uses names from the book for the chosen gender", () => {
    const thrower = book("Vampire Thrower");
    for (let i = 0; i < 200; i++) {
      const { given } = generatePlayerName(thrower, "female");
      expect(thrower.given.female).toContain(given);
    }
  });
});
