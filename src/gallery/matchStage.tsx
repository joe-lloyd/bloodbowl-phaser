import type { ComponentProps } from "react";
import { GameEventNames } from "../types/events";
import { GamePhase, SubPhase } from "../types/GameState";
import { GameHUD } from "../ui/components/hud/GameHUD";
import type { OnlineMatch } from "../network/OnlineMatch";
import { setActiveOnlineMatch } from "../network/OnlineMatch";
import { GalleryRoutes } from "./GalleryRoutes";
import type { MatchFixture } from "./fixtures";
import { onlineMatch, soon } from "./variantHelpers";
import { type Group, type Row, rows, type Variant } from "./variant";

export type Opener = (fx: MatchFixture) => void;

export const SCRIMMAGE = { scenario: "basic-scrimmage" };
export const BLOCK_SCENE = { scenario: "block-injury-test" };
export const PASS_SCENE = { scenario: "throw-pickup-and-pass" };
export const SETUP_SCENE = { phase: GamePhase.SETUP };
export const KICKOFF_SCENE = { phase: GamePhase.KICKOFF };

export const hud = (
  fx: MatchFixture,
  props: Omit<ComponentProps<typeof GameHUD>, "eventBus"> = {}
) => (
  <GalleryRoutes path="/match" own={<GameHUD eventBus={fx.bus} {...props} />} />
);

export const onlineHud =
  (overrides: Partial<OnlineMatch> = {}) =>
  (fx: MatchFixture) => {
    setActiveOnlineMatch(onlineMatch(fx, overrides));
    return hud(fx);
  };

export function inPlay(open: Opener) {
  return soon((fx) => {
    fx.bus.emit(GameEventNames.PhaseChanged, {
      phase: GamePhase.PLAY,
      subPhase: SubPhase.TURN_RECEIVING,
    });
    open(fx);
  });
}

export const livePlayer = (fx: MatchFixture, team: 1 | 2, index: number) => {
  const player = fx.player(team, index);
  return fx.services.gameService.getPlayerById(player.id) ?? player;
};

export const select = (fx: MatchFixture, team: 1 | 2, index: number) => {
  fx.bus.emit(GameEventNames.PlayerSelected, {
    player: livePlayer(fx, team, index),
  });
};

export type MatchRow = Row & { open: Opener };

const matchRows = (
  shared: { group: Group; section: string; fixture: Variant["fixture"] },
  list: readonly MatchRow[]
): Variant[] =>
  rows(
    { view: hud, ...shared, fixture: shared.fixture ?? SCRIMMAGE },
    list.map(({ open, ...row }) => ({ ...row, drive: inPlay(open) }))
  );

export const playRows = (
  section: string,
  list: readonly MatchRow[],
  fixture: Variant["fixture"] = SCRIMMAGE
) => matchRows({ group: "In play", section, fixture }, list);

export const diceRows = (section: string, list: readonly MatchRow[]) =>
  matchRows({ group: "Dice", section, fixture: SCRIMMAGE }, list);
