import { describe, it, expect } from "vitest";
import { ClearPitchOperation } from "../../../src/game/operations/EndDriveOperations";
import { InjuryType, PlayerStatus } from "../../../src/types/Player";
import { SkillType } from "../../../src/types/Skills";
import { playerBoxOf } from "../../../src/game/rules/playerLocation";
import { type GameType } from "../../../src/game/variants/gameTypes";
import { duel, session } from "./harness";

async function endDrive(
  gameType: GameType,
  dice: number[],
  skills: SkillType[] = []
) {
  const s = session(
    gameType,
    duel([{ skills: [SkillType.SECRET_WEAPON, ...skills] }], [{}]),
    dice
  );
  await s.game.ctx.gameService.flowManager.runToRest(
    new ClearPitchOperation("touchdown", "team2", true)
  );
  return s;
}

describe("SB-M12: the Street Bowl crowd and Secret Weapons", () => {
  it("1-3 drags the player off Badly Hurt", async () => {
    const s = await endDrive("street-bowl", [3]);
    expect(s.player(1).status).toBe(PlayerStatus.INJURED);
    expect(s.player(1).injuries).toEqual([InjuryType.BADLY_HURT]);
  });

  it("4+ keeps the player for the next drive", async () => {
    const s = await endDrive("street-bowl", [4]);
    expect(s.player(1).status).toBe(PlayerStatus.RESERVE);
    expect(s.player(1).injuries).toEqual([]);
  });

  it("a Loner is dragged off on a 5", async () => {
    const s = await endDrive("street-bowl", [5], [SkillType.LONER]);
    expect(s.player(1).status).toBe(PlayerStatus.INJURED);
  });

  it("a Loner stays on a 6", async () => {
    const s = await endDrive("street-bowl", [6], [SkillType.LONER]);
    expect(s.player(1).status).toBe(PlayerStatus.RESERVE);
  });
});

describe("GB-M12: the Gutter Bowl crowd and Secret Weapons", () => {
  it("4+ keeps the player for the next drive", async () => {
    const s = await endDrive("gutter-bowl", [4]);
    expect(s.player(1).status).toBe(PlayerStatus.RESERVE);
  });

  it("1-3 removes the player for the game", async () => {
    const s = await endDrive("gutter-bowl", [3, 2]);
    expect(s.player(1).status).toBe(PlayerStatus.REMOVED);
    expect(s.player(1).injuries).toEqual([]);
  });

  it("1-3 and then a 1 makes the player a Casualty, with a Casualty roll", async () => {
    const s = await endDrive("gutter-bowl", [1, 1, 16]);
    expect(playerBoxOf(s.player(1))).toBe("casualty");
    expect(s.player(1).injuries).toEqual([InjuryType.DEAD]);
    expect(s.rolls()).toContain("Casualty Roll (Human Lineman #1): 16");
  });
});

describe("BB-M10: a Beach Bowl Secret Weapon plays one drive", () => {
  it("misses the rest of the match with no roll", async () => {
    const s = await endDrive("beach-bowl", []);
    expect(s.player(1).status).toBe(PlayerStatus.REMOVED);
    expect(s.rolls()).toEqual([]);
  });
});

describe("Sevens Secret Weapons", () => {
  it("are still Sent-off by the referee, with Argue the Call", async () => {
    const s = await endDrive("sevens", [1]);
    expect(s.player(1).status).toBe(PlayerStatus.REMOVED);
    expect(s.rolls()).toEqual(["Argue the Call: 1"]);
  });
});
