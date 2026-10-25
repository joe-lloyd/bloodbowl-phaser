/**
 * Team advancement modes: Matched Play Skill Points, Sevens Skill Selection,
 * and the post-game Drafted Players roll, per Spike! Journal 22 (see
 * docs/SEVENS_RULES.md, rules A1-A6 and MP5-MP6). Advanced League continues
 * to use the plain SPP flow in progression.ts; this module covers everything
 * mode-specific.
 *
 * All functions here are pure/mutate-the-passed-object, mirroring
 * progression.ts, so they work identically in the browser UI, the headless
 * harness, and unit tests.
 */
import {
  DRAFT_KEEP_VALUE_INCREASE,
  InjuryType,
  Player,
  PlayerAdvancement,
  PlayerStatus,
} from "../../types/Player";
import {
  DraftRecord,
  MatchedPlayAllocation,
  PendingDevelopment,
  SkillRollCandidate,
  Team,
  TeamRoster,
} from "../../types/Team";
import { SkillCategory, SkillType, getSkill } from "../../types/Skills";
import { IRNGService } from "../../services/rng/RNGService";
import {
  ELITE_SKILLS,
  SKILL_ROLL_TABLE,
  advancementCount,
  isSkillLegal,
  rollSkill,
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

// ===== Matched Play (MP5, MP6) =====

export interface MatchedPlaySkillStatus {
  /** MP5: one Skill Point per tier number. */
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

/** Problems with a team's Matched Play skills, for competition entry. */
export function matchedPlaySkillViolations(
  team: Team,
  roster: Pick<TeamRoster, "tier">
): string[] {
  const status = matchedPlaySkillStatus(team, roster);
  const playerIds = (team.matchedPlayAllocations ?? []).map((a) => a.playerId);
  return [
    status.remaining < 0 &&
      `Matched Play skills cost ${status.spent} Skill Points but the team has ${status.points}.`,
    status.secondaryCount > 1 && "A team may take only one Secondary skill.",
    status.eliteCount > 2 && "A team may take at most two Elite skills.",
    new Set(playerIds).size !== playerIds.length &&
      "Each player may take only one Matched Play skill.",
  ].filter((reason): reason is string => !!reason);
}

/**
 * Buy one Matched Play skill with Skill Points (MP6): a Primary skill costs
 * 1 point and a Secondary skill 2, with at most one Secondary skill and two
 * Elite skills per team and one added skill per player. Purchased skills do
 * not raise the player's value.
 */
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
      `Not enough Skill Points: ${skill} costs ${cost} and ${status.remaining} remain.`
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
    throw new Error(`${skill} is not a legal ${access} choice for this player.`);
  }
  if (!isSkillLegal(player, skill)) {
    throw new Error(`${skill} is not legal (duplicate or incompatible).`);
  }

  learnSkill(player, skill, {
    id: `adv-${advancementCount(player) + 1}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease: 0,
    elite,
    source: "matched-play-package",
  });
  const allocation: MatchedPlayAllocation = { playerId: player.id, skill, access };
  allocations.push(allocation);
  return allocation;
}

/** Remove a Matched Play allocation (and its skill) before finalization. */
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
  if (index === -1) return;
  const [removed] = advancements.splice(index, 1);
  player.skills = player.skills.filter(
    (skill) => skill.type !== allocation.skill
  );
  player.teamValue = Math.max(0, (player.teamValue ?? 0) - removed.valueIncrease);
  player.level = Math.min(6, advancements.length);
}

// ===== Sevens Skill Selection (A1-A5) =====

/** A4: these can never be gained through Sevens Skill Selection. */
const NEVER_GAINED = new Set<SkillType>([SkillType.LEADER, SkillType.PRO]);

/** Players who did not end the game as a Casualty (A2, A3). Journeymen
 *  leave after the game, so they are not offered. */
export function eligibleSkillSelectionPlayers(team: Team): string[] {
  return team.players
    .filter(
      (player) =>
        player.playerKind !== "journeyman" &&
        player.status !== PlayerStatus.INJURED &&
        player.status !== PlayerStatus.DEAD &&
        !player.injuries.includes(InjuryType.DEAD)
    )
    .map((player) => player.id);
}

/** Record this game's Skill Selection for Manage Team to resolve. */
export function createPendingSkillSelection(
  team: Team,
  matchId: string,
  eligibleParticipantIds: readonly string[]
): PendingDevelopment {
  const entry: PendingDevelopment = {
    id: `pending-${matchId}-skill-selection`,
    kind: "sevens-skill-selection",
    matchId,
    eligibleParticipantIds: [...eligibleParticipantIds],
    createdAt: Date.now(),
  };
  team.pendingDevelopment ??= [];
  team.pendingDevelopment.push(entry);
  return entry;
}

/** A2: who names each of the three candidate Primary skills. */
export type Nominator = "coach" | "opponent";
const NOMINATION_ORDER: readonly Nominator[] = ["coach", "opponent", "coach"];

/**
 * The next choice a Skill Selection is waiting on. The UI renders this and a
 * headless caller answers it with the matching function:
 * choose-route → startPrimarySelection or startSecondarySelection;
 * name-primary-skill → nominatePrimarySkill; roll-primary-d3 →
 * rollPrimarySelection; choose-secondary-category → rollSecondaryCandidates;
 * choose-secondary-skill → chooseSecondarySkill.
 */
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

/** Skills that may still be named for the player, in skill-table order. */
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

/** Primary categories with enough skills left for three different names. */
function nameableCategories(player: Player): SkillCategory[] {
  return categoriesFor(player, "primary").filter(
    (category) => nameableSkills(player, category, []).length >= 3
  );
}

export function skillSelectionDecision(
  team: Team,
  entry: SkillSelectionEntry
): SkillSelectionDecision {
  const progress = entry.progress;
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
  if (!player) throw new Error(`${progress.playerId} is no longer on the team.`);
  switch (progress.route) {
    case "primary": {
      const chooser = NOMINATION_ORDER[progress.named.length];
      if (!chooser) {
        return {
          type: "roll-primary-d3",
          playerId: player.id,
          named: [...progress.named],
        };
      }
      return {
        type: "name-primary-skill",
        chooser,
        playerId: player.id,
        category: progress.category,
        named: [...progress.named],
        options: nameableSkills(player, progress.category, progress.named),
      };
    }
    case "secondary":
      return progress.rolled
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

function requireNoRoute(entry: SkillSelectionEntry): void {
  if (entry.progress) throw new Error("This game's route is already chosen.");
}

/** A2: the coach picks the player and one of their Primary categories. */
export function startPrimarySelection(
  team: Team,
  entry: SkillSelectionEntry,
  playerId: string,
  category: SkillCategory
): void {
  requireNoRoute(entry);
  const player = eligiblePlayer(team, entry, playerId);
  if (!nameableCategories(player).includes(category)) {
    throw new Error(`${category} is not a Primary category for ${player.playerName}.`);
  }
  entry.progress = { route: "primary", playerId, category, named: [] };
}

/** A2: the coach, then the opponent, then the coach names a skill. */
export function nominatePrimarySkill(
  team: Team,
  entry: SkillSelectionEntry,
  nominator: Nominator,
  skill: SkillType
): void {
  const decision = skillSelectionDecision(team, entry);
  if (decision.type !== "name-primary-skill" || entry.progress?.route !== "primary") {
    throw new Error("No skill is waiting to be named.");
  }
  if (decision.chooser !== nominator) {
    throw new Error(`It is the ${decision.chooser}'s turn to name a skill.`);
  }
  if (!decision.options.includes(skill)) {
    const player = team.players.find((p) => p.id === decision.playerId);
    throw new Error(`${skill} cannot be named for ${player?.playerName}.`);
  }
  entry.progress.named.push(skill);
}

export interface SkillSelectionResult {
  playerId: string;
  skill: SkillType;
  /** The D3 that picked among the three named skills (Primary only). */
  d3?: number;
  draft: DraftOutcome;
}

/** A2: a D3 decides which of the three named skills the player learns. */
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
  return { ...finishSelection(team, entry, decision.playerId, skill, "primary", rng), d3 };
}

/** A3: the player is picked at random from those who can gain a skill. */
export function startSecondarySelection(
  team: Team,
  entry: SkillSelectionEntry,
  rng: Rng
): void {
  requireNoRoute(entry);
  const players = eligiblePlayers(team, entry).filter(
    (player) => categoriesFor(player, "secondary").length > 0
  );
  if (players.length === 0) {
    throw new Error("No eligible player has a Secondary category.");
  }
  const player = players[rng.rollDie(players.length) - 1];
  entry.progress = { route: "secondary", playerId: player.id };
}

/** A3 with rulebook page 97: in a category the coach picks, roll on the
 *  skill table twice, re-rolling skills the player cannot take (A4). */
export function rollSecondaryCandidates(
  team: Team,
  entry: SkillSelectionEntry,
  category: SkillCategory,
  rng: Rng
): void {
  const progress = entry.progress;
  if (progress?.route !== "secondary" || progress.rolled) {
    throw new Error("No Secondary category is waiting to be chosen.");
  }
  const player = eligiblePlayer(team, entry, progress.playerId);
  if (!categoriesFor(player, "secondary").includes(category)) {
    throw new Error(`${category} is not a Secondary category for ${player.playerName}.`);
  }
  const rollCandidate = (): SkillRollCandidate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const firstD6 = rng.rollDie(6);
      const secondD6 = rng.rollDie(6);
      const skill = rollSkill(category, firstD6, secondD6);
      if (!NEVER_GAINED.has(skill) && isSkillLegal(player, skill)) {
        return { skill, firstD6, secondD6 };
      }
    }
    throw new Error("No legal random skill could be rolled");
  };
  progress.rolled = { category, candidates: [rollCandidate(), rollCandidate()] };
}

/** A3: the coach chooses one of the two rolled skills. */
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
  return finishSelection(team, entry, decision.playerId, skill, "secondary", rng);
}

/** A5: Primary adds 10,000 for the player's first added skill and 20,000
 *  after; Secondary adds 20,000 then 30,000. */
function skillSelectionValue(player: Player, access: Access): number {
  const first = addedSkillCount(player) === 0;
  switch (access) {
    case "primary":
      return first ? 10_000 : 20_000;
    case "secondary":
      return first ? 20_000 : 30_000;
  }
}

/** Teach the skill, close the entry, then roll for Drafted Players (A6). */
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
    entry.progress?.route === "secondary" ? entry.progress.rolled?.candidates : undefined;
  learnSkill(player, skill, {
    id: `adv-${advancementCount(player) + 1}`,
    type: access === "primary" ? "primary-skill" : "secondary-skill",
    name: skill,
    sppCost: 0,
    valueIncrease: skillSelectionValue(player, access),
    elite: ELITE_SKILLS.has(skill),
    source: "sevens-skill-selection",
    sourceMatchId: entry.matchId,
    ...(candidates ? { candidateRolls: candidates.map((c) => ({ ...c })) } : {}),
  });
  team.pendingDevelopment = (team.pendingDevelopment ?? []).filter(
    (pending) => pending.id !== entry.id
  );
  return { playerId, skill, draft: rollDraftOffers(team, rng, entry.matchId) };
}

// ===== Drafted Players (A6) =====

/** Number of skills a player has gained from any advancement pipeline —
 *  Advanced League SPP, Matched Play, or Skill Selection. */
export function addedSkillCount(player: Player): number {
  return (player.advancements ?? []).filter(
    (advancement) =>
      advancement.type === "primary-skill" ||
      advancement.type === "secondary-skill"
  ).length;
}

/** What keeping a drafted player costs: their current value. */
export function draftedPlayerPrice(player: Player): number {
  return player.cost + (player.teamValue ?? 0);
}

export interface DraftOutcome {
  /** Offers the coach must answer with keepDraftedPlayer or releaseDraftedPlayer. */
  offers: DraftOfferEntry[];
  /** Players the Treasury could not keep, removed at once. */
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
    id: `draft-${player.id}-${Date.now()}`,
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

/**
 * A6: after advancement, roll a D6 for every living player with added
 * skills. At or under their added-skill count, a pro team makes an offer.
 * An offer the Treasury can pay becomes a pending coach decision; one it
 * cannot pay releases the player straight away.
 */
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

/** A6: pay the player's current value from the Treasury to keep them; their
 *  value then rises by 15,000. The count persists so the rise survives a
 *  reload, which rebuilds value from stored data. */
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

/** A6: let the player go to the pro team. The team receives nothing. */
export function releaseDraftedPlayer(team: Team, offer: DraftOfferEntry): DraftRecord {
  const player = offeredPlayer(team, offer);
  closeOffer(team, offer);
  return release(team, player, offer.roll, offer.addedSkillCount, offer.matchId);
}
