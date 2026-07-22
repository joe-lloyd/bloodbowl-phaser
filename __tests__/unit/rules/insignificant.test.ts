import { describe, it, expect } from "vitest";
import {
  isInsignificant,
  countInsignificant,
  insignificantLimitOk,
  validateInsignificant,
} from "../../../src/game/rules/insignificant";
import { Player, PlayerStatus } from "../../../src/types/Player";
import { SkillType, getSkill } from "../../../src/types/Skills";

/** A player carrying (or not) the Insignificant trait. */
const P = (insignificant: boolean, id = "p"): Player =>
  ({
    id,
    teamId: "team1",
    playerName: id,
    status: PlayerStatus.ACTIVE,
    hasActed: false,
    skills: insignificant ? [getSkill(SkillType.INSIGNIFICANT)] : [],
    stats: { MA: 6, ST: 3, AG: 3, PA: 3, AV: 8 },
  }) as Player;

const list = (insig: number, sig: number): Player[] => [
  ...Array.from({ length: insig }, (_, i) => P(true, `insig${i}`)),
  ...Array.from({ length: sig }, (_, i) => P(false, `sig${i}`)),
];

describe("Insignificant draft-list limit", () => {
  it("detects the trait on a player", () => {
    expect(isInsignificant(P(true))).toBe(true);
    expect(isInsignificant(P(false))).toBe(false);
  });

  it("counts the players carrying the trait", () => {
    expect(countInsignificant(list(3, 4))).toBe(3);
    expect(countInsignificant(list(0, 5))).toBe(0);
  });

  it("allows a list with more non-Insignificant than Insignificant players", () => {
    expect(insignificantLimitOk(list(3, 4))).toBe(true);
    expect(validateInsignificant(list(3, 4))).toBeNull();
  });

  it("allows an equal split (not MORE with the trait than without)", () => {
    expect(insignificantLimitOk(list(4, 4))).toBe(true);
    expect(validateInsignificant(list(4, 4))).toBeNull();
  });

  it("rejects a list where Insignificant players outnumber the rest", () => {
    expect(insignificantLimitOk(list(5, 4))).toBe(false);
    const error = validateInsignificant(list(5, 4));
    expect(error).toContain("Insignificant");
  });

  it("rejects an all-Insignificant list", () => {
    expect(insignificantLimitOk(list(7, 0))).toBe(false);
    expect(validateInsignificant(list(7, 0))).not.toBeNull();
  });

  it("treats an empty list as legal", () => {
    expect(insignificantLimitOk([])).toBe(true);
    expect(validateInsignificant([])).toBeNull();
  });
});
