import { GameEventNames } from "../types/events";
import type { OnlineMatch } from "../network/OnlineMatch";
import { DEFAULT_SETTINGS, type LobbyDoc } from "../firebase/lobby";
import { type MatchFixture } from "./fixtures";

export const later = (ms: number, fn: () => void) => {
  const t = setTimeout(fn, ms);
  return () => {
    clearTimeout(t);
  };
};

export const soon = (open: (fx: MatchFixture) => void) => (fx: MatchFixture) =>
  later(30, () => {
    open(fx);
  });

export const every = (ms: number, fn: () => void) => {
  fn();
  const t = setInterval(fn, ms);
  return () => {
    clearInterval(t);
  };
};

export const click = (selector: string, text?: string) => {
  const buttons = [...document.querySelectorAll<HTMLElement>(selector)];
  const target = text
    ? buttons.find((b) => b.textContent?.includes(text))
    : buttons[0];
  target?.click();
};

export const GALLERY_FORMATIONS = "gallery";

export const LONG = {
  team1Name: "The Altdorf Sorcerer-Kings of Middenheim",
  team2Name: "Grimgutz's Bone-Crunching Da Bashy Boyz",
};

export function setScore(
  fx: MatchFixture,
  a: number,
  b: number,
  half2 = false
) {
  const state = fx.services.gameService.getState();
  state.score[fx.team1.id] = a;
  state.score[fx.team2.id] = b;
  state.turn.isHalf2 = half2;
}

const LOG_ROWS: [
  string,
  string,
  number | number[] | string[],
  string,
  "success" | "failure" | "none",
  1 | 2,
][] = [
  ["Dodge (Blitzer)", "1d6", 5, "Dodge (Blitzer): 5, needs 3+", "success", 1],
  ["Armour", "2d6", [3, 4], "Armour holds: 7 vs AV 9", "failure", 1],
  [
    "Rush (Thrower)",
    "1d6",
    1,
    "Rush (Thrower): 1, needs 2+. Fell over",
    "failure",
    2,
  ],
  [
    "Pick-up (Catcher)",
    "1d6",
    4,
    "Pick-up (Catcher): 4, needs 2+",
    "success",
    1,
  ],
  [
    "Block",
    "2D Block",
    ["push", "pow-dodge"],
    "Rolled 2 block dice: push, pow-dodge",
    "none",
    2,
  ],
  ["Injury", "2d6", [5, 4], "Injury: 9, Knocked Out", "success", 2],
  [
    "Pass (Thrower)",
    "1d6",
    6,
    "Pass (Thrower): 6, needs 4+. Accurate",
    "success",
    1,
  ],
  [
    "Catch (Catcher)",
    "1d6",
    2,
    "Catch (Catcher): 2, needs 3+. Dropped",
    "failure",
    1,
  ],
];

export function fillLog(fx: MatchFixture, rounds: number) {
  fx.bus.emit(GameEventNames.UI_LogEntry, {
    category: "weather",
    headline: "Nice Weather",
    detail: "Perfect Blood Bowl weather.",
    roll: [3, 4],
  });
  fx.bus.emit(GameEventNames.UI_LogEntry, {
    category: "kickoff",
    headline: "Blitz!",
    detail: "The kicking team takes a free turn of Move actions.",
    roll: [5, 4],
  });
  for (let r = 0; r < rounds; r++) {
    for (const [
      rollType,
      diceType,
      value,
      description,
      resultState,
      team,
    ] of LOG_ROWS) {
      fx.bus.emit(GameEventNames.DiceRoll, {
        rollType,
        diceType,
        value,
        total: Array.isArray(value) ? 0 : value,
        description,
        resultState,
        teamId: team === 1 ? fx.team1.id : fx.team2.id,
      });
    }
    fx.bus.emit(GameEventNames.SkillTriggered, {
      playerId: fx.player(2, 0).id,
      skill: "Mighty Blow",
      effect: "+1 to the Armour roll",
    });
    fx.bus.emit(GameEventNames.UI_Notification, "Select a Kicker first!");
  }
}

const noop = () => undefined;

export function onlineMatch(
  fx: MatchFixture,
  overrides: Record<string, unknown> = {}
) {
  return {
    role: "guest",
    teams: { team1: fx.team1, team2: fx.team2 },
    myTeamId: fx.team1.id,
    opponentName: "Grimgutz",
    mayAct: () => true,
    decidingTeamId: () => null,
    pendingDecision: () => null,
    waitingLabel: () => "Grimgutz's turn (Gouged Eye)…",
    chatHistory: () => [],
    onChatMessage: () => noop,
    onFatalError: () => noop,
    sendChat: () => undefined,
    setClockPaused: () => undefined,
    coachName: () => "Grimgutz",
    run: () => Promise.resolve(),
    ...overrides,
  } as unknown as OnlineMatch;
}

export function lobby(fx: MatchFixture, patch: Partial<LobbyDoc>): LobbyDoc {
  const { turn } = fx.services.gameService.getState();
  return {
    code: "BLOOD",
    hostUid: "them",
    guestUid: "me",
    status: "active",
    settings: DEFAULT_SETTINGS,
    players: {},
    createdAt: null,
    timer: {
      deadline: Date.now() + 94_000,
      turn: `${turn.teamId}:${String(turn.isHalf2 ? 2 : 1)}:${String(turn.turnNumber)}`,
      pausedBy: null,
      pausedAt: null,
      banks: { me: 120_000 },
    },
    ...patch,
  };
}
