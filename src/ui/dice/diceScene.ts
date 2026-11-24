import { throwCoin } from "./coinAnimation";
import { throwDice } from "./diceAnimation";

export type DiceKind = "d6" | "d8" | "d16" | "block";

export { BLOCK_FACES, coinFaceImage } from "./diceFaces";
export { labelling,  } from "./dicePhysics";

export interface DiceTeam {
  key: string;

  race: string;
  initial: string;
  primary: number;
  secondary: number;
}

export interface DiceRoll {
  kind: DiceKind;
  values: number[];
  team: DiceTeam;
}

export interface CoinToss {
  kind: "coin";
  side: 1 | 2;
  faces: [DiceTeam, DiceTeam];
}

let lane: Promise<unknown> = Promise.resolve();

let showing: { stop(): void } | null = null;

export interface DiceThrow {
  landed: Promise<number[]>;

  onPick(listener: (index: number) => void): void;

  mark(index: number | null): void;

  stop(): void;

  hurry(): void;
}

type Control = Pick<DiceThrow, "mark" | "stop" | "hurry">;

export function playRoll(
  host: HTMLElement,
  roll: DiceRoll | CoinToss,
  opts: { sound: boolean; close?: boolean }
): DiceThrow {
  const pickers: ((index: number) => void)[] = [];
  let marked: number | null = null;
  let control: Control | null = null;
  let stopped = false;
  let hurried = false;
  const landed = lane.then(() => {
    if (stopped) return roll.kind === "coin" ? [roll.side] : roll.values;
    const hooks = {
      pick: (index: number) => {
        pickers.forEach((listener) => {
          listener(index);
        });
      },
      ready: (c: Control) => {
        control = c;
        showing = c;
        c.mark(marked);
        if (hurried) c.hurry();
      },
    };
    showing?.stop();
    return roll.kind === "coin"
      ? throwCoin({ host, toss: roll, sound: opts.sound, ready: hooks.ready })
      : throwDice({
          host,
          roll,
          sound: opts.sound,
          close: opts.close ?? false,
          ...hooks,
        });
  });
  lane = landed.catch(() => undefined);
  return {
    landed,
    onPick: (listener) => pickers.push(listener),
    mark: (index) => {
      marked = index;
      control?.mark(index);
    },
    stop: () => {
      stopped = true;
      control?.stop();
      if (showing === control) showing = null;
    },
    hurry: () => {
      hurried = true;
      control?.hurry();
    },
  };
}
