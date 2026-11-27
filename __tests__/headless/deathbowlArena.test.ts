import { describe, expect, it } from "vitest";
import {
  createHeadlessGame,
  stabilizeIds,
} from "../../src/headless/createHeadlessGame";
import { GameService } from "../../src/services/GameService";
import { arenaTeam } from "../../src/scenes/sandboxTeam";
import { RosterName } from "../../src/types/Team";
import {
  activeLayout,
  DEATHBOWL_FORMAT,
} from "../../src/game/variants/activeMatch";
import { seatFormation, setUpSeats } from "../../src/game/setup/deployment";
import { playerBoxOf } from "../../src/game/rules/playerLocation";
import { SetupValidator } from "../../src/game/validators/SetupValidator";
import {
  inSetupSection,
  onScrimmage,
  wideZoneOf,
} from "../../src/game/rules/frames";

const ROSTERS = [
  RosterName.HUMAN,
  RosterName.ORC,
  RosterName.SKAVEN,
  RosterName.DWARF,
];

function arenaMatch() {
  const teams = ROSTERS.map((roster, index) =>
    stabilizeIds(
      arenaTeam(roster, roster, 0xcc0000),
      `seat${String(index)}`
    )
  );
  const initialState = {
    ...GameService.createInitialState({ teams }),
    venue: DEATHBOWL_FORMAT.venue,
  };
  return createHeadlessGame({ teams, initialState }).gameService;
}

const square = ({ x, y }: { x: number; y: number }) =>
  `${String(x)},${String(y)}`;

describe("the Deathbowl arena with four teams set up (DB-S1)", () => {
  it("builds a four-seat match on the arena", () => {
    const game = arenaMatch();
    const seating = game.getSeating();

    expect(activeLayout().venue).toBe("deathbowl");
    expect(seating.kind).toBe("four");
    expect(seating.seats.map(({ team }) => team.rosterName)).toEqual(ROSTERS);
  });

  it("sets North up in its own arm, three on its Line of Scrimmage", () => {
    const [north] = arenaMatch().getSeating().seats;

    expect(
      new Set(seatFormation(north, activeLayout()).map((p) => square(p)))
    ).toEqual(
      new Set([
        "9,6",
        "10,6",
        "11,6",
        "10,5",
        "7,4",
        "13,4",
        "9,2",
        "11,2",
      ])
    );
  });

  it("fields eight per seat, every formation legal under the Deathbowl numbers", () => {
    const seats = arenaMatch().getSeating().seats;
    const validator = new SetupValidator();

    const checks = seats.map((seat) => {
      const positions = seatFormation(seat, activeLayout());
      const result = validator.validateFrameFormation({
        positions,
        frame: seat.frame,
        availablePlayerCount: seat.team.players.length,
      });
      return {
        placed: positions.length,
        onLine: positions.filter((p) => onScrimmage(seat.frame, p)).length,
        inWideZone: positions.filter((p) => wideZoneOf(seat.frame, p) !== null)
          .length,
        inOwnSection: positions.every((p) => inSetupSection(seat.frame, p)),
        valid: result.valid,
        broken: result.restrictions
          .filter((rule) => !rule.satisfied)
          .map((rule) => rule.id),
      };
    });

    expect(checks).toEqual(
      seats.map(() => ({
        placed: 8,
        onLine: 3,
        inWideZone: 0,
        inOwnSection: true,
        valid: true,
        broken: [],
      }))
    );
  });

  it("refuses a ninth player and a player in a Wide Zone", () => {
    const [north] = arenaMatch().getSeating().seats;
    const positions = seatFormation(north, activeLayout());
    const validator = new SetupValidator();
    const broken = (extra: { x: number; y: number }) =>
      validator
        .validateFrameFormation({
          positions: [...positions, { playerId: "extra", ...extra }],
          frame: north.frame,
          availablePlayerCount: 11,
        })
        .restrictions.filter((rule) => !rule.satisfied)
        .map((rule) => rule.id);

    expect(broken({ x: 10, y: 0 })).toEqual(["max-seven", "required-player-count"]);
    expect(broken({ x: 5, y: 3 })).toEqual(
      expect.arrayContaining(["setup-area", "wide-zone-limit"])
    );
  });

  it("puts the four teams on the pitch with nobody sharing a square", () => {
    const game = arenaMatch();
    setUpSeats(game.getSeating(), activeLayout());

    const placed = game
      .getTeams()
      .flatMap((team) => team.players)
      .flatMap((player) => (player.gridPosition ? [player.gridPosition] : []));

    expect(game.getTeams().map((team) => team.players.length)).toEqual([
      10, 10, 10, 10,
    ]);
    expect(placed).toHaveLength(32);
    expect(
      game.getTeams().map((team) =>
        team.players.map((player) => playerBoxOf(player))
      )
    ).toEqual(
      game.getTeams().map(() => [
        ...Array.from({ length: 8 }, () => "pitch"),
        "reserves",
        "reserves",
      ])
    );
    expect(new Set(placed.map((p) => square(p))).size).toBe(32);
  });
});
