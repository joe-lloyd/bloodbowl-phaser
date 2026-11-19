import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { ConnectionBanner } from "../ui/pages/ConnectionBanner";
import type { AuthUser } from "../firebase/auth";
import type { TimerState } from "../firebase/lobby";
import type { OnlineMatch } from "../network/OnlineMatch";
import type { Weather } from "../game/rules/weather";
import type { MatchFixture } from "./fixtures";
import { MatchStrip } from "../ui/components/hud/MatchStrip";
import { ScoreBoard } from "../ui/components/hud/ScoreBoard";
import { TurnIndicator } from "../ui/components/hud/TurnIndicator";
import { WaitingBanner } from "../ui/pages/WaitingBanner";
import { RefusalNotice } from "../ui/components/hud/RefusalNotice";
import { TurnClock } from "../ui/pages/TurnClock";
import { later, lobby, onlineMatch, score, soon } from "./variantHelpers";
import type React from "react";
import type { Variant } from "./variants";

const USER = {
  uid: "me",
  displayName: "Joe",
  email: null,
  emailVerified: false,
  photoURL: null,
} satisfies AuthUser;

function clockVariant(
  variant: Pick<Variant, "id" | "title" | "height" | "view" | "drive">
): Variant {
  return {
    section: "Online turn clock",
    fixture: { scenario: "basic-scrimmage" },
    ...variant,
  };
}

const scored = (fx: MatchFixture, node: React.ReactNode) => (
  <>
    {score(fx)}
    {node}
  </>
);

const stripped = (fx: MatchFixture, node: React.ReactNode) => (
  <>
    <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center">
      <ScoreBoard eventBus={fx.bus} />
      <MatchStrip eventBus={fx.bus}>
        <TurnIndicator
          turnNumber={fx.services.gameService.getState().turn.turnNumber}
          phase={GamePhase.PLAY}
        />
      </MatchStrip>
    </div>
    {node}
  </>
);

function clock(
  fx: MatchFixture,
  {
    timer = {},
    match = onlineMatch(fx),
    opponentAway,
  }: {
    timer?: Partial<TimerState>;
    match?: OnlineMatch;
    opponentAway?: boolean;
  }
) {
  const base = lobby(fx, {});
  const timed = base.timer
    ? { ...base, timer: { ...base.timer, ...timer } }
    : base;
  return (
    <TurnClock
      code="BLOOD"
      lobby={timed}
      match={match}
      eventBus={fx.bus}
      user={USER}
      {...(opponentAway === undefined ? {} : { opponentAway })}
    />
  );
}

const activeCoach = (fx: MatchFixture) =>
  onlineMatch(fx, { myTeamId: fx.services.gameService.getActiveTeamId() });

const connection = (
  id: string,
  title: string,
  banner: React.ComponentProps<typeof ConnectionBanner>
) =>
  clockVariant({
    id,
    title,
    height: 320,
    view: (fx) => scored(fx, <ConnectionBanner {...banner} />),
  });

const restoreWeather = (weather: Weather) =>
  soon((fx) => {
    const state = fx.services.gameService.getState();
    state.weather = weather;
    fx.bus.emit(GameEventNames.GameStateRestored, state);
  });

export const ONLINE_VARIANTS: Variant[] = [
  clockVariant({
    id: "clock-running",
    title: "Running, with a timeout to spend",
    height: 220,
    view: (fx) => scored(fx, clock(fx, { match: activeCoach(fx) })),
  }),
  connection("connection-offline", "This coach is offline", {
    opponentName: "Grimgutz",
    connection: "offline",
  }),
  connection("connection-slow", "Messages are late, but still get through", {
    opponentName: "Grimgutz",
    connection: "slow",
  }),
  connection(
    "connection-reconnecting",
    "The other coach dropped, a long name",
    { opponentName: "Grimgutz the Unwashed", connection: "reconnecting" }
  ),
  connection(
    "connection-abandonable",
    "The other coach has been gone long enough to end the match",
    { opponentName: "Grimgutz", connection: "abandonable" }
  ),
  clockVariant({
    id: "waiting-banner",
    title: "Waiting on the other coach's decision",
    height: 320,
    view: (fx) =>
      scored(
        fx,
        <WaitingBanner
          match={{
            mayAct: () => false,
            waitingLabel: () =>
              "Grimgutz is choosing a block die (Gouged Eye Blitzer)…",
          }}
          eventBus={fx.bus}
        />
      ),
  }),
  clockVariant({
    id: "refusal-notice",
    title: "A click that landed after the turn ended",
    height: 320,
    view: (fx) => scored(fx, <RefusalNotice eventBus={fx.bus} />),
    drive: (fx) =>
      later(60, () => {
        fx.bus.emit(GameEventNames.NetworkCommandRejected, {
          commandType: "move",
          reason: "not-your-turn",
        });
      }),
  }),
  clockVariant({
    id: "clock-low",
    title: "Under fifteen seconds",
    height: 220,
    view: (fx) =>
      stripped(fx, clock(fx, { timer: { deadline: Date.now() + 11_000 } })),
  }),
  clockVariant({
    id: "clock-deciding",
    title: "Stopped while the other coach decides",
    height: 220,
    view: (fx) => {
      const active = fx.services.gameService.getActiveTeamId();
      const other = active === fx.team1.id ? fx.team2.id : fx.team1.id;
      const match = onlineMatch(fx, {
        decidingTeamId: () => other,
        pendingDecision: () => ({ type: "block-dice" }),
      });
      return stripped(fx, clock(fx, { match }));
    },
  }),
  clockVariant({
    id: "clock-paused",
    title: "Paused by you",
    height: 220,
    view: (fx) =>
      scored(
        fx,
        clock(fx, {
          timer: { pausedBy: "me", pausedAt: Date.now() - 5_000 },
        })
      ),
  }),

  clockVariant({
    id: "clock-strip-crowded",
    title: "Blizzard, a full timeout bank and the last fifteen seconds",
    height: 220,
    view: (fx) =>
      stripped(
        fx,
        clock(fx, {
          timer: { deadline: Date.now() + 15_000, banks: { me: 300_000 } },
          match: activeCoach(fx),
        })
      ),
    drive: restoreWeather("Blizzard"),
  }),
  clockVariant({
    id: "clock-strip-away",
    title: "Stopped while the other coach reconnects",
    height: 220,
    view: (fx) =>
      stripped(
        fx,
        clock(fx, {
          timer: { banks: { me: 300_000 } },
          match: onlineMatch(fx, { opponentName: "Grimgutz the Unwashed" }),
          opponentAway: true,
        })
      ),
    drive: restoreWeather("Pouring Rain"),
  }),
];
