import type { CasualtyGrade } from "../game/rules/injuryTables";
import type { PlayerStats } from "./Player";

export type RerollSource = "skill" | "team" | "pro" | "veteran";

export type RerollableRollKind =
  | "dodge"
  | "pickup"
  | "catch"
  | "pass"
  | "rush"
  | "barricade"
  | "jump"
  | "activation"
  | "gaze"
  | "steady-footing";

export interface RerollDecisionRequest {
  type: "reroll";
  playerId: string;

  chooserTeamId: string;
  rollKind: RerollableRollKind;

  rollName?: string;

  sources: RerollSource[];

  skill?: string;

  roll: number;

  needed?: number;
}

export interface RerollDecisionAnswer {
  accept: boolean;

  source?: RerollSource;
}

export interface ReactionDecisionRequest {
  type: "reaction";

  playerId: string;
  chooserTeamId: string;
  skill: string;

  prompt: string;
  opponentId?: string;
}

export interface ReactionDecisionAnswer {
  accept: boolean;
}

export interface BiteTargetDecisionRequest {
  type: "bite-target";

  playerId: string;
  chooserTeamId: string;

  targetIds: string[];
  purpose?: "squig-knock-down" | "squig-block";
}

export function canChooseBiteTarget(
  request: BiteTargetDecisionRequest,
  targetId: string | undefined
): boolean {
  return targetId === undefined
    ? request.purpose !== "squig-block"
    : request.targetIds.includes(targetId);
}

export interface BiteTargetDecisionAnswer {
  targetId?: string;
}

interface InterceptionCandidate {
  playerId: string;

  playerName?: string;

  modifier: number;
}

export interface InterceptionDecisionRequest {
  type: "interception";
  chooserTeamId: string;

  passerId: string;
  candidates: InterceptionCandidate[];
}

export interface InterceptionDecisionAnswer {
  playerId?: string;
}

export type ApothecaryLocation = "pitch" | "crowd";

export type ApothecaryCasualtyType = "badly-hurt" | "seriously-hurt" | "dead";

export type ApothecaryResultKind = "ko" | "casualty";

export interface ApothecaryCasualtyRoll {
  grade: CasualtyGrade;
  lasting?: keyof PlayerStats;
}

export interface ApothecaryDecisionRequest {
  type: "apothecary";
  id: string;

  chooserTeamId: string;
  playerId: string;
  resultKind: ApothecaryResultKind;

  location?: ApothecaryLocation;

  position?: { x: number; y: number };

  casualtyType?: ApothecaryCasualtyType;

  casualtyRoll?: ApothecaryCasualtyRoll;

  killerId?: string;

  armsPlagueRidden?: boolean;
}

export interface ApothecaryDecisionAnswer {
  accept: boolean;
}

export type InducementChoiceKind =
  | "iron-man"
  | "knuckle-dusters"
  | "intensive-training"
  | "hangover"
  | "you-dope"
  | "team-captain"
  | "sports-wizard"
  | "magic-potion"
  | "lesser-magic-potion"
  | "superior-magic-potion"
  | "souvenir"
  | "novice-wizard";

export type WizardSpell = "fireball" | "zap";

export type DopeStat = "ST" | "AG";

export interface InducementChoiceDecisionRequest {
  type: "inducement-choice";
  kind: InducementChoiceKind;
  chooserTeamId: string;

  playerIds: string[];

  skills?: string[];

  stats?: DopeStat[];

  spells?: WizardSpell[];

  item?: string;

  optional: boolean;
}

export interface InducementChoiceDecisionAnswer {
  playerId?: string;
  skill?: string;
  stat?: DopeStat;

  spell?: WizardSpell;

  square?: { x: number; y: number };
}

export interface FoulAssistsDecisionRequest {
  type: "foul-assists";

  playerId: string;
  targetId: string;
  chooserTeamId: string;

  available: number;

  defensive: number;
}

export interface FoulAssistsDecisionAnswer {
  count: number;
}

export interface ReserveMoveDecisionRequest {
  type: "reserve-move";
  chooserTeamId: string;
  playerIds: string[];
  squares: { x: number; y: number }[];
}

export interface ReserveMoveDecisionAnswer {
  move: { playerId: string; square: { x: number; y: number } } | null;
}

export type AssistSide = "attacker" | "defender";

export interface CrossAssistOffer {
  playerId: string;
  sides: AssistSide[];
}

export interface CrossAssistDecisionRequest {
  type: "cross-assist";
  chooserTeamId: string;
  attackerId: string;
  defenderId: string;
  action: "block" | "foul";
  offers: CrossAssistOffer[];
}

export interface CrossAssistDecisionAnswer {
  pledges: { playerId: string; side: AssistSide }[];
}

export type DecisionRequest =
  | RerollDecisionRequest
  | ReactionDecisionRequest
  | BiteTargetDecisionRequest
  | InterceptionDecisionRequest
  | ApothecaryDecisionRequest
  | InducementChoiceDecisionRequest
  | FoulAssistsDecisionRequest
  | ReserveMoveDecisionRequest
  | CrossAssistDecisionRequest;
export type DecisionAnswer =
  | RerollDecisionAnswer
  | ReactionDecisionAnswer
  | BiteTargetDecisionAnswer
  | InterceptionDecisionAnswer
  | ApothecaryDecisionAnswer
  | InducementChoiceDecisionAnswer
  | FoulAssistsDecisionAnswer
  | ReserveMoveDecisionAnswer
  | CrossAssistDecisionAnswer;
