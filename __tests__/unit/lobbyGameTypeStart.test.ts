import { describe, expect, it, vi } from "vitest";
import { RosterName, type Team, createTeam } from "../../src/types/Team";
import { getRosterByRosterName } from "../../src/data/RosterTemplates";
import { hirePlayer, purchase } from "../../src/game/rules/teamPricing";
import { chooseFirstLinemanAsVeteran } from "../../src/game/rules/veteran";
import type { GameType } from "../../src/game/variants/gameTypes";

const stored: { lobby: unknown } = { lobby: null };
const update = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  runTransaction: vi.fn(
    (_db: unknown, work: (tx: unknown) => Promise<unknown>) =>
      work({
        get: () =>
          Promise.resolve({
            exists: () => stored.lobby !== null,
            data: () => stored.lobby,
          }),
        update,
      })
  ),
}));

vi.mock("../../src/firebase/config", () => ({
  getDb: vi.fn(() => ({})),
}));

import {
  DEFAULT_SETTINGS,
  type LobbyDoc,
  canStart,
  startLobbyMatch,
} from "../../src/firebase/lobby";

const amazon = getRosterByRosterName(RosterName.AMAZON);

function sevensTeam(id: string, withApothecary: boolean): Team {
  const team = createTeam(
    id,
    RosterName.AMAZON,
    { primary: 0, secondary: 0 },
    amazon.rerollCost,
    600_000
  );
  const eagle = amazon.playerTemplates.find(
    (template) => template.positionName === "Eagle Warrior"
  );
  if (!eagle) throw new Error("Amazon has no Eagle Warrior.");
  for (let i = 0; i < 7; i++) hirePlayer(team, eagle);
  chooseFirstLinemanAsVeteran(team);
  if (withApothecary) purchase(team, { type: "apothecary" });
  return team;
}

function readyLobby(gameType: GameType, host: Team, guest: Team): LobbyDoc {
  return {
    code: "ABC123",
    hostUid: "host",
    guestUid: "guest",
    status: "lobby",
    seedCommits: { host: "c1", guest: "c2" },
    seedReveals: { host: "r1", guest: "r2" },
    settings: { ...DEFAULT_SETTINGS, gameType },
    players: {
      host: { uid: "host", displayName: "Host", team: host, ready: true },
      guest: { uid: "guest", displayName: "Guest", team: guest, ready: true },
    },
    createdAt: null,
  };
}

describe("starting a lobby match on a game type", () => {
  it("starts a Sevens match with an Apothecary on either side", () => {
    const lobby = readyLobby(
      "sevens",
      sevensTeam("home", true),
      sevensTeam("away", false)
    );
    expect(canStart(lobby)).toBe(true);
  });

  it("refuses Street Bowl once a ready team's Apothecary makes it illegal", () => {
    const lobby = readyLobby(
      "street-bowl",
      sevensTeam("home", true),
      sevensTeam("away", false)
    );
    expect(canStart(lobby)).toBe(false);
  });

  it("starts Street Bowl when both Sevens teams meet its rules", () => {
    const lobby = readyLobby(
      "street-bowl",
      sevensTeam("home", false),
      sevensTeam("away", false)
    );
    expect(canStart(lobby)).toBe(true);
  });
});

describe("the Start Match button", () => {
  it("starts the lobby as it now stands in Firestore", async () => {
    update.mockClear();
    stored.lobby = readyLobby(
      "street-bowl",
      sevensTeam("home", false),
      sevensTeam("away", false)
    );

    await startLobbyMatch("ABC123");

    expect(update).toHaveBeenCalledWith(
      { path: "games/ABC123" },
      expect.objectContaining({ status: "active" })
    );
  });

  it("refuses when the stored lobby changed to a format a team cannot play", async () => {
    update.mockClear();
    stored.lobby = readyLobby(
      "street-bowl",
      sevensTeam("home", true),
      sevensTeam("away", false)
    );

    await expect(startLobbyMatch("ABC123")).rejects.toThrow(
      "Both coaches need a ready team that meets this game type's rules and the team value range."
    );
    expect(update).not.toHaveBeenCalled();
  });
});
