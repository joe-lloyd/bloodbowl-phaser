import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  activateMatchFormat,
  activeMatchFormat,
  activeRules,
  DEATHBOWL_FORMAT,
  SEVENS_FORMAT,
  withMatchFormat,
} from "../../src/game/variants/activeMatch";
import {
  gameTypeRules,
  matchTypeRules,
} from "../../src/game/variants/gameTypeRules";
import { GAME_TYPES } from "../../src/game/variants/gameTypes";
import { GameConfig } from "../../src/config/GameConfig";
import { CLUB_GAME_TYPES } from "../../src/game/rules/club";
import {
  gameTypeSchema,
  matchTypeSchema,
} from "../../src/boundary/schemas/GameType";
import { lobbySettingsSchema } from "../../src/boundary/schemas/LobbySettings";

const ONE_BALL = {
  ballCount: 1,
  rerollsRefillAtHalf: true,
  teamMateThrowUsesPass: false,
  passesMayTargetRivals: true,
  result: "touchdowns",
};

afterEach(() => {
  activateMatchFormat(SEVENS_FORMAT);
});

describe("the Deathbowl rules record", () => {
  it("plays 8 turns a half and sets up 8, 3 on the line, none wide (DB-F1, DB-S1)", () => {
    const rules = matchTypeRules("deathbowl");

    expect(rules.turnsPerHalf).toBe(8);
    expect(rules.setup).toEqual({
      maxOnPitch: 8,
      minOnLineOfScrimmage: 3,
      maxPerWideZone: 0,
    });
    expect(rules.venues).toEqual(["deathbowl"]);
  });

  it("drafts with 700,000, 8 to 11 players, no cap on non-Linemen, and only an Apothecary (DB-D1, DB-D2, DB-D3)", () => {
    expect(matchTypeRules("deathbowl").draft).toEqual({
      budget: 700_000,
      minPlayers: 8,
      maxPlayers: 11,
      maxNonLinemen: Infinity,
      rerollCost: 100_000,
      assistantCoaches: false,
      cheerleaders: false,
      apothecary: true,
      dedicatedFanCostMultiplier: 1,
      dedicatedFansInLeagueOnly: false,
      veteran: true,
    });
  });

  it("carries the format facts later steps read (DB-D2, DB-A1, DB-B2, DB-R1)", () => {
    expect(matchTypeRules("deathbowl").format).toEqual({
      ballCount: 2,
      rerollsRefillAtHalf: false,
      teamMateThrowUsesPass: true,
      passesMayTargetRivals: false,
      result: "points",
    });
  });

  it("keeps Sevens rules where Deathbowl says nothing", () => {
    const rules = matchTypeRules("deathbowl");

    expect({
      rushTarget: rules.rushTarget,
      ballBounces: rules.ballBounces,
      referee: rules.referee,
      injuryTables: rules.injuryTables,
      armour: rules.armour,
      weather: rules.weatherTable("deathbowl"),
    }).toEqual({
      rushTarget: 2,
      ballBounces: 1,
      referee: true,
      injuryTables: { short: "sevens", lasting: "standard" },
      armour: {
        knockedDownOrFallsOver: 0,
        wallPush: 0,
        failedDodgeOrRush: null,
        foul: 0,
      },
      weather: "sevens",
    });
  });
});

describe("the active rules", () => {
  it("answer with the Deathbowl record on the arena instead of throwing", () => {
    activateMatchFormat(DEATHBOWL_FORMAT);

    expect(activeRules()).toBe(matchTypeRules("deathbowl"));
    expect(activeMatchFormat()).toEqual({
      gameType: "deathbowl",
      venue: "deathbowl",
    });
    expect(GameConfig.TURNS_PER_HALF).toBe(8);
  });

  it("refuses the arena for a two-team game type", () => {
    expect(() => {
      activateMatchFormat({ gameType: "sevens", venue: "deathbowl" });
    }).toThrow("deathbowl is not a sevens venue.");
  });

  it("give every two-team format the record it had", () => {
    const answers = GAME_TYPES.flatMap((gameType) =>
      gameTypeRules(gameType).venues.map((venue) =>
        withMatchFormat({ gameType, venue }, () => {
          const rules = activeRules();
          return {
            venue,
            same: rules === gameTypeRules(gameType),
            turnsPerHalf: rules.turnsPerHalf,
            maxOnPitch: rules.setup.maxOnPitch,
            format: rules.format,
          };
        })
      )
    );

    expect(answers).toEqual(
      [
        "stadium",
        "gutter-street",
        "gutter-sewer",
        "street",
        "beach",
      ].map((venue) => ({
        venue,
        same: true,
        turnsPerHalf: 6,
        maxOnPitch: 7,
        format: ONE_BALL,
      }))
    );
  });
});

const SCHEMA_DIR = path.join(__dirname, "../../src/boundary/schemas");

const lobby = (gameType: string) =>
  lobbySettingsSchema.safeParse({
    turnSeconds: 60,
    timeoutBankMs: 0,
    progressionEnabled: false,
    gameType,
  }).success;

describe("Deathbowl stays out of listed game types", () => {
  it("is missing from every game type list, picker and club list", () => {
    expect(GAME_TYPES).toEqual([
      "sevens",
      "gutter-bowl",
      "street-bowl",
      "beach-bowl",
    ]);
    expect(CLUB_GAME_TYPES).not.toContain("deathbowl");
  });

  it("is refused by the schemas for teams, leagues, clubs and lobbies", () => {
    expect(gameTypeSchema.safeParse("deathbowl").success).toBe(false);
    expect([lobby("sevens"), lobby("deathbowl")]).toEqual([true, false]);
    expect(matchTypeSchema.safeParse("deathbowl").success).toBe(true);
  });

  it("is read only by the snapshot schema, which saves share", () => {
    const readers = readdirSync(SCHEMA_DIR).filter((file) =>
      readFileSync(path.join(SCHEMA_DIR, file), "utf8").includes(
        "matchTypeSchema"
      )
    );

    expect(readers).toEqual(["GameSnapshot.ts", "GameType.ts"]);
  });

  it("is missing from the game types the Firestore rules accept", () => {
    const rules = readFileSync(
      path.join(__dirname, "../../firestore.rules"),
      "utf8"
    );
    const listed = [
      ...rules.matchAll(/get\('gameType', 'sevens'\)\s+in \[([^\]]+)\]/g),
    ].map(([, list]) => list);

    expect(listed).toEqual([
      "'sevens', 'gutter-bowl', 'street-bowl', 'beach-bowl'",
    ]);
  });
});
