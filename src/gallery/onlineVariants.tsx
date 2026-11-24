import type { ComponentProps, ReactNode } from "react";
import type { AuthUser } from "../firebase/auth";
import type { TimerState } from "../firebase/lobby";
import type { Weather } from "../game/rules/weather";
import { type OnlineMatch, setActiveOnlineMatch } from "../network/OnlineMatch";
import { GameEventNames } from "../types/events";
import { RefusalNotice } from "../ui/components/hud/RefusalNotice";
import { ConnectionBanner } from "../ui/pages/ConnectionBanner";
import { TurnClock } from "../ui/pages/TurnClock";
import { WaitingBanner } from "../ui/pages/WaitingBanner";
import type { MatchFixture } from "./fixtures";
import { hud, inPlay, SCRIMMAGE } from "./matchStage";
import { every, lobby, onlineMatch } from "./variantHelpers";
import { type Row, rows, type Variant } from "./variant";

const USER = {
  uid: "me",
  displayName: "Joe",
  email: null,
  emailVerified: false,
  photoURL: null,
} satisfies AuthUser;

const over = (make: (fx: MatchFixture) => ReactNode) => (fx: MatchFixture) => {
  const extra = make(fx);
  return (
    <>
      {hud(fx)}
      {extra}
    </>
  );
};

interface Clock {
  timer?: Partial<TimerState>;
  match?: Partial<OnlineMatch>;
  opponentAway?: boolean;
}

function clock(fx: MatchFixture, { timer = {}, match, opponentAway }: Clock) {
  const online = onlineMatch(fx, {
    myTeamId: fx.services.gameService.getActiveTeamId(),
    ...match,
  });
  setActiveOnlineMatch(online);
  const base = lobby(fx, {});
  const timed = base.timer
    ? { ...base, timer: { ...base.timer, ...timer } }
    : base;
  return (
    <TurnClock
      code="BLOOD"
      lobby={timed}
      match={online}
      eventBus={fx.bus}
      user={USER}
      {...(opponentAway === undefined ? {} : { opponentAway })}
    />
  );
}

const clocked = (options: Clock) => over((fx) => clock(fx, options));

const weather = (next: Weather) =>
  inPlay((fx) => {
    const state = fx.services.gameService.getState();
    state.weather = next;
    fx.bus.emit(GameEventNames.GameStateRestored, state);
  });

const ready = inPlay(() => undefined);

const waiting = {
  mayAct: () => false,
  waitingLabel: () => "Grimgutz is choosing a block die (Gouged Eye Blitzer)…",
};

const CLOCKS: Row[] = [
  {
    id: "clock-running",
    title: "Running, with a timeout to spend",
    view: clocked({}),
  },
  {
    id: "clock-low",
    title: "Under fifteen seconds",
    view: over((fx) => clock(fx, { timer: { deadline: Date.now() + 11_000 } })),
  },
  {
    id: "clock-deciding",
    title: "Stopped while the other coach decides",
    view: over((fx) => {
      const active = fx.services.gameService.getActiveTeamId();
      const other = active === fx.team1.id ? fx.team2.id : fx.team1.id;
      return clock(fx, {
        match: {
          decidingTeamId: () => other,
          pendingDecision: () => ({
            type: "block-dice",
            attackerId: fx.player(1, 0).id,
            defenderId: fx.player(2, 0).id,
            chooserTeamId: other,
            options: [],
          }),
        },
      });
    }),
  },
  {
    id: "clock-paused",
    title: "Paused by you",
    view: over((fx) =>
      clock(fx, { timer: { pausedBy: "me", pausedAt: Date.now() - 5_000 } })
    ),
  },
  {
    id: "clock-strip-crowded",
    title: "Blizzard, a full timeout bank, the last fifteen seconds",
    view: over((fx) =>
      clock(fx, {
        timer: { deadline: Date.now() + 15_000, banks: { me: 300_000 } },
      })
    ),
    drive: weather("Blizzard"),
  },
  {
    id: "clock-strip-away",
    title: "Stopped while the other coach reconnects",
    view: clocked({
      timer: { banks: { me: 300_000 } },
      match: { opponentName: "Grimgutz the Unwashed" },
      opponentAway: true,
    }),
    drive: weather("Pouring Rain"),
  },
];

const connection = (
  id: string,
  title: string,
  banner: ComponentProps<typeof ConnectionBanner>
): Row => ({ id, title, view: over(() => <ConnectionBanner {...banner} />) });

const BANNERS: Row[] = [
  connection("connection-offline", "You are offline", {
    opponentName: "Grimgutz",
    connection: "offline",
  }),
  connection("connection-slow", "Messages are late", {
    opponentName: "Grimgutz",
    connection: "slow",
  }),
  connection("connection-reconnecting", "The other coach dropped", {
    opponentName: "Grimgutz the Unwashed",
    connection: "reconnecting",
  }),
  connection("connection-abandonable", "Gone long enough to end the match", {
    opponentName: "Grimgutz",
    connection: "abandonable",
  }),
  {
    id: "waiting-banner",
    title: "Waiting on the other coach",
    view: over((fx) => <WaitingBanner match={waiting} eventBus={fx.bus} />),
  },
  {
    id: "waiting-touchdown",
    title: "Waiting banner under a touchdown",
    view: over((fx) => <WaitingBanner match={waiting} eventBus={fx.bus} />),
    drive: (fx) =>
      every(4000, () => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "touchdown",
          headline: "Touchdown!",
          subtitle: "Gouged Eye score. Reikland Reavers 0 - 1 Gouged Eye",
        });
      }),
  },
  {
    id: "refusal-notice",
    title: "A click that landed after the turn ended",
    view: over((fx) => <RefusalNotice eventBus={fx.bus} />),
    drive: (fx) =>
      every(4500, () => {
        fx.bus.emit(GameEventNames.NetworkCommandRejected, {
          commandType: "move",
          reason: "not-your-turn",
        });
      }),
  },
];

const shared = (section: string) =>
  ({
    group: "Online",
    section,
    fixture: SCRIMMAGE,
    view: hud,
    drive: ready,
  }) as const;

export const ONLINE_VARIANTS: Variant[] = [
  ...rows(shared("Turn clock"), CLOCKS),
  ...rows(shared("Connection and waiting banners"), BANNERS),
];
