import type React from "react";
import { GameEventNames } from "../types/events";
import { GamePhase } from "../types/GameState";
import { PlayerStatus } from "../types/Player";
import { setActiveOnlineMatch, type ChatMessage } from "../network/OnlineMatch";
import { type MatchFixture } from "./fixtures";
import { HUDLayout } from "../ui/components/hud/HUDLayout";
import { DiceLog } from "../ui/components/hud/DiceLog";
import { DiceTray } from "../ui/components/hud/DiceTray";
import { HalfTimeCard } from "../ui/components/hud/HalfTimeCard";
import { TurnCatchUpCard } from "../ui/components/hud/TurnCatchUpCard";
import {
  BLOCK_FACES,
  click,
  every,
  fillLog,
  later,
  onlineMatch,
  setScore,
  soon,
} from "./variantHelpers";
import type { Variant } from "./variants";

const CHAT: ChatMessage[] = [
  { text: "Good luck, coach", senderName: "Grimgutz", fromSelf: false, ts: 1 },
  {
    text: "You too. Mind the Blitzer",
    senderName: "Joe",
    fromSelf: true,
    ts: 2,
  },
  { text: "Too late for that", senderName: "Grimgutz", fromSelf: false, ts: 3 },
];

function onlineChat(fx: MatchFixture, history: ChatMessage[]) {
  const listeners = new Set<(message: ChatMessage) => void>();
  setActiveOnlineMatch(
    onlineMatch(fx, {
      chatHistory: () => history,
      onChatMessage: (listener: (message: ChatMessage) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      sendChat: () => {},
    })
  );
  return (text: string) => {
    listeners.forEach((listener) => {
      listener({
        text,
        senderName: "Grimgutz",
        fromSelf: false,
        ts: Date.now(),
      });
    });
  };
}

const diceLogIn = (fx: MatchFixture, above?: React.ReactNode) => (
  <HUDLayout
    bottomLeft={
      <>
        {above}
        <div className="h-[220px] w-full">
          <DiceLog eventBus={fx.bus} />
        </div>
      </>
    }
  />
);

const onlineDiceLog = (fx: MatchFixture) => {
  onlineChat(fx, CHAT);
  return diceLogIn(fx);
};

const fillSoon = (rounds: number) =>
  soon((fx) => {
    fillLog(fx, rounds);
  });

export const DICE_VARIANTS: Variant[] = [
  {
    id: "log-empty",
    section: "Dice log",
    title: "Empty",
    view: (fx) => diceLogIn(fx),
  },
  {
    id: "log-long",
    section: "Dice log",
    title: "A long log (newest on top)",
    view: (fx) => diceLogIn(fx),
    drive: fillSoon(3),
  },
  {
    id: "log-large",
    section: "Dice log",
    title: "Text at 150%",
    prepare: () => {
      localStorage.setItem("bb-dice-log-font-scale", "1.5");
    },
    view: (fx) => diceLogIn(fx),
    drive: fillSoon(1),
  },

  {
    id: "log-online-dice",
    section: "Dice log",
    title: "Online: the Dice tab",
    view: onlineDiceLog,
    drive: fillSoon(1),
  },
  {
    id: "log-online-unread",
    section: "Dice log",
    title: "Online: two unread messages on the Chat tab",
    view: (fx) => {
      const say = onlineChat(fx, CHAT);
      later(60, () => {
        say("Nice dodge");
        say("Shame about the armour");
      });
      return diceLogIn(fx);
    },
    drive: fillSoon(1),
  },
  {
    id: "log-online-chat",
    section: "Dice log",
    title: "Online: the Chat tab",
    view: onlineDiceLog,
    drive: () =>
      later(60, () => {
        click('[data-testid="dice-log"] [role="tab"]', "Chat");
      }),
  },

  {
    id: "catch-up-card",
    section: "Left column cards",
    title: "Online: since your last turn, above the dice log",
    fixture: { scenario: "block-injury-test", phase: GamePhase.PLAY },
    view: (fx) => {
      onlineChat(fx, []);
      return diceLogIn(fx, <TurnCatchUpCard eventBus={fx.bus} />);
    },
    drive: (fx) =>
      later(60, () => {
        const state = fx.services.gameService.getState();
        state.activeTeamId = fx.team2.id;
        const hurt = fx.player(1, 0);
        hurt.status = PlayerStatus.STUNNED;
        fx.bus.emit(GameEventNames.PlayerKnockedDown, { playerId: hurt.id });
        fx.bus.emit(GameEventNames.BallScattered, {
          from: { x: 10, y: 4 },
          to: { x: 11, y: 4 },
          reason: "bounce",
        });
        fx.bus.emit(GameEventNames.TurnStarted, {
          teamId: fx.team1.id,
          turnNumber: 4,
        });
      }),
  },
  {
    id: "half-time-card",
    section: "Left column cards",
    title: "Half time, with KO recovery rolls in",
    fixture: { scenario: "block-injury-test" },
    view: (fx) => diceLogIn(fx, <HalfTimeCard eventBus={fx.bus} />),
    drive: (fx) =>
      later(60, () => {
        setScore(fx, 1, 0);
        fx.player(2, 0).status = PlayerStatus.KO;
        fx.bus.emit(GameEventNames.DriveEnded, {
          reason: "halftime",
          nextKickingTeamId: fx.team2.id,
        });
        fx.bus.emit(GameEventNames.KORecoveryRolled, {
          playerId: fx.player(2, 0).id,
          roll: 5,
          recovered: true,
        });
      }),
  },

  {
    id: "tray-d6",
    section: "Dice tray",
    title: "A D6 roll (live 3D dice, needs WebGL)",
    view: (fx) => <DiceTray eventBus={fx.bus} />,
    drive: (fx) =>
      every(4000, () => {
        fx.bus.emit(GameEventNames.DiceRoll, {
          rollType: "Dodge (Blitzer)",
          diceType: "1d6",
          value: 5,
          total: 5,
          description: "Dodge (Blitzer): 5, needs 3+",
          resultState: "success",
          teamId: fx.team1.id,
        });
      }),
  },
  {
    id: "tray-block",
    section: "Dice tray",
    title: "Two block dice held for a choice",
    view: (fx) => <DiceTray eventBus={fx.bus} />,
    drive: (fx) =>
      later(60, () => {
        fx.bus.emit(GameEventNames.BlockDiceRolled, {
          attackerId: fx.player(2, 0).id,
          defenderId: fx.player(1, 0).id,
          numDice: 2,
          isAttackerChoice: true,
          results: [BLOCK_FACES.push, BLOCK_FACES.dodge],
        });
      }),
  },
];
