import {
  DRAFT_KEEP_VALUE_INCREASE,
  InjuryType,
  type Player,
  type PlayerAdvancement,
  PlayerStatus,
} from "../../types/Player";
import {
  type DraftRecord,
  type MatchedPlayAllocation,
  type PendingDevelopment,
  type SkillRollCandidate,
  type Team,
  type TeamRoster,
  isPendingRecruit,
} from "../../types/Team";
import { SkillCategory, SkillType, getSkill } from "../../types/Skills";
import { type IRNGService } from "../../services/rng/RNGService";
import {
  ELITE_SKILLS,
  SKILL_ROLL_TABLE,
  advancementCount,
  isSkillLegal,
  rollTakeableSkill,
} from "./progression";

type Rng = Pick<IRNGService, "rollDie">;
type Access = "primary" | "secondary";
type SkillSelectionEntry = Extract<
  PendingDevelopment,
  { kind: "sevens-skill-selection" }
>;
type DraftOfferEntry = Extract<
  PendingDevelopment,
  { kind: "drafted-player-offer" }
>;

function categoriesFor(player: Player, access: Access): SkillCategory[] {
  return (access === "primary" ? player.primary : player.secondary) ?? [];
}

function learnSkill(
  player: Player,
  skill: SkillType,
  record: PlayerAdvancement
): void {
  player.skills.push(getSkill(skill));
  player.advancements ??= [];
  player.advancements.push(record);
  player.level = Math.min(6, player.advancements.length);
  player.teamValue = (player.teamValue ?? 0) + record.valueIncrease;
}

export interface MatchedPlaySkillStatus {
  points: number;
  spent: number;
  remaining: number;
  secondaryCount: number;
  eliteCount: number;
}

const MATCHED_PLAY_COST: Record<Access, number> = { primary: 1, secondary: 2 };

export function matchedPlaySkillStatus(
  team: Team,
  roster: Pick<TeamRoster, "tier">
): MatchedPlaySkillStatus {
  const allocations = team.matchedPlayAllocations ?? [];
  const spent = allocations.reduce(
    (sum, allocation) => sum + MATCHED_PLAY_COST[allocation.access],
    0
  );
  return {
    points: roster.tier,
    spent,
    remaining: roster.tier - spent,
    secondaryCount: allocations.filter((a) => a.access === "secondary").length,
    eliteCount: allocations.filter((a) => ELITE_SKILLS.has(a.skill)).length,
  };
}

export function matchedPlaySkillViolations(
  team: Team,
  roster: Pick<TeamRoster, "tier">
): string[] {
  const status = matchedPlaySkillStatus(team, roster);
  const playerIds = (team.matchedPlayAllocations ?? []).map((a) => a.playerId);
  return [
    status.remaining < 0 &&
      `Matched Play skills cost ${String(status.spent)} Skill Points but the team has ${String(status.points)}.`,
    status.secondaryCount > 1 && "A team may take only one Secondary skill.",
    status.eliteCount > 2 && "A team may take at most two Elite skills.",
    new Set(playerIds).size !== playerIds.length &&
      "Each player may take only one Matched Play skill.",
  ].filter((reason): reason is string => !!reason);
}

export function allocateMatchedPlaySkill(
  team: Team,
  roster: Pick<TeamRoster, "tier">,
  player: Player,
  skill: SkillType,
  access: Access
): MatchedPlayAllocation {
  const allocations = (team.matchedPlayAllocations ??= []);
  if (allocations.some((a) => a.playerId === player.id)) {
    throw new Error("This player already has a Matched Play skill.");
  }
  const status = matchedPlaySkillStatus(team, roster);
  const cost = MATCHED_PLAY_COST[access];
  if (cost > status.remaining) {
    throw new Error(
      `Not enough Skill Points: ${skill} costs ${String(cost)} and ${String(status.remaining)} remain.`
    );
  }
  if (access === "secondary" && status.secondaryCount >= 1) {
    throw new Error("A team may take only one Secondary skill.");
  }
  const elite = ELITE_SKILLS.has(skill);
  if (elite && status.eliteCount >= 2) {
    throw new Error("A team may take at most two Elite skills.");
  }
  if (!categoriesFor(player, access).includes(getSkill(skill).category)) {
    throw new Error(
      `${skill} is not a legal ${access} choice for this player.`
    );
  }
  if (!isSkillLegal(player, skill)) {
    throw new Error(`${skill} is not legal (duplicate or incompatible).`);
  }

  learnSkill(player, skill, {
    id: `adv-${String(advancementCount(player) + 1)}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease: 0,
    elite,
    source: "matched-play-package",
  });
  const allocation: MatchedPlayAllocation = {
    playerId: player.id,
    skill,
    access,
  };
  allocations.push(allocation);
  return allocation;
}

export function removeMatchedPlayAllocation(
  team: Team,
  player: Player,
  allocation: MatchedPlayAllocation
): void {
  team.matchedPlayAllocations = (team.matchedPlayAllocations ?? []).filter(
    (a) => a !== allocation
  );
  const advancements = player.advancements ?? [];
  const index = advancements.findIndex(
    (advancement) =>
      advancement.source === "matched-play-package" &&
      advancement.name === allocation.skill
  );
  const [removed] = index === -1 ? [] : advancements.splice(index, 1);
  if (!removed) return;
  player.skills = player.skills.filter(
    (skill) => skill.type !== allocation.skill
  );
  player.teamValue = Math.max(
    0,
    (player.teamValue ?? 0) - removed.valueIncrease
  );
  player.level = Math.min(6, advancements.length);
}

const NEVER_GAINED = new Set<SkillType>([SkillType.LEADER, SkillType.PRO]);

export function eligibleSkillSelectionPlayers(team: Team): string[] {
  return team.players
    .filter(
      (player) =>
        player.playerKind !== "journeyman" &&
        !isPendingRecruit(team, player.id) &&
        player.status !== PlayerStatus.INJURED &&
        player.status !== PlayerStatus.DEAD &&
        !player.injuries.includes(InjuryType.DEAD)
    )
    .map((player) => player.id);
}

export function createPendingSkillSelection(
  team: Team,
  matchId: string,
  eligibleParticipantIds: readonly string[]
): PendingDevelopment {
  const id = `pending-${matchId}-skill-selection`;
  const existing = team.pendingDevelopment?.find((entry) => entry.id === id);
  if (existing) return existing;
  const entry: PendingDevelopment = {
    id,
    kind: "sevens-skill-selection",
    matchId,
    eligibleParticipantIds: [...eligibleParticipantIds],
    createdAt: Date.now(),
  };
  team.pendingDevelopment ??= [];
  team.pendingDevelopment.push(entry);
  return entry;
}

export type Nominator = "coach" | "opponent";
const NOMINATION_ORDER: readonly Nominator[] = ["coach", "opponent", "coach"];

export type SkillSelectionDecision =
  | {
      type: "choose-route";
      primaryOptions: { playerId: string; categories: SkillCategory[] }[];
      secondaryAvailable: boolean;
    }
  | {
      type: "name-primary-skill";
      chooser: Nominator;
      playerId: string;
      category: SkillCategory;
      named: SkillType[];
      options: SkillType[];
    }
  | { type: "roll-primary-d3"; playerId: string; named: SkillType[] }
  | {
      type: "choose-secondary-category";
      playerId: string;
      categories: SkillCategory[];
    }
  | {
      type: "choose-secondary-skill";
      playerId: string;
      candidates: SkillRollCandidate[];
    };

function eligiblePlayers(team: Team, entry: SkillSelectionEntry): Player[] {
  const living = new Set(eligibleSkillSelectionPlayers(team));
  return entry.eligibleParticipantIds
    .filter((id) => living.has(id))
    .map((id) => team.players.find((player) => player.id === id))
    .filter((player): player is Player => !!player);
}

function eligiblePlayer(
  team: Team,
  entry: SkillSelectionEntry,
  playerId: string
): Player {
  const player = eligiblePlayers(team, entry).find((p) => p.id === playerId);
  if (!player) throw new Error(`${playerId} cannot gain a skill this game.`);
  return player;
}

function nameableSkills(
  player: Player,
  category: SkillCategory,
  named: readonly SkillType[]
): SkillType[] {
  return SKILL_ROLL_TABLE[category].filter(
    (skill) =>
      !NEVER_GAINED.has(skill) &&
      !named.includes(skill) &&
      isSkillLegal(player, skill)
  );
}

function nameableCategories(player: Player): SkillCategory[] {
  return categoriesFor(player, "primary").filter(
    (category) => nameableSkills(player, category, []).length >= 3
  );
}

export function skillSelectionDecision(
  team: Team,
  entry: SkillSelectionEntry
): SkillSelectionDecision {
  const progress = standingProgress(team, entry);
  if (!progress) {
    const players = eligiblePlayers(team, entry);
    return {
      type: "choose-route",
      primaryOptions: players
        .map((player) => ({
          playerId: player.id,
          categories: nameableCategories(player),
        }))
        .filter((option) => option.categories.length > 0),
      secondaryAvailable: players.some(
        (player) => categoriesFor(player, "secondary").length > 0
      ),
    };
  }
  const player = team.players.find((p) => p.id === progress.playerId);
  if (!player)
    throw new Error(`${progress.playerId} is no longer on the team.`);
  switch (progress.route) {
    case "primary": {
      const named = standingNames(player, progress.named);
      const chooser = NOMINATION_ORDER[named.length];
      if (!chooser) {
        return {
          type: "roll-primary-d3",
          playerId: player.id,
          named,
        };
      }
      return {
        type: "name-primary-skill",
        chooser,
        playerId: player.id,
        category: progress.category,
        named,
        options: nameableSkills(player, progress.category, named),
      };
    }
    case "secondary":
      return progress.rolled && rollStands(player, progress.rolled)
        ? {
            type: "choose-secondary-skill",
            playerId: player.id,
            candidates: [...progress.rolled.candidates],
          }
        : {
            type: "choose-secondary-category",
            playerId: player.id,
            categories: categoriesFor(player, "secondary"),
          };
  }
}

function standingNames(
  player: Player,
  named: readonly SkillType[]
): SkillType[] {
  const illegal = named.findIndex((skill) => !isSkillLegal(player, skill));
  return illegal < 0 ? [...named] : named.slice(0, illegal);
}

function standingProgress(
  team: Team,
  { progress }: SkillSelectionEntry
): SkillSelectionEntry["progress"] {
  const player = team.players.find(({ id }) => id === progress?.playerId);
  if (progress?.route !== "primary" || !player) return progress;
  const named = standingNames(player, progress.named);
  const open = nameableSkills(player, progress.category, named);
  return named.length + open.length < NOMINATION_ORDER.length
    ? undefined
    : progress;
}

function rollStands(
  player: Player,
  rolled: { candidates: readonly SkillRollCandidate[] }
): boolean {
  return rolled.candidates.every(({ skill }) => isSkillLegal(player, skill));
}

function requireNoRoute(team: Team, entry: SkillSelectionEntry): void {
  if (standingProgress(team, entry))
    throw new Error("This game's route is already chosen.");
}

export function startPrimarySelection(
  team: Team,
  entry: SkillSelectionEntry,
  playerId: string,
  category: SkillCategory
): void {
  requireNoRoute(team, entry);
  const player = eligiblePlayer(team, entry, playerId);
  if (!nameableCategories(player).includes(category)) {
    throw new Error(
      `${category} is not a Primary category for ${player.playerName}.`
    );
  }
  entry.progress = { route: "primary", playerId, category, named: [] };
}

export function nominatePrimarySkill(
  team: Team,
  entry: SkillSelectionEntry,
  nominator: Nominator,
  skill: SkillType
): void {
  const decision = skillSelectionDecision(team, entry);
  if (
    decision.type !== "name-primary-skill" ||
    entry.progress?.route !== "primary"
  ) {
    throw new Error("No skill is waiting to be named.");
  }
  if (decision.chooser !== nominator) {
    throw new Error(`It is the ${decision.chooser}'s turn to name a skill.`);
  }
  if (!decision.options.includes(skill)) {
    const player = team.players.find((p) => p.id === decision.playerId);
    throw new Error(
      `${skill} cannot be named for ${String(player?.playerName)}.`
    );
  }
  entry.progress.named = [...decision.named, skill];
}

export interface SkillSelectionResult {
  playerId: string;
  skill: SkillType;

  d3?: number;
  draft: DraftOutcome;
}

export function rollPrimarySelection(
  team: Team,
  entry: SkillSelectionEntry,
  rng: Rng
): SkillSelectionResult {
  const decision = skillSelectionDecision(team, entry);
  if (decision.type !== "roll-primary-d3") {
    throw new Error("Three skills must be named before the D3 is rolled.");
  }
  const d3 = rng.rollDie(3);
  const skill = decision.named[d3 - 1];
  if (!skill) throw new Error("The D3 roll names no skill.");
  return {
    ...finishSelection(team, entry, decision.playerId, skill, "primary", rng),
    d3,
  };
}

export function startSecondarySelection(
  team: Team,
  entry: SkillSelectionEntry,
  rng: Rng
): void {
  requireNoRoute(team, entry);
  const players = eligiblePlayers(team, entry).filter(
    (player) => categoriesFor(player, "secondary").length > 0
  );
  if (players.length === 0) {
    throw new Error("No eligible player has a Secondary category.");
  }
  const player = players[rng.rollDie(players.length) - 1];
  if (!player) throw new Error("The roll picks no eligible player.");
  entry.progress = { route: "secondary", playerId: player.id };
}

export function rollSecondaryCandidates(
  team: Team,
  entry: SkillSelectionEntry,
  category: SkillCategory,
  rng: Rng
): void {
  const progress = entry.progress;
  if (progress?.route !== "secondary")
    throw new Error("No Secondary category is waiting to be chosen.");
  const player = eligiblePlayer(team, entry, progress.playerId);
  if (progress.rolled && rollStands(player, progress.rolled))
    throw new Error("No Secondary category is waiting to be chosen.");
  if (!categoriesFor(player, "secondary").includes(category)) {
    throw new Error(
      `${category} is not a Secondary category for ${player.playerName}.`
    );
  }
  const canTake = (skill: SkillType) =>
    !NEVER_GAINED.has(skill) && isSkillLegal(player, skill);
  const candidates: SkillRollCandidate[] = [
    rollTakeableSkill(category, canTake, rng),
    rollTakeableSkill(category, canTake, rng),
  ];
  progress.rolled = { category, candidates };
}

export function chooseSecondarySkill(
  team: Team,
  entry: SkillSelectionEntry,
  skill: SkillType,
  rng: Rng
): SkillSelectionResult {
  const decision = skillSelectionDecision(team, entry);
  if (
    decision.type !== "choose-secondary-skill" ||
    !decision.candidates.some((candidate) => candidate.skill === skill)
  ) {
    throw new Error(`${skill} was not rolled for this Skill Selection.`);
  }
  return finishSelection(
    team,
    entry,
    decision.playerId,
    skill,
    "secondary",
    rng
  );
}

function skillSelectionValue(player: Player, access: Access): number {
  const first = addedSkillCount(player) === 0;
  switch (access) {
    case "primary":
      return first ? 10_000 : 20_000;
    case "secondary":
      return first ? 20_000 : 30_000;
  }
}

function finishSelection(
  team: Team,
  entry: SkillSelectionEntry,
  playerId: string,
  skill: SkillType,
  access: Access,
  rng: Rng
): SkillSelectionResult {
  const player = eligiblePlayer(team, entry, playerId);
  const candidates =
    entry.progress?.route === "secondary"
      ? entry.progress.rolled?.candidates
      : undefined;
  learnSkill(player, skill, {
    id: `adv-${String(advancementCount(player) + 1)}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease: skillSelectionValue(player, access),
    elite: ELITE_SKILLS.has(skill),
    source: "sevens-skill-selection",
    sourceMatchId: entry.matchId,
    ...(candidates
      ? { candidateRolls: candidates.map((c) => ({ ...c })) }
      : {}),
  });
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (pending) => pending.id !== entry.id
  );
  return { playerId, skill, draft: rollDraftOffers(team, rng, entry.matchId) };
}

export function addedSkillCount(player: Player): number {
  return (player.advancements ?? []).filter(
    (advancement) =>
      advancement.type === "primary-skill" ||
      advancement.type === "secondary-skill"
  ).length;
}

export function draftedPlayerPrice(player: Player): number {
  return player.cost + (player.teamValue ?? 0);
}

export interface DraftOutcome {
  offers: DraftOfferEntry[];

  released: DraftRecord[];
}

function release(
  team: Team,
  player: Player,
  roll: number,
  count: number,
  matchId: string
): DraftRecord {
  const record: DraftRecord = {
    id: `draft-${player.id}-${String(Date.now())}`,
    playerId: player.id,
    playerName: player.playerName,
    roll,
    addedSkillCount: count,
    matchId,
    removedAt: Date.now(),
    player: structuredClone(player),
  };
  team.players = team.players.filter((p) => p.id !== player.id);
  team.draftHistory = [...(team.draftHistory ?? []), record];
  return record;
}

export function rollDraftOffers(
  team: Team,
  rng: Rng,
  matchId: string
): DraftOutcome {
  const outcome: DraftOutcome = { offers: [], released: [] };
  const candidates = team.players.filter(
    (player) =>
      player.status !== PlayerStatus.DEAD &&
      !player.injuries.includes(InjuryType.DEAD) &&
      addedSkillCount(player) >= 1
  );
  for (const player of candidates) {
    const count = addedSkillCount(player);
    const roll = rng.rollDie(6);
    if (roll > count) continue;
    if (draftedPlayerPrice(player) > team.treasury) {
      outcome.released.push(release(team, player, roll, count, matchId));
      continue;
    }
    const offer: DraftOfferEntry = {
      id: `pending-${matchId}-draft-${player.id}`,
      kind: "drafted-player-offer",
      playerId: player.id,
      roll,
      addedSkillCount: count,
      matchId,
      createdAt: Date.now(),
    };
    team.pendingDevelopment = [...(team.pendingDevelopment ?? []), offer];
    outcome.offers.push(offer);
  }
  return outcome;
}

function offeredPlayer(team: Team, offer: DraftOfferEntry): Player {
  const player = team.players.find((p) => p.id === offer.playerId);
  if (!player) throw new Error(`${offer.playerId} is no longer on the team.`);
  return player;
}

function closeOffer(team: Team, offer: DraftOfferEntry): void {
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (pending) => pending.id !== offer.id
  );
}

export function keepDraftedPlayer(team: Team, offer: DraftOfferEntry): void {
  const player = offeredPlayer(team, offer);
  const price = draftedPlayerPrice(player);
  if (price > team.treasury) {
    throw new Error(
      `The Treasury has ${team.treasury.toLocaleString("en-US")} but keeping ${player.playerName} costs ${price.toLocaleString("en-US")}.`
    );
  }
  team.treasury -= price;
  player.timesKeptFromDraft = (player.timesKeptFromDraft ?? 0) + 1;
  player.teamValue = (player.teamValue ?? 0) + DRAFT_KEEP_VALUE_INCREASE;
  closeOffer(team, offer);
}

export function releaseDraftedPlayer(
  team: Team,
  offer: DraftOfferEntry
): DraftRecord {
  const player = offeredPlayer(team, offer);
  closeOffer(team, offer);
  return release(
    team,
    player,
    offer.roll,
    offer.addedSkillCount,
    offer.matchId
  );
}
