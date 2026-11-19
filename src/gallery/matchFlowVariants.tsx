import { GameEventNames } from "../types/events";
import { KickoffEvent } from "../game/kickoff/kickoffEvents";
import type { KickoffEventStepState } from "../game/kickoff/KickoffEventManager";
import { type MatchFixture } from "./fixtures";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { KickoffEventOverlay } from "../ui/components/hud/KickoffEventOverlay";
import { MatchOptionsMenu } from "../ui/components/hud/MatchOptionsMenu";
import { computeMatchOptionsMenu } from "../ui/components/hud/computeMatchOptionsMenu";
import { SoundToggle } from "../ui/components/hud/SoundToggle";
import { Announcer } from "../ui/components/hud/Announcer";
import { WaitingBanner } from "../ui/pages/WaitingBanner";
import { TurnoverOverlay } from "../ui/components/hud/TurnoverOverlay";
import { CoinFlipOverlay } from "../ui/components/hud/CoinFlipOverlay";
import { OnlineCoinFlip } from "../ui/pages/OnlineCoinFlip";
import {
  click,
  every,
  later,
  lobby,
  onlineMatch,
  soon,
} from "./variantHelpers";
import type { Variant } from "./variants";

function kickoffStep(fx: MatchFixture, step: Partial<KickoffEventStepState>) {
  const full = {
    event: KickoffEvent.ALERT_DEFENCE,
    teamId: fx.team1.id,
    selectionLimit: 3,
    selectedPlayerIds: [],
    movedPlayerIds: [],
    awaitingPlacement: [],
    ...step,
  };
  fx.services.gameService.getKickoffEventStep = () => full;
}

const startCoinFlip = (fx: MatchFixture) => {
  fx.bus.emit(GameEventNames.UI_StartCoinFlip, {
    team1: fx.team1,
    team2: fx.team2,
  });
};

export const MATCH_FLOW_VARIANTS: Variant[] = [
  {
    id: "kickoff-blitz",
    section: "Kickoff step",
    title: "Alert Defence: choosing players",
    view: (fx) => (
      <HUDLayout topRight={<KickoffEventOverlay eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(20, () => {
        kickoffStep(fx, {
          event: KickoffEvent.ALERT_DEFENCE,
          selectedPlayerIds: [fx.player(1, 0).id],
        });
        fx.bus.emit(GameEventNames.KickoffEventStepStarted, {
          event: KickoffEvent.ALERT_DEFENCE,
          teamId: fx.team1.id,
          selectionLimit: 3,
        });
      }),
  },
  {
    id: "kickoff-highkick",
    section: "Kickoff step",
    title: "High Kick",
    view: (fx) => (
      <HUDLayout topRight={<KickoffEventOverlay eventBus={fx.bus} />} />
    ),
    drive: (fx) =>
      later(20, () => {
        kickoffStep(fx, {
          event: KickoffEvent.HIGH_KICK,
          selectionLimit: 1,
          landingSquare: { x: 15, y: 5 },
        });
        fx.bus.emit(GameEventNames.KickoffEventStepStarted, {
          event: KickoffEvent.HIGH_KICK,
          teamId: fx.team1.id,
          selectionLimit: 1,
        });
      }),
  },

  {
    id: "options-closed",
    section: "Match options",
    title: "Closed",
    height: 120,
    view: () => (
      <HUDLayout
        topRight={
          <MatchOptionsMenu
            entries={computeMatchOptionsMenu({
              kind: "local",
              matchOver: false,
            })}
            onSelect={() => {}}
          />
        }
      />
    ),
  },
  {
    id: "options-open",
    section: "Match options",
    title: "Open, local match, with sound settings",
    view: () => (
      <div className="absolute right-4 top-4">
        <MatchOptionsMenu
          entries={[
            ...computeMatchOptionsMenu({ kind: "local", matchOver: false }),
            {
              type: "panel",
              id: "sound-settings",
              render: () => <SoundToggle />,
            },
          ]}
          onSelect={() => {}}
        />
      </div>
    ),
    drive: () =>
      later(60, () => {
        click('[aria-haspopup="menu"]');
      }),
  },
  {
    id: "options-confirm",
    section: "Match options",
    title: "Online guest, confirming a destructive action",
    view: () => (
      <div className="absolute right-4 top-4">
        <MatchOptionsMenu
          entries={computeMatchOptionsMenu({
            kind: "online",
            role: "guest",
            opponentName: "Grimgutz",
            connection: "abandonable",
            endRequest: "none",
          })}
          onSelect={() => {}}
        />
      </div>
    ),
    drive: () =>
      later(60, () => {
        click('[aria-haspopup="menu"]');
        setTimeout(() => {
          const items = [
            ...document.querySelectorAll<HTMLButtonElement>(
              '[role="menuitem"]:not([disabled])'
            ),
          ];
          const quit =
            items.find((b) => /abandon|end match/i.test(b.textContent ?? "")) ??
            items.at(-1);
          quit?.click();
        }, 120);
      }),
  },

  {
    id: "announce-turn",
    section: "Announcements",
    title: "Turn started (replays every 3s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(3000, () => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Turn 3",
          subtitle: "Reikland Reavers",
        });
      }),
  },
  {
    id: "announce-time-up",
    section: "Announcements",
    title: "Time up, then the next turn (replays every 6s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(6000, () => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "time-up",
          headline: "Time up",
          subtitle: "Reikland Reavers' turn ended",
        });
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "turn-started",
          headline: "Gouged Eye's Turn",
          subtitle: "Turn 3",
        });
      }),
  },
  {
    id: "waiting-touchdown",
    section: "Announcements",
    title: "Touchdown on the waiting coach's screen (replays every 4s)",
    view: (fx) => (
      <>
        <WaitingBanner
          match={{
            mayAct: () => false,
            waitingLabel: () => "Grimgutz's turn (Gouged Eye)…",
          }}
          eventBus={fx.bus}
        />
        <Announcer eventBus={fx.bus} />
      </>
    ),
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
    id: "announce-half",
    section: "Announcements",
    title: "Halftime (replays every 3s)",
    view: (fx) => <Announcer eventBus={fx.bus} />,
    drive: (fx) =>
      every(3000, () => {
        fx.bus.emit(GameEventNames.UI_Announce, {
          kind: "halftime",
          headline: "Halftime",
          subtitle: "Reikland Reavers 1 - 0 Gouged Eye",
        });
      }),
  },
  {
    id: "turnover",
    section: "Announcements",
    title: "Turnover (replays every 3.5s)",
    view: (fx) => <TurnoverOverlay eventBus={fx.bus} />,
    drive: (fx) =>
      every(3500, () => {
        fx.bus.emit(
          "ui:turnover" as never,
          { teamId: fx.team1.id, reason: "Failed Dodge" } as never
        );
      }),
  },

  {
    id: "coin-start",
    section: "Coin toss",
    title: "Local: before the flip",
    view: (fx) => <CoinFlipOverlay eventBus={fx.bus} />,
    drive: soon(startCoinFlip),
  },
  {
    id: "coin-result",
    section: "Coin toss",
    title: "Local: the winner chooses",
    view: (fx) => <CoinFlipOverlay eventBus={fx.bus} />,
    drive: soon((fx) => {
      startCoinFlip(fx);
      setTimeout(() => {
        click("button", "FLIP COIN");
      }, 80);
    }),
  },
  {
    id: "coin-online-wait",
    section: "Coin toss",
    title: "Online: waiting for the other coach",
    view: (fx) => (
      <OnlineCoinFlip
        code="BLOOD"
        lobby={lobby(fx, { coinFlip: { guestReady: true } })}
        match={onlineMatch(fx)}
        eventBus={fx.bus}
      />
    ),
  },
  {
    id: "coin-online-won",
    section: "Coin toss",
    title: "Online: you won the toss",
    view: (fx) => (
      <OnlineCoinFlip
        code="BLOOD"
        lobby={lobby(fx, {
          coinFlip: {
            guestReady: true,
            hostReady: true,
            winnerTeamId: fx.team1.id,
          },
        })}
        match={onlineMatch(fx)}
        eventBus={fx.bus}
      />
    ),
  },
];
