import { describe, expect, it } from "vitest";
import { RollBook, readRoll, rollBannerText } from "../../src/ui/components/hud/rollBannerState";
import { InjuryResult } from "../../src/game/controllers/InjuryController";

describe("roll banner text", () => {
  const orc = { kind: "armour" as const, playerName: "Grimgor" };
  const broken = {
    kind: "armour" as const,
    playerName: "Grimgor",
    playerId: "p1",
    roll: 10,
    armor: 9,
    broken: true,
    rollType: "Armour Roll (Grimgor)",
  };

  it("reads armour, foul armour and injury rolls by the engine's names", () => {
    expect(readRoll("Armour Roll (Grimgor)")).toEqual(orc);
    expect(readRoll("Foul Armour Roll (Grimgor)")).toEqual(orc);
    expect(readRoll("Injury Roll (Grimgor)")).toEqual({
      kind: "injury",
      playerName: "Grimgor",
    });
    expect(readRoll("Injury by the Crowd (Grimgor)")).toEqual({
      kind: "injury",
      playerName: "Grimgor",
    });

    expect(readRoll("Armor Check")).toEqual({ kind: "armour", playerName: "" });
    expect(readRoll("Dodge Roll (Grimgor)")).toBeNull();
  });

  it("names the armour roll in the air, then says it broke", () => {
    expect(rollBannerText(orc, "thrown", broken)).toEqual({
      headline: "Armour Roll",
      subtitle: "Grimgor · AV 9+",
      result: false,
    });
    expect(rollBannerText(orc, "landed", broken)).toEqual({
      headline: "Armour Broken",
      subtitle: "Grimgor · 10 against AV 9+, injury roll next",
      result: true,
    });
    expect(
      rollBannerText(orc, "landed", { ...broken, roll: 7, broken: false })
    ).toEqual({
      headline: "Armour Holds",
      subtitle: "Grimgor · 7 against AV 9+",
      result: true,
    });
  });

  it("ends the injury roll on its result", () => {
    const roll = { kind: "injury" as const, playerName: "Grimgor" };
    const outcome = (result: InjuryResult) => ({
      kind: "injury" as const,
      playerName: "Grimgor",
      playerId: "p1",
      result,
      rollType: "Injury Roll (Grimgor)",
    });
    expect(rollBannerText(roll, "thrown", outcome(InjuryResult.KO))).toEqual({
      headline: "Injury Roll",
      subtitle: "Grimgor",
      result: false,
    });
    expect(
      rollBannerText(roll, "landed", outcome(InjuryResult.KO)).headline
    ).toBe("Knocked Out");
    expect(
      rollBannerText(roll, "landed", outcome(InjuryResult.STUNNED)).headline
    ).toBe("Stunned");
    expect(rollBannerText(roll, "landed", outcome(InjuryResult.DEAD))).toEqual({
      headline: "Casualty",
      subtitle: "Grimgor · Dead",
      result: true,
    });
  });
});

const armour = (
  name: string,
  roll: number,
  broken: boolean,
  diceTeamId = "team2",
  rollType = `Armour Roll (${name})`
) => ({
  kind: "armour" as const,
  playerName: name,
  playerId: name,
  roll,
  armor: 9,
  broken,
  rollType,
  diceTeamId,
});

describe("RollBook", () => {
  it("gives a Lone Fouler re-roll the outcome, and marks the first throw re-rolled", () => {
    const book = new RollBook();
    book.queued(1, "Foul Armour Roll (Grimgor)", "team2");
    book.queued(2, "Foul Armour Roll (Grimgor)", "team2");
    book.decided(
      armour("Grimgor", 10, true, "team2", "Foul Armour Roll (Grimgor)")
    );

    expect(book.text(1, "landed")).toEqual({
      headline: "Armour Roll",
      subtitle: "Grimgor · re-rolled",
      result: false,
    });
    expect(book.text(2, "landed")?.headline).toBe("Armour Broken");
  });

  it("drops a throw's outcome with it, so later throws keep their own", () => {
    const book = new RollBook();
    book.queued(1, "Armour Roll (Grimgor)", "team2");
    book.decided(armour("Grimgor", 3, false));
    book.queued(2, "Armour Roll (Grimgor)", "team2");
    book.decided(armour("Grimgor", 4, false));
    book.forget(1);

    expect(book.text(1, "landed")).toBeNull();
    expect(book.text(2, "landed")?.subtitle).toBe("Grimgor · 4 against AV 9+");
  });

  it("never gives one team's outcome to a same-named player on the other", () => {
    const book = new RollBook();
    book.queued(1, "Armour Roll (Lineman #1)", "team1");
    book.queued(2, "Armour Roll (Lineman #1)", "team2");
    book.decided(armour("Lineman #1", 10, true));

    expect(book.text(1, "landed")?.subtitle).toBe("Lineman #1");
    expect(book.text(2, "landed")?.headline).toBe("Armour Broken");
  });

  it("names a Stab's unnamed Armor Check from its outcome", () => {
    const book = new RollBook();

    book.queued(1, "Armor Check", "team1");
    book.decided(armour("Grimgor", 11, true, "team1", "Armor Check"));

    expect(book.text(1, "thrown")).toEqual({
      headline: "Armour Roll",
      subtitle: "Grimgor · AV 9+",
      result: false,
    });
    expect(book.text(1, "landed")?.headline).toBe("Armour Broken");
  });

  it("sends a player Stunned by the crowd to the Reserves", () => {
    const book = new RollBook();
    book.queued(1, "Injury by the Crowd (Grimgor)");
    book.decided({
      kind: "injury",
      playerName: "Grimgor",
      playerId: "p1",
      result: InjuryResult.STUNNED,
      rollType: "Injury by the Crowd (Grimgor)",
      stunnedToReserves: true,
    });

    expect(book.text(1, "landed")).toEqual({
      headline: "Into the Reserves",
      subtitle: "Grimgor",
      result: true,
    });
  });
});
