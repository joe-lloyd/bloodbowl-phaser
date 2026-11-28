import { GameEventNames } from "../types/events";
import { LoadingScreen } from "../ui/components/hud/LoadingScreen";
import { PregameInducements } from "../ui/components/hud/PregameInducements";
import { WEATHER_ROLL } from "../ui/components/hud/weatherThrow";
import { OnlineCoinFlip } from "../ui/pages/OnlineCoinFlip";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import type { LobbyDoc } from "../firebase/lobby";
import type { MatchFixture } from "./fixtures";
import { LiveLobby } from "./LiveLobby";
import { hud, OPENING_SCENE } from "./matchStage";
import { click, later, lobby, onlineMatch, soon } from "./variantHelpers";
import { rows, type Variant } from "./variant";

const startWeather = (fx: MatchFixture) => {
  fx.bus.emit(GameEventNames.UI_StartWeather, {
    team1: fx.team1,
    team2: fx.team2,
  });
};

const rollWeather = (fx: MatchFixture) => {
  fx.services.gameService.getState().weather = "Very Sunny";
  fx.bus.emit(GameEventNames.DiceRoll, {
    rollType: WEATHER_ROLL,
    diceType: "2d6",
    value: [1, 2],
    total: 3,
    description: "Weather: 3, Very Sunny",
    resultState: "none",
    teamId: fx.team1.id,
  });
};

const otherCoachReadies = (fx: MatchFixture) => {
  const answer = ({ teamIds }: { teamIds: string[] }) => {
    if (teamIds.length === 1)
      later(2000, () => {
        fx.services.gameService.readyForWeather(fx.team2.id);
      });
  };
  fx.bus.on(GameEventNames.WeatherReady, answer);
  return () => {
    fx.bus.off(GameEventNames.WeatherReady, answer);
  };
};

const startToss = (fx: MatchFixture) => {
  fx.bus.emit(GameEventNames.UI_StartCoinFlip, {
    team1: fx.team1,
    team2: fx.team2,
  });
};

const pressed = () =>
  soon((fx) => {
    startToss(fx);
    later(120, () => {
      click("button", "FLIP COIN");
    });
  });

const toss =
  (coinFlip: LobbyDoc["coinFlip"], role: "host" | "guest" = "guest") =>
  (fx: MatchFixture) => {
    const match = onlineMatch(fx, { role });
    setActiveOnlineMatch(match);
    return (
      <>
        {hud(fx)}
        <LiveLobby
          lobby={lobby(fx, coinFlip ? { coinFlip } : {})}
          {...(role === "guest" ? { hostTossWinner: fx.team1.id } : {})}
        >
          {(live) => (
            <OnlineCoinFlip
              code={live.code}
              lobby={live}
              match={match}
              eventBus={fx.bus}
            />
          )}
        </LiveLobby>
      </>
    );
  };

const SHARED = {
  group: "Pre-match",
  fixture: OPENING_SCENE,
  view: hud,
} as const;

const LOADING = rows({ ...SHARED, section: "Loading the stadium" }, [
  {
    id: "loading",
    title: "Part way",
    view: (fx) => (
      <LoadingScreen
        eventBus={fx.bus}
        teams={[fx.team1, fx.team2]}
      />
    ),
    drive: soon((fx) => {
      fx.bus.emit(GameEventNames.UI_LoadProgress, { progress: 0.62 });
    }),
  },
]);

function startShopping(fx: MatchFixture): void {
  const { gameService } = fx.services;
  fx.team2.rerolls = 6;
  gameService.getState().pregameInducements = { ready: {} };
  gameService.readyForWeather(fx.team1.id);
  gameService.readyForWeather(fx.team2.id);
}

const INDUCEMENTS = rows({ ...SHARED, section: "Pre-match inducements" }, [
  {
    id: "inducement-panel",
    title: "Shopping",
    view: (fx) => {
      startShopping(fx);
      return (
        <>
          {hud(fx)}
          <PregameInducements eventBus={fx.bus} />
        </>
      );
    },
  },
]);

const WEATHER = rows({ ...SHARED, section: "Weather" }, [
  {
    id: "weather-waiting",
    title: "Before the roll",
    drive: soon(startWeather),
  },
  {
    id: "weather-shown",
    title: "Rolling, then the result",
    drive: soon((fx) => {
      startWeather(fx);
      later(120, () => {
        rollWeather(fx);
      });
    }),
  },
  {
    id: "weather-online",
    title: "Online: ready up",
    view: toss(null),
    drive: otherCoachReadies,
  },
  {
    id: "weather-online-waiting",
    title: "Online: waiting for the other coach",
    view: toss(null),
    drive: soon(() => {
      click("button", "ROLL WEATHER");
    }),
  },
]);

const COIN = rows({ ...SHARED, section: "Coin toss" }, [
  { id: "coin-start", title: "Before the flip", drive: soon(startToss) },
  {
    id: "coin-result",
    title: "Flipping, then the winner chooses",
    drive: pressed(),
  },
  {
    id: "coin-computer",
    title: "Against the computer",
    view: (fx) => {
      setActiveOnlineMatch(onlineMatch(fx, { kind: "computer" }));
      return hud(fx);
    },
    drive: pressed(),
  },
  {
    id: "coin-online-ready",
    title: "Online host: ready up",
    view: toss({ guestReady: true }, "host"),
  },
  {
    id: "coin-online-guest",
    title: "Online guest: ready up",
    view: toss({ hostReady: true }),
  },
  {
    id: "coin-online-wait",
    title: "Online: waiting for the other coach",
    view: toss({ guestReady: true }),
  },
]);

const ONLINE_WINNERS = (["you", "them"] as const).map(
  (winner): Variant => ({
    ...SHARED,
    section: "Coin toss",
    id: winner === "you" ? "coin-online-won" : "coin-online-lost",
    title: winner === "you" ? "Online: you won" : "Online: the other coach won",
    view: (fx) =>
      toss({
        guestReady: true,
        hostReady: true,
        winnerTeamId: winner === "you" ? fx.team1.id : fx.team2.id,
      })(fx),
  })
);

export const PRE_MATCH_VARIANTS: Variant[] = [
  ...LOADING,
  ...INDUCEMENTS,
  ...WEATHER,
  ...COIN,
  ...ONLINE_WINNERS,
];
