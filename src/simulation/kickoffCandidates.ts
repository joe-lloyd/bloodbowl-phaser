import {
  KickoffEvent,
  isPickableKickoffPlayer,
} from "../game/kickoff/kickoffEvents";
import type { KickoffTurn } from "../game/kickoff/kickoffTurn";
import { isStandableSquare } from "../game/rules/pitchSquares";
import type { HeadlessGame } from "../headless/HeadlessGame";
import type { HeadlessCommand, PendingDecision } from "../headless/protocol";
import type { Player } from "../types/Player";
import type { Candidate } from "./candidates";
import { describePlayer, square } from "./stepCandidates";

type KickoffPending = Extract<PendingDecision, { type: "kickoff-event" }>;

function decision(
  label: string,
  ...commands: [HeadlessCommand, ...HeadlessCommand[]]
): Candidate {
  return { kind: "decision", commands, label };
}

function pickable(game: HeadlessGame, pending: KickoffPending): Player[] {
  const gs = game.ctx.gameService;
  const opponents = gs.getOpponents(pending.chooserTeamId);
  return (gs.getTeam(pending.chooserTeamId)?.players ?? []).filter(
    (player) =>
      !pending.selectedPlayerIds.includes(player.id) &&
      isPickableKickoffPlayer(pending.event, player, opponents)
  );
}

const placeLabel = (player: Player) =>
  `Place ${describePlayer(player)} under the ball`;

const placeCommand = (
  playerId: string,
  { x, y }: { x: number; y: number }
): HeadlessCommand => ({ type: "kickoff-place-player", playerId, x, y });

function pickCandidate(pending: KickoffPending, player: Player): Candidate {
  const pick = {
    type: "kickoff-select-player",
    playerId: player.id,
  } as const;
  const landing = pending.landingSquare;
  if (!landing)
    return decision(
      `Pick ${describePlayer(player)} for ${pending.event}`,
      pick
    );
  return decision(
    placeLabel(player),
    pick,
    placeCommand(player.id, landing)
  );
}

function placeCandidates(
  game: HeadlessGame,
  { landingSquare, selectedPlayerIds }: KickoffPending
): Candidate[] {
  if (!landingSquare) return [];
  return selectedPlayerIds.flatMap((id) => {
    const player = game.ctx.gameService.getPlayerById(id);
    return player
      ? [decision(placeLabel(player), placeCommand(id, landingSquare))]
      : [];
  });
}

export function kickoffChoiceCandidates(
  game: HeadlessGame,
  pending: KickoffPending
): Candidate[] {
  const full = pending.selectedPlayerIds.length >= pending.selectionLimit;
  const confirm = decision(`Confirm the ${pending.event} step`, {
    type: "kickoff-confirm",
  });
  return [
    decision(`Skip the ${pending.event} step`, { type: "kickoff-skip" }),
    ...(pending.event === KickoffEvent.HIGH_KICK ? [] : [confirm]),
    ...placeCandidates(game, pending),
    ...(full
      ? []
      : pickable(game, pending).map((player) =>
          pickCandidate(pending, player)
        )),
  ];
}

function oneSquareSteps(game: HeadlessGame, player: Player): Candidate[] {
  const from = player.gridPosition;
  if (!from) return [];
  const { team1, team2 } = game.ctx;
  const taken = [...team1.players, ...team2.players].flatMap(
    ({ gridPosition }) => gridPosition ?? []
  );
  const out: Candidate[] = [];
  for (let x = from.x - 1; x <= from.x + 1; x++)
    for (let y = from.y - 1; y <= from.y + 1; y++) {
      if (!isStandableSquare({ x, y })) continue;
      if (taken.some((at) => at.x === x && at.y === y)) continue;
      out.push({
        kind: "step",
        commands: [{ type: "kickoff-move-player", playerId: player.id, x, y }],
        label: `${describePlayer(player)} steps to ${square({ x, y })}`,
      });
    }
  return out;
}

const isReplacement = ({ commands }: Candidate) => {
  const [first] = commands;
  return first.type === "declare-action" && first.blockReplacement !== undefined;
};

function endOf(turn: KickoffTurn): Candidate {
  return {
    kind: "end-turn",
    commands: [{ type: "end-turn" }],
    label: `End ${turn.event}`,
  };
}

export function kickoffTurnCandidates(
  game: HeadlessGame,
  turn: KickoffTurn,
  plays: readonly Candidate[]
): Candidate[] {
  if (turn.play.kind === "actions")
    return plays
      .filter((candidate) => !isReplacement(candidate))
      .map((candidate) =>
        candidate.kind === "end-turn" ? endOf(turn) : candidate
      );
  const gs = game.ctx.gameService;
  const { activatedPlayerIds } = gs.getState().turn;
  const steps = turn.playerIds
    .filter((id) => !activatedPlayerIds.has(id))
    .flatMap((id) => {
      const player = gs.getPlayerById(id);
      return player ? oneSquareSteps(game, player) : [];
    });
  return [...steps, endOf(turn)];
}
