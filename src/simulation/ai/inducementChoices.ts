import { type PendingDecision } from "../../headless/protocol";
import { PlayerStatus } from "../../types/Player";
import { type InducementChoiceKind } from "../../types/decisions";
import { type Candidate } from "../candidates";
import { type Board } from "./board";

type InducementChoice = Extract<PendingDecision, { type: "inducement-choice" }>;

type Preference = "hurt" | "hurt-then-anyone" | "planner";

const ANYONE: Preference = "hurt-then-anyone";
const PLANNER: Preference = "planner";

const PREFERENCES: Record<InducementChoiceKind, Preference> = {
  "magic-potion": "hurt",
  "lesser-magic-potion": "hurt",
  "superior-magic-potion": ANYONE,
  souvenir: ANYONE,
  "novice-wizard": ANYONE,
  "iron-man": PLANNER,
  "knuckle-dusters": PLANNER,
  "intensive-training": PLANNER,
  hangover: PLANNER,
  "you-dope": PLANNER,
  "team-captain": PLANNER,
  "sports-wizard": PLANNER,
};

const HURT: readonly PlayerStatus[] = [PlayerStatus.INJURED, PlayerStatus.KO];

function wantedPlayer(board: Board, pending: InducementChoice): string | null {
  const hurt = pending.playerIds.find((id) => {
    const status = board.gs.getPlayerById(id)?.status;
    return status !== undefined && HURT.includes(status);
  });
  if (hurt !== undefined) return hurt;
  return PREFERENCES[pending.kind] === "hurt"
    ? null
    : (pending.playerIds[0] ?? null);
}

export function inducementChoice(
  board: Board,
  pending: PendingDecision,
  candidates: readonly Candidate[]
): number | null {
  if (pending.type !== "inducement-choice") return null;
  if (PREFERENCES[pending.kind] === PLANNER) return null;
  const wanted = wantedPlayer(board, pending);
  const index = candidates.findIndex((candidate) => {
    const [command] = candidate.commands;
    return (
      command.type === "choose-inducement" &&
      (command.playerId ?? null) === wanted
    );
  });
  return index >= 0 ? index : null;
}
