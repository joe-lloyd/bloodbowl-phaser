/**
 * Gallery variants for the online turn clock, connection banners and the
 * waiting states.
 */
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { ConnectionBanner } from "../ui/pages/ConnectionBanner";
import type { AuthUser } from "../firebase/auth";
import { MatchStrip } from "../ui/components/hud/MatchStrip";
import { ScoreBoard } from "../ui/components/hud/ScoreBoard";
import { TurnIndicator } from "../ui/components/hud/TurnIndicator";
import { WaitingBanner } from "../ui/pages/WaitingBanner";
import { RefusalNotice } from "../ui/components/hud/RefusalNotice";
import { TurnClock } from "../ui/pages/TurnClock";
import { later, lobby, onlineMatch, score } from "./variantHelpers";
import type { Variant } from "./variants";

const USER = {
  uid: "me",
  displayName: "Joe",
  email: null,
  photoURL: null,
} satisfies AuthUser;

export const ONLINE_VARIANTS: Variant[] = [
  // ---- Turn clock
  {
    id: "clock-running",
    section: "Online turn clock",
    title: "Running, with a timeout to spend",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <TurnClock
          code="BLOOD"
          lobby={lobby(fx, {})}
          match={onlineMatch(fx, {
            myTeamId: fx.services.gameService.getActiveTeamId(),
          })}
          eventBus={fx.bus}
          user={USER}
        />
      </>
    ),
  },
  {
    id: "connection-offline",
    section: "Online turn clock",
    title: "This coach is offline",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner opponentName="Grimgutz" connection="offline" />
      </>
    ),
  },
  {
    id: "connection-slow",
    section: "Online turn clock",
    title: "Messages are late, but still get through",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner opponentName="Grimgutz" connection="slow" />
      </>
    ),
  },
  {
    id: "connection-reconnecting",
    section: "Online turn clock",
    title: "The other coach dropped, a long name",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner
          opponentName="Grimgutz the Unwashed"
          connection="reconnecting"
        />
      </>
    ),
  },
  {
    id: "connection-abandonable",
    section: "Online turn clock",
    title: "The other coach has been gone long enough to end the match",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <ConnectionBanner opponentName="Grimgutz" connection="abandonable" />
      </>
    ),
  },
  {
    id: "waiting-banner",
    section: "Online turn clock",
    title: "Waiting on the other coach's decision",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <WaitingBanner
          match={{
            mayAct: () => false,
            waitingLabel: () =>
              "Grimgutz is choosing a block die (Gouged Eye Blitzer)…",
          }}
          eventBus={fx.bus}
        />
      </>
    ),
  },
  {
    id: "refusal-notice",
    section: "Online turn clock",
    title: "A click that landed after the turn ended",
    height: 320,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => (
      <>
        {score(fx)}
        <RefusalNotice eventBus={fx.bus} />
      </>
    ),
    drive: (fx) =>
      later(60, () =>
        fx.bus.emit(GameEventNames.NetworkCommandRejected, {
          commandType: "move",
          reason: "not-your-turn",
        })
      ),
  },
  {
    id: "clock-low",
    section: "Online turn clock",
    title: "Under fifteen seconds",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.deadline = Date.now() + 11_000;
      return (
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
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx)}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },
  {
    id: "clock-deciding",
    section: "Online turn clock",
    title: "Stopped while the other coach decides",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const active = fx.services.gameService.getActiveTeamId();
      const other = active === fx.team1.id ? fx.team2.id : fx.team1.id;
      return (
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
          <TurnClock
            code="BLOOD"
            lobby={lobby(fx, {})}
            match={onlineMatch(fx, {
              decidingTeamId: () => other,
              pendingDecision: () => ({ type: "block-dice" }),
            })}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },
  {
    id: "clock-paused",
    section: "Online turn clock",
    title: "Paused by you",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.pausedBy = "me";
      l.timer!.pausedAt = Date.now() - 5_000;
      return (
        <>
          {score(fx)}
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx)}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
  },

  {
    id: "clock-strip-crowded",
    section: "Online turn clock",
    title: "Blizzard, a full timeout bank and the last fifteen seconds",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.deadline = Date.now() + 15_000;
      l.timer!.banks = { me: 300_000 };
      return (
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
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx, {
              myTeamId: fx.services.gameService.getActiveTeamId(),
            })}
            eventBus={fx.bus}
            user={USER}
          />
        </>
      );
    },
    drive: (fx) =>
      later(30, () => {
        const state = fx.services.gameService.getState();
        state.weather = "Blizzard";
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },
  {
    id: "clock-strip-away",
    section: "Online turn clock",
    title: "Stopped while the other coach reconnects",
    height: 220,
    fixture: { scenario: "basic-scrimmage" },
    view: (fx) => {
      const l = lobby(fx, {});
      l.timer!.banks = { me: 300_000 };
      return (
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
          <TurnClock
            code="BLOOD"
            lobby={l}
            match={onlineMatch(fx, { opponentName: "Grimgutz the Unwashed" })}
            eventBus={fx.bus}
            user={USER}
            opponentAway
          />
        </>
      );
    },
    drive: (fx) =>
      later(30, () => {
        const state = fx.services.gameService.getState();
        state.weather = "Pouring Rain";
        fx.bus.emit(GameEventNames.GameStateRestored, state);
      }),
  },
];
