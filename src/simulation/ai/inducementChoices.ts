import { type PendingDecision } from "../../headless/protocol";
import { type Player, PlayerStatus } from "../../types/Player";
import { SkillType, hasSkill } from "../../types/Skills";
import { playerValue } from "../../types/Team";
import { type InducementChoiceKind } from "../../types/decisions";
import { type Souvenir } from "../../game/inducements/variantState";
import { type Candidate } from "../candidates";
import { type Board, carrierOf, standing } from "./board";

type InducementChoice = Extract<PendingDecision, { type: "inducement-choice" }>;

interface Pick {
  playerId: string;
  skill?: string;
}

type Chooser = (board: Board, pending: InducementChoice) => Pick | null;

const TRANSMUTATION = "Transmutation";

const players = (board: Board, pending: InducementChoice): Player[] =>
  pending.playerIds.flatMap((id) => {
    const player = board.gs.getPlayerById(id);
    return player ? [player] : [];
  });

function most(
  candidates: readonly Player[],
  score: (player: Player) => number
): Player | undefined {
  return candidates.reduce<Player | undefined>(
    (best, player) => (!best || score(player) > score(best) ? player : best),
    undefined
  );
}

const pick = (player: Player | undefined): Pick | null =>
  player ? { playerId: player.id } : null;

const HURT_ORDER: readonly PlayerStatus[] = [
  PlayerStatus.INJURED,
  PlayerStatus.KO,
];

function hurtRank(player: Player): number {
  const index = HURT_ORDER.indexOf(player.status);
  return index === -1 ? -1 : HURT_ORDER.length - index;
}

const mostValuable = (player: Player) => playerValue(player) / 1_000_000;

const hurtFirst: Chooser = (board, pending) =>
  pick(
    most(
      players(board, pending).filter((player) => hurtRank(player) > 0),
      (player) => hurtRank(player) + mostValuable(player)
    )
  );

const strongest: Chooser = (board, pending) =>
  pick(
    most(
      players(board, pending),
      (player) => Number(hurtRank(player) > 0) + mostValuable(player)
    )
  );

const agility = (player: Player) => 7 - player.stats.AG;
const has = (player: Player, skill: SkillType) =>
  hasSkill(player.skills, skill);
const handlesBall = (player: Player) =>
  has(player, SkillType.SURE_HANDS) || has(player, SkillType.CATCH);

const SOUVENIR_FIT: Record<Souvenir, (player: Player) => number> = {
  "Sports Sandals": (player) => player.stats.MA,
  "Suntan Lotion": (player) => player.stats.MA + 2 * agility(player),
  Thong: (player) => player.stats.ST + player.stats.AV,
  Sunglasses: (player) => (player.stats.PA > 0 ? 10 - player.stats.PA : -10),
  Bottle: (player) => 10 - player.stats.ST,
  "Puka Shell Necklace": mostValuable,
  "Sticky Bun": (player) =>
    3 * Number(handlesBall(player)) + agility(player) + player.stats.MA / 2,
  Gatorcade: (player) => 2 * player.stats.ST - 10 * Number(handlesBall(player)),
};

function isSouvenir(item: string | undefined): item is Souvenir {
  return item !== undefined && item in SOUVENIR_FIT;
}

const souvenir: Chooser = (board, pending) => {
  const item = pending.item;
  if (!isSouvenir(item)) return strongest(board, pending);
  return pick(most(players(board, pending), SOUVENIR_FIT[item]));
};

const wizard: Chooser = (board, pending) => {
  const carrier = carrierOf(board);
  if (
    !carrier ||
    carrier.teamId === board.us ||
    !standing(carrier) ||
    !pending.playerIds.includes(carrier.id)
  )
    return null;
  return { playerId: carrier.id, skill: TRANSMUTATION };
};

const CHOOSERS: Partial<Record<InducementChoiceKind, Chooser>> = {
  "magic-potion": hurtFirst,
  "lesser-magic-potion": hurtFirst,
  "superior-magic-potion": strongest,
  souvenir,
  "novice-wizard": wizard,
};

const matches = (candidate: Candidate, wanted: Pick | null): boolean => {
  const [command] = candidate.commands;
  if (command.type !== "choose-inducement") return false;
  if (!wanted) return command.playerId === undefined;
  return (
    command.playerId === wanted.playerId &&
    (wanted.skill === undefined || command.skill === wanted.skill)
  );
};

export function inducementChoice(
  board: Board,
  pending: PendingDecision,
  candidates: readonly Candidate[]
): number | null {
  if (pending.type !== "inducement-choice") return null;
  const chooser = CHOOSERS[pending.kind];
  if (!chooser) return null;
  const wanted = chooser(board, pending);
  const index = candidates.findIndex((candidate) => matches(candidate, wanted));
  return index === -1 ? null : index;
}
