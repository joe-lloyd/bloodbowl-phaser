import { describe, expect, it } from "vitest";
import {
  readRoll,
  rollBannerText,
} from "../../src/ui/components/hud/RollBanner";
import { InjuryResult } from "../../src/game/controllers/InjuryController";

/** What the Armour and Injury Roll banner says at each stage. */
describe("roll banner text", () => {
  const orc = { kind: "armour" as const, playerName: "Grimgor" };
  const broken = {
    kind: "armour" as const,
    playerName: "Grimgor",
    playerId: "p1",
    roll: 10,
    armor: 9,
    broken: true,
  };

  it("reads armour, foul armour and injury rolls by the engine's names", () => {
    expect(readRoll("Armour Roll (Grimgor)")).toEqual(orc);
    expect(readRoll("Foul Armour Roll (Grimgor)")).toEqual(orc);
    expect(readRoll("Injury Roll (Grimgor)")).toEqual({
      kind: "injury",
      playerName: "Grimgor",
    });
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
    });
    expect(rollBannerText(roll, "thrown", outcome(InjuryResult.KO))).toEqual(
      { headline: "Injury Roll", subtitle: "Grimgor", result: false }
    );
    expect(
      rollBannerText(roll, "landed", outcome(InjuryResult.KO)).headline
    ).toBe("Knocked Out");
    expect(
      rollBannerText(roll, "landed", outcome(InjuryResult.STUNNED)).headline
    ).toBe("Stunned");
    expect(
      rollBannerText(roll, "landed", outcome(InjuryResult.DEAD))
    ).toEqual({
      headline: "Casualty",
      subtitle: "Grimgor · casualty roll next",
      result: true,
    });
  });
});
