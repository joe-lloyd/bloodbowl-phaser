import { describe, it, expect } from "vitest";
import {
  classifyDiceRowNature,
  classifyEntryNature,
  resolveDisplayColor,
} from "../../src/ui/components/hud/diceLogColor";

describe("diceLogColor", () => {
  describe("classifyDiceRowNature", () => {
    it("classifies a successful skill check as good", () => {
      expect(
        classifyDiceRowNature({ rollType: "Dodge", resultState: "success" })
      ).toBe("good");
    });

    it("classifies a failed skill check as bad", () => {
      expect(
        classifyDiceRowNature({ rollType: "Dodge", resultState: "failure" })
      ).toBe("bad");
    });

    it("classifies a fumble as bad", () => {
      expect(
        classifyDiceRowNature({ rollType: "Pick Up", resultState: "fumble" })
      ).toBe("bad");
    });

    it.each(["Coin Toss", "Weather", "Kickoff Event"])(
      "classifies %s as neutral even when resultState is success/failure",
      (rollType) => {
        expect(classifyDiceRowNature({ rollType, resultState: "none" })).toBe(
          "neutral"
        );
        expect(
          classifyDiceRowNature({ rollType, resultState: "success" })
        ).toBe("neutral");
        expect(
          classifyDiceRowNature({ rollType, resultState: "failure" })
        ).toBe("neutral");
      }
    );

    it("classifies a roll with no resultState (or 'none') as unknown", () => {
      expect(classifyDiceRowNature({ rollType: "Block Roll" })).toBe(
        "unknown"
      );
      expect(
        classifyDiceRowNature({ rollType: "Armour Roll", resultState: "none" })
      ).toBe("unknown");
    });
  });

  describe("classifyEntryNature", () => {
    it("classifies weather and kickoff categories as neutral", () => {
      expect(classifyEntryNature("weather")).toBe("neutral");
      expect(classifyEntryNature("kickoff")).toBe("neutral");
    });

    it("classifies info as warning", () => {
      expect(classifyEntryNature("info")).toBe("warning");
    });

    it("classifies score as good", () => {
      expect(classifyEntryNature("score")).toBe("good");
    });

    it.each(["skill", "reroll", "action", "drive"] as const)(
      "classifies %s as unknown",
      (category) => {
        expect(classifyEntryNature(category)).toBe("unknown");
      }
    );
  });

  describe("resolveDisplayColor", () => {
    it("passes neutral/warning/unknown through unchanged regardless of perspective", () => {
      expect(resolveDisplayColor("neutral", "team1", "team1")).toBe(
        "neutral"
      );
      expect(resolveDisplayColor("neutral", "team1", null)).toBe("neutral");
      expect(resolveDisplayColor("warning", "team1", "team2")).toBe(
        "warning"
      );
      expect(resolveDisplayColor("unknown", "team1", "team1")).toBe(
        "unknown"
      );
      expect(resolveDisplayColor("unknown", undefined, null)).toBe(
        "unknown"
      );
    });

    it("solo/local play: good/bad pass straight through regardless of team", () => {
      expect(resolveDisplayColor("good", "team1", null)).toBe("good");
      expect(resolveDisplayColor("good", "team2", null)).toBe("good");
      expect(resolveDisplayColor("bad", "team1", null)).toBe("bad");
      expect(resolveDisplayColor("bad", "team2", null)).toBe("bad");
      expect(resolveDisplayColor("good", undefined, null)).toBe("good");
    });

    it("online play: a good roll for my own team stays good", () => {
      expect(resolveDisplayColor("good", "team1", "team1")).toBe("good");
    });

    it("online play: a bad roll for my own team stays bad", () => {
      expect(resolveDisplayColor("bad", "team1", "team1")).toBe("bad");
    });

    it("online play: a good roll for the opponent is inverted to bad", () => {
      expect(resolveDisplayColor("good", "team2", "team1")).toBe("bad");
    });

    it("online play: a bad roll for the opponent is inverted to good", () => {
      expect(resolveDisplayColor("bad", "team2", "team1")).toBe("good");
    });

    it("falls back to the intrinsic nature when teamId is missing, even online", () => {
      expect(resolveDisplayColor("good", undefined, "team1")).toBe("good");
      expect(resolveDisplayColor("bad", undefined, "team1")).toBe("bad");
    });
  });
});
