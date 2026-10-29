import { describe, expect, it } from "vitest";
import { PlayerBuilder } from "../utils/test-builders";
import { InjuryType, PlayerStatus } from "../../src/types/Player";
import {
  summarizeTurn,
  injuryLabel,
  describeBall,
} from "../../src/ui/components/hud/turnSummary";

const player = () =>
  new PlayerBuilder().withTeamId("home").withNumber(4).withName("Ada").build();

describe("turn summaries", () => {
  it("skips quiet turns and changes to the other team's players", () => {
    const p = player();
    expect(summarizeTurn([], "home", [p], null)).toBeNull();
    expect(
      summarizeTurn([{ kind: "player", playerId: p.id }], "away", [p], null)
    ).toBeNull();
  });

  it.each([
    [PlayerStatus.PRONE, "Knocked down"],
    [PlayerStatus.STUNNED, "Stunned"],
    [PlayerStatus.KO, "Knocked out"],
    [PlayerStatus.INJURED, "Casualty"],
    [PlayerStatus.DEAD, "Dead"],
    [PlayerStatus.REMOVED, "Sent off"],
  ])("names a %s player once with their number", (status, label) => {
    const p = { ...player(), status };
    const summary = summarizeTurn(
      [
        { kind: "player", playerId: p.id },
        { kind: "player", playerId: p.id },
      ],
      "home",
      [p],
      null
    );
    expect(summary?.players).toEqual([`${p.playerName} #4: ${label}`]);
  });

  it("includes a ball-only change and resolves its current carrier", () => {
    const p = {
      ...player(),
      status: PlayerStatus.ACTIVE,
      gridPosition: { x: 8, y: 5 },
    };
    expect(
      summarizeTurn([{ kind: "ball" }], "home", [p], p.gridPosition)?.ball
    ).toBe("Ball held by Ada #4");
  });

  it("describes loose balls with pitch locations and coordinates", () => {
    expect(describeBall([], { x: 9, y: 0 })).toBe(
      "Ball loose near the top sideline at 9,0"
    );
    expect(describeBall([], { x: 0, y: 5 })).toBe(
      "Ball loose near the left end zone at 0,5"
    );
    expect(describeBall([], { x: 9, y: 5 })).toBe(
      "Ball loose in midfield at 9,5"
    );
  });

  it("leaves the ball out when it is not on the pitch", () => {
    const p = { ...player(), status: PlayerStatus.PRONE };
    expect(
      summarizeTurn([{ kind: "player", playerId: p.id }], "home", [p], null)
    ).toEqual({ players: ["Ada #4: Knocked down"], ball: null });
  });

  it("distinguishes all Sevens casualty outcomes", () => {
    const p = { ...player(), status: PlayerStatus.INJURED };
    expect(injuryLabel({ ...p, injuries: [InjuryType.BADLY_HURT] })).toBe(
      "Badly hurt"
    );
    expect(injuryLabel({ ...p, injuries: [InjuryType.MISS_NEXT_GAME] })).toBe(
      "Seriously hurt"
    );
    expect(
      injuryLabel({
        ...p,
        status: PlayerStatus.DEAD,
        injuries: [InjuryType.DEAD],
      })
    ).toBe("Dead");
    expect(injuryLabel(player())).toBeNull();
  });
});

it("does not repeat a jersey number already included in the player name", () => {
  const p = { ...player(), playerName: "Ada #4", status: PlayerStatus.PRONE };
  expect(
    summarizeTurn([{ kind: "player", playerId: p.id }], "home", [p], null)
      ?.players
  ).toEqual(["Ada #4: Knocked down"]);
});
