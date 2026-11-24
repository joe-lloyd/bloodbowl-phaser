import { InjuryResult } from "../game/controllers/InjuryController";
import { type ChatMessage, setActiveOnlineMatch } from "../network/OnlineMatch";
import { GameEventNames } from "../types/events";
import type { MatchFixture } from "./fixtures";
import { LogAlone } from "./LogAlone";
import { diceRows, type MatchRow } from "./matchStage";
import {
  BLOCK_FACES,
  click,
  every,
  fillLog,
  later,
  onlineMatch,
  rollBlock,
} from "./variantHelpers";
import type { Variant } from "./variant";

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

function onlineChat(fx: MatchFixture) {
  const listeners = new Set<(message: ChatMessage) => void>();
  setActiveOnlineMatch(
    onlineMatch(fx, {
      chatHistory: () => CHAT,
      onChatMessage: (listener: (message: ChatMessage) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
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

const logView = (fx: MatchFixture) => <LogAlone fx={fx} />;

const chatLog = (fx: MatchFixture) => {
  onlineChat(fx);
  return logView(fx);
};

const filled = (rounds: number) => (fx: MatchFixture) => {
  fillLog(fx, rounds);
};

const LOG_ROWS: MatchRow[] = [
  { id: "log-empty", title: "Empty", view: logView, open: () => undefined },
  { id: "log-long", title: "A long log", view: logView, open: filled(3) },
  {
    id: "log-large",
    title: "Large text",
    prepare: () => {
      localStorage.setItem("bb-dice-log-font-scale", "1.5");
    },
    view: logView,
    open: filled(1),
  },
  {
    id: "log-online-dice",
    title: "Online: the Dice tab",
    view: chatLog,
    open: filled(1),
  },
  {
    id: "log-online-unread",
    title: "Online: unread messages",
    view: (fx) => {
      const say = onlineChat(fx);
      later(400, () => {
        say("Nice dodge");
        say("Shame about the armour");
      });
      return logView(fx);
    },
    open: filled(1),
  },
  {
    id: "log-online-chat",
    title: "Online: the Chat tab",
    view: chatLog,
    open: () => {
      later(60, () => {
        click('[data-testid="dice-log"] [role="tab"]', "Chat");
      });
    },
  },
];

interface Roll {
  rollType: string;
  diceType: string;
  value: number | number[] | string[];
  total: number;
  description: string;
  resultState: "success" | "failure" | "none";
}

const throwDice = (fx: MatchFixture, roll: Roll) => {
  fx.bus.emit(GameEventNames.DiceRoll, { ...roll, teamId: fx.team1.id });
};

const repeat =
  (roll: Roll) =>
  (fx: MatchFixture): void => {
    every(5000, () => {
      throwDice(fx, roll);
    });
  };

const DODGE: Roll = {
  rollType: "Dodge (Blitzer)",
  diceType: "1d6",
  value: 5,
  total: 5,
  description: "Dodge (Blitzer): 5, needs 3+",
  resultState: "success",
};

const TRAY_ROWS: MatchRow[] = [
  { id: "tray-d6", title: "One D6, a success", open: repeat(DODGE) },
  {
    id: "tray-d6-fail",
    title: "One D6, a failure",
    open: repeat({
      ...DODGE,
      value: 1,
      total: 1,
      description: "Dodge (Blitzer): 1, needs 3+",
      resultState: "failure",
    }),
  },
  {
    id: "tray-2d6",
    title: "Two D6",
    open: repeat({
      ...DODGE,
      rollType: "Armour",
      diceType: "2d6",
      value: [3, 4],
      total: 7,
      description: "Armour holds: 7 vs AV 9",
      resultState: "none",
    }),
  },
  {
    id: "tray-d16",
    title: "A D16",
    open: repeat({
      ...DODGE,
      rollType: "Casualty",
      diceType: "1d16",
      value: 11,
      total: 11,
      description: "Casualty: 11, Seriously Hurt",
      resultState: "none",
    }),
  },
  {
    id: "tray-block",
    title: "Two block dice held for a choice",
    open: (fx) => {
      rollBlock(fx, {
        results: [BLOCK_FACES.push, BLOCK_FACES.dodge],
      });
    },
  },
  {
    id: "tray-block-three",
    title: "Three block dice, the defender chooses",
    open: (fx) => {
      rollBlock(fx, {
        isAttackerChoice: false,
        results: [BLOCK_FACES.skull, BLOCK_FACES.bothDown, BLOCK_FACES.pow],
      });
    },
  },
];

const armourRoll = (fx: MatchFixture) => {
  const player = fx.player(1, 0);
  const rollType = `Armour Roll (${player.playerName})`;
  throwDice(fx, {
    ...DODGE,
    rollType,
    diceType: "2d6",
    value: [5, 5],
    total: 10,
    description: "Armour broken: 10 vs AV 9",
  });
  fx.bus.emit(GameEventNames.ArmorRolled, {
    playerId: player.id,
    roll: 10,
    armor: 9,
    broken: true,
    rollType,
  });
};

const injuryRoll = (fx: MatchFixture) => {
  const player = fx.player(1, 0);
  const rollType = `Injury Roll (${player.playerName})`;
  throwDice(fx, {
    ...DODGE,
    rollType,
    diceType: "2d6",
    value: [4, 5],
    total: 9,
    description: "Injury: 9, Knocked Out",
  });
  fx.bus.emit(GameEventNames.InjuryRolled, {
    playerId: player.id,
    result: InjuryResult.KO,
    rollType,
  });
};

const BANNER_ROWS: MatchRow[] = [
  {
    id: "banner-armour",
    title: "Armour roll",
    open: (fx) => {
      every(6000, () => {
        armourRoll(fx);
      });
    },
  },
  {
    id: "banner-injury",
    title: "Injury roll",
    open: (fx) => {
      every(6000, () => {
        injuryRoll(fx);
      });
    },
  },
];

export const DICE_VARIANTS: Variant[] = [
  ...diceRows("Dice tray", TRAY_ROWS),
  ...diceRows("Roll banner", BANNER_ROWS),
  ...diceRows("Dice log", LOG_ROWS),
];
