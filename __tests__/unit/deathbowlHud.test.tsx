import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { HeadlessGame } from "../../src/headless/HeadlessGame";
import { EventBus, type IEventBus } from "../../src/services/EventBus";
import { ServiceContainer } from "../../src/services/ServiceContainer";
import { GameEventNames } from "../../src/types/events";
import { GamePhase } from "../../src/types/GameState";
import type { Player } from "../../src/types/Player";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { ScoreBoard } from "../../src/ui/components/hud/ScoreBoard";
import { PlayerActionMenu } from "../../src/ui/components/hud/PlayerActionMenu";
import { CrossAssistPrompt } from "../../src/ui/components/hud/CrossAssistPrompt";
import { ReserveMovePrompt } from "../../src/ui/components/hud/ReserveMovePrompt";
import { PlacingsScreen } from "../../src/ui/components/hud/PlacingsScreen";
import { DiceLog } from "../../src/ui/components/hud/DiceLog";
import { placeBall } from "../../src/game/rules/balls";
import { northWithBallsAside, play, stand, stateOf } from "../utils/deathbowlGame";
import { buttonLabel } from "../utils/test-helpers";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  ServiceContainer.reset();
});

const isBrowserBus = (bus: IEventBus): bus is EventBus => bus instanceof EventBus;

function mount(game: HeadlessGame, ui: (bus: EventBus) => ReactNode) {
  const bus = game.ctx.eventBus;
  if (!isBrowserBus(bus)) throw new TypeError("The game needs a browser event bus.");
  ServiceContainer.initialize({
    eventBus: bus,
    teams: game.ctx.teams,
    initialState: stateOf(game),
    gameServiceFactory: () => game.ctx.gameService,
  });
  container = document.createElement("div");
  document.body.append(container);
  const mounted = createRoot(container);
  root = mounted;
  act(() => {
    mounted.render(<MemoryRouter>{ui(bus)}</MemoryRouter>);
  });
  return bus;
}

const text = (testId: string) =>
  container?.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;

const button = (testId: string) =>
  fixtureValue(container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`));

function named(player: Player, name: string): Player {
  player.playerName = name;
  return player;
}

describe("the four-seat scoreboard (DB-R2, DB-S3)", () => {
  it("shows a row per seat in seat order with points, touchdowns and re-rolls", async () => {
    const game = await northWithBallsAside();
    const state = stateOf(game);
    state.points = { seat0: 12, seat1: 3, seat2: 0, seat3: 7 };
    state.score["seat0"] = 1;
    fixtureValue(game.ctx.teams[3]).rerolls = 2;
    mount(game, (bus) => <ScoreBoard eventBus={bus} />);

    const rows = [...fixtureValue(container).querySelectorAll('[data-testid^="seat-row-"]')];
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "seat-row-seat0",
      "seat-row-seat1",
      "seat-row-seat2",
      "seat-row-seat3",
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "▶ Human1210",
      "Orc300",
      "Skaven000",
      "Dwarf702",
    ]);
    expect(fixtureValue(rows[0]).getAttribute("aria-current")).toBe("true");
    expect(text("turn-direction")).toBe("Clockwise ↻");
    expect(text("turn-order")).toBe("Order: Human → Orc → Skaven → Dwarf");
  });

  it("turns the order anticlockwise in the second half and counts new points", async () => {
    const game = await northWithBallsAside();
    const bus = mount(game, (eventBus) => <ScoreBoard eventBus={eventBus} />);

    act(() => {
      stateOf(game).turn.isHalf2 = true;
      stateOf(game).points = { seat0: 0, seat1: 5, seat2: 0, seat3: 0 };
      bus.emit(GameEventNames.PointsAwarded, {
        teamId: "seat1",
        playerId: "any",
        reason: "casualty",
        points: 5,
        total: 5,
      });
    });

    expect(text("turn-direction")).toBe("Anticlockwise ↺");
    expect(text("turn-order")).toBe("Order: Human → Dwarf → Skaven → Orc");
    expect(text("seat-row-seat1")).toBe("Orc500");
  });

  it("packs the rows into chips on a phone", async () => {
    const game = await northWithBallsAside();
    mount(game, (bus) => <ScoreBoard eventBus={bus} compact />);

    expect(text("seat-scoreboard")).toBe(
      "H1↻Human0 pts · 0 TDOrc0 pts · 0 TDSkaven0 pts · 0 TDDwarf0 pts · 0 TD"
    );
  });
});

describe("Blitz against each opposing team (DB-A1, DB-A2)", () => {
  it("lists every rival, marks a spent target and sends the chosen team", async () => {
    const game = await northWithBallsAside();
    const first = stand(game, ["seat0", 0], { at: { x: 13, y: 7 } });
    const second = stand(game, ["seat0", 1], { at: { x: 11, y: 7 } });
    second.stats.MA = 1;
    stand(game, ["seat1", 0], { at: { x: 14, y: 7 } });
    stand(game, ["seat2", 0], { at: { x: 11, y: 9 } });
    await play(game, { type: "declare-action", playerId: first.id, action: "blitz", against: "seat1" });
    await play(game, { type: "end-activation", playerId: first.id });
    const chosen: unknown[] = [];
    const bus = mount(game, (eventBus) => (
      <PlayerActionMenu
        eventBus={eventBus}
        turnData={{ phase: GamePhase.PLAY, activeTeamId: "seat0", spend: stateOf(game).turn.spend }}
      />
    ));
    bus.on(GameEventNames.UI_ActionSelected, (data) => {
      chosen.push(data);
    });

    act(() => {
      bus.emit(GameEventNames.PlayerSelected, { player: second });
    });

    expect(buttonLabel(button("action-blitz-seat1"))).toBe("BLITZ ORCSpent");
    expect(button("action-blitz-seat1").disabled).toBe(true);
    expect(buttonLabel(button("action-blitz-seat2"))).toBe("BLITZ SKAVEN1/Team");
    expect(buttonLabel(button("action-blitz-seat3"))).toBe("BLITZ DWARFOut of reach");
    expect(container?.querySelector('[data-testid="action-blitz"]')).toBeNull();

    act(() => {
      button("action-blitz-seat2").click();
    });
    expect(chosen).toEqual([{ action: "blitz", playerId: second.id, against: "seat2" }]);
  });
});

function menuFor(game: HeadlessGame, player: Player) {
  const bus = mount(game, (eventBus) => (
    <PlayerActionMenu
      eventBus={eventBus}
      turnData={{ phase: GamePhase.PLAY, activeTeamId: "seat0", spend: stateOf(game).turn.spend }}
    />
  ));
  act(() => {
    bus.emit(GameEventNames.PlayerSelected, { player });
  });
}

describe("the second ball in the action menu (DB-A1, DB-B1)", () => {
  it("lets the carrier of the second ball Pass or Hand it off", async () => {
    const game = await northWithBallsAside();
    const carrier = stand(game, ["seat0", 0], { at: { x: 10, y: 8 }, ball: 1 });
    stand(game, ["seat0", 1], { at: { x: 10, y: 9 } });
    placeBall(stateOf(game), 0, { x: 10, y: 20 });
    menuFor(game, carrier);

    expect(button("action-pass").disabled).toBe(false);
    expect(button("action-handoff").disabled).toBe(false);
  });

  it("offers Secure the Ball beside the second ball", async () => {
    const game = await northWithBallsAside();
    const player = stand(game, ["seat0", 0], { at: { x: 13, y: 1 } });
    placeBall(stateOf(game), 0, { x: 10, y: 20 });
    menuFor(game, player);

    expect(button("action-secureBall").disabled).toBe(false);
  });
});

describe("the prompts a human seat answers", () => {
  it("lends a third team's players to the side the coach picks (DB-A4)", async () => {
    const game = await northWithBallsAside();
    const attacker = named(stand(game, ["seat0", 0], { at: { x: 10, y: 8 } }), "Grim");
    const defender = named(stand(game, ["seat1", 0], { at: { x: 10, y: 9 } }), "Bork");
    const west = named(stand(game, ["seat3", 0], { at: { x: 11, y: 10 } }), "Snik");
    mount(game, (bus) => <CrossAssistPrompt eventBus={bus} />);
    let answer: unknown;
    act(() => {
      void game.ctx.gameService
        .getDecisionService()
        .request({
          type: "cross-assist",
          chooserTeamId: "seat3",
          attackerId: attacker.id,
          defenderId: defender.id,
          action: "block",
          offers: [{ playerId: west.id, sides: ["attacker", "defender"] }],
        })
        .then((given) => (answer = given));
    });

    expect(text("cross-assist-prompt")).toBe(
      "DwarfLend an assist?Grim (Human) blocks Bork (Orc). Your players next to them may assist either side.Snik (Dwarf)AttackerDefenderNo assistsLend 0"
    );
    expect(button("cross-assist-lend").disabled).toBe(true);

    act(() => {
      button(`cross-assist-${west.id}-defender`).click();
    });
    act(() => {
      button("cross-assist-lend").click();
    });
    await act(() => Promise.resolve());

    expect(answer).toEqual({ pledges: [{ playerId: west.id, side: "defender" }] });
    expect(text("cross-assist-prompt")).toBeNull();
  });

  it("brings a reserve onto the middle free square, or keeps them all (DB-F4)", async () => {
    const game = await northWithBallsAside();
    const reserve = named(fixtureValue(game.ctx.teams[0].players[9]), "Tom");
    mount(game, (bus) => <ReserveMovePrompt eventBus={bus} />);
    const answers: unknown[] = [];
    const ask = () => {
      act(() => {
        void game.ctx.gameService
          .getDecisionService()
          .request({
            type: "reserve-move",
            chooserTeamId: "seat0",
            playerIds: [reserve.id],
            squares: [{ x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 }],
          })
          .then((given) => {
            answers.push(given);
          });
      });
    };

    ask();
    expect(text("reserve-move-prompt")).toBe(
      "HumanBring on reserves?Someone scored this turn. Each player you bring on stands on your Line of Scrimmage, up to 8 on the pitch.Bring on TomKeep in reserve"
    );
    act(() => {
      button(`reserve-move-${reserve.id}`).click();
    });
    await act(() => Promise.resolve());
    ask();
    act(() => {
      button("reserve-move-done").click();
    });
    await act(() => Promise.resolve());

    expect(answers).toEqual([
      { move: { playerId: reserve.id, square: { x: 8, y: 5 } } },
      { move: null },
    ]);
  });
});

describe("full time", () => {
  it("places teams by points and shows shared places (DB-R2)", async () => {
    const game = await northWithBallsAside();
    const state = stateOf(game);
    state.points = { seat0: 7, seat1: 12, seat2: 7, seat3: 0 };
    state.score["seat1"] = 1;
    mount(game, () => <PlacingsScreen visible />);

    const rows = [...fixtureValue(container).querySelectorAll('[data-testid^="placing-"]')];
    expect(rows.map((row) => row.textContent)).toEqual([
      "1stOrc121",
      "=2ndHuman70",
      "=2ndSkaven70",
      "4thDwarf00",
    ]);
    expect(text("placings")).toContain("An exhibition: no SPP, injuries or results are kept.");
  });

  it("writes each points award into the dice log (DB-R1)", async () => {
    const game = await northWithBallsAside();
    const scorer = named(fixtureValue(game.ctx.teams[1].players[0]), "Bork");
    const bus = mount(game, (eventBus) => <DiceLog eventBus={eventBus} />);

    act(() => {
      bus.emit(GameEventNames.PointsAwarded, {
        teamId: "seat1",
        playerId: scorer.id,
        reason: "casualty",
        points: 5,
        total: 17,
      });
    });
    await act(() => Promise.resolve());

    expect(container?.textContent).toContain("Orc +5 points");
    expect(container?.textContent).toContain("Casualty by Bork. 17 points in all.");
  });
});
