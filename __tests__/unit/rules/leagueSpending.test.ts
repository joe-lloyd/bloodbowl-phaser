/**
 * Spending the Treasury between league fixtures (openspec/specs/
 * league-treasury): players at their Hiring Fee, re-rolls at the Sevens
 * price, refused beyond the Treasury or the roster limits.
 */
import { describe, expect, it } from "vitest";
import { getRosterByRosterName } from "../../../src/data/RosterTemplates";
import { createPlayer, PlayerTemplate } from "../../../src/types/Player";
import { RosterName, Team, createTeam } from "../../../src/types/Team";
import {
  draftListPlayers,
  hirePlayer,
  priceOf,
  purchase,
} from "../../../src/game/rules/teamPricing";
import { stampFirstCompletedMatch } from "../../../src/game/rules/teamLifecycle";
import { canEdit } from "../../../src/game/rules/teamEditLegality";
import { Inducement } from "../../../src/types/Inducements";

const human = getRosterByRosterName(RosterName.HUMAN);
const position = (name: string): PlayerTemplate =>
  human.playerTemplates.find((template) => template.positionName === name)!;

/** A Human league team that has played, holding these positions. */
function leagueTeam(treasury: number, positions: string[]): Team {
  const team = createTeam(
    "League",
    RosterName.HUMAN,
    { primary: 0, secondary: 0 },
    50_000,
    treasury,
    "sevens-skill-selection"
  );
  team.players = positions.map((name, index) =>
    createPlayer(position(name), team.id, index + 1)
  );
  stampFirstCompletedMatch(team, 1);
  return team;
}

const LINEMEN = (count: number) => Array(count).fill("Human Lineman");

describe("between league fixtures", () => {
  it("hires a Blitzer for its 85,000 Hiring Fee", () => {
    const team = leagueTeam(200_000, LINEMEN(6));
    const hired = hirePlayer(team, position("Human Blitzer"));
    expect(hired.amount).toBe(85_000);
    expect(team.treasury).toBe(115_000);
    expect(draftListPlayers(team)).toHaveLength(7);
    expect(team.players.at(-1)).toMatchObject({
      positionName: "Human Blitzer",
      number: 7,
      cost: 85_000,
    });
  });

  it("buys a re-roll for 100,000, the Sevens price, not double", () => {
    const team = leagueTeam(250_000, LINEMEN(7));
    expect(priceOf(team, { type: "reroll" })).toEqual({ amount: 100_000 });
    expect(purchase(team, { type: "reroll" })).toEqual({ amount: 100_000 });
    expect(team.rerolls).toBe(1);
    expect(team.treasury).toBe(150_000);
  });

  it("refuses a player the Treasury cannot pay, and changes nothing", () => {
    const team = leagueTeam(80_000, LINEMEN(6));
    const hired = hirePlayer(team, position("Human Blitzer"));
    expect(hired).toEqual({
      amount: null,
      reason: "Not enough gold in the treasury.",
    });
    expect(team.treasury).toBe(80_000);
    expect(team.players).toHaveLength(6);
  });

  it("refuses a re-roll the Treasury cannot pay", () => {
    const team = leagueTeam(95_000, LINEMEN(7));
    expect(purchase(team, { type: "reroll" })).toEqual({
      amount: null,
      reason: "Not enough gold in the treasury.",
    });
    expect(team.treasury).toBe(95_000);
    expect(team.rerolls).toBe(0);
  });

  it("refuses a 12th permanently hired player", () => {
    const team = leagueTeam(500_000, LINEMEN(11));
    const hired = hirePlayer(team, position("Human Lineman"));
    expect(hired).toEqual({
      amount: null,
      reason: "A Sevens team may have at most 11 permanently hired players.",
    });
    expect(team.treasury).toBe(500_000);
    expect(team.players).toHaveLength(11);
  });

  it("refuses a position over its QTY", () => {
    const team = leagueTeam(500_000, [
      ...LINEMEN(5),
      "Human Blitzer",
      "Human Blitzer",
    ]);
    expect(hirePlayer(team, position("Human Blitzer"))).toEqual({
      amount: null,
      reason: "A Human team may have at most 2 Human Blitzer.",
    });
    expect(team.treasury).toBe(500_000);
  });

  it("refuses a fifth player without the Lineman keyword (D3)", () => {
    const team = leagueTeam(500_000, [
      ...LINEMEN(3),
      "Human Blitzer",
      "Human Blitzer",
      "Human Thrower",
      "Human Catcher",
    ]);
    expect(hirePlayer(team, position("Human Catcher"))).toEqual({
      amount: null,
      reason:
        "A Sevens team may have at most 4 players without the Lineman keyword.",
    });
    // A Lineman still fits
    expect(hirePlayer(team, position("Human Lineman")).amount).toBe(50_000);
    expect(team.treasury).toBe(450_000);
  });

  it("does not count a dead player or a Journeyman waiting on an offer", () => {
    const team = leagueTeam(500_000, LINEMEN(11));
    team.players[0].injuries.push("Dead" as never);
    const journeyman = team.players[1];
    journeyman.playerKind = "journeyman";
    team.pendingDevelopment = [
      {
        id: "journeyman-m-1",
        kind: "journeyman-offer",
        playerId: journeyman.id,
        matchId: "m",
        createdAt: 1,
      },
    ];
    expect(draftListPlayers(team)).toHaveLength(9);
    expect(hirePlayer(team, position("Human Lineman")).amount).toBe(50_000);
  });

  it("still refuses firing a player after a game (Sevens)", () => {
    const team = leagueTeam(100_000, LINEMEN(7));
    expect(canEdit(team, { type: "fire-player" })).toEqual({
      allowed: false,
      reason: "Sevens teams cannot fire players after a game.",
    });
  });
});

describe("draft-only allowances", () => {
  it("a draft list may still hold a third Blitzer while it is built", () => {
    const team = leagueTeam(500_000, [
      ...LINEMEN(5),
      "Human Blitzer",
      "Human Blitzer",
    ]);
    delete team.firstMatchPlayedAt;
    expect(hirePlayer(team, position("Human Blitzer")).amount).toBe(85_000);
  });

  it("a Matched Play team buys inducements at the draft only", () => {
    const team = leagueTeam(500_000, LINEMEN(7));
    team.advancementMode = "matched-play";
    expect(
      priceOf(team, { type: "inducement", inducement: Inducement.BRIBE })
    ).toEqual({
      amount: null,
      reason: "Inducements go on the draft list only at the draft.",
    });
    delete team.firstMatchPlayedAt;
    expect(
      priceOf(team, { type: "inducement", inducement: Inducement.BRIBE }).amount
    ).toBe(100_000);
  });
});
