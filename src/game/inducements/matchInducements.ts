/**
 * What a team's Prayers to Nuffle and Desperate Measures do in a match
 * (Spike! Journal 22, rules L12 to L28).
 *
 * Both are rolled once, before the first set-up, from the purchased counts in
 * the inducement inventory. The results live on `GameState.matchInducements`
 * so saves and online snapshots carry them. Skills and characteristics a
 * result grants are written onto the player for the game and recorded here,
 * then taken back at full time so they never reach the roster.
 */

import { GameState } from "@/types/GameState";
import { Inducement, PrayerToNuffle } from "@/types/Inducements";
import {
  Player,
  PlayerCondition,
  PlayerStats,
  PlayerStatus,
  addCondition,
  hasCondition,
  hasTackleZone,
  removeCondition,
} from "@/types/Player";
import { Skill, SkillType, getSkill, hasSkill } from "@/types/Skills";
import { Team } from "@/types/Team";
import {
  DopeStat,
  InducementChoiceDecisionAnswer,
  InducementChoiceDecisionRequest,
  ReactionDecisionAnswer,
} from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { GameConfig, isTrapdoorSquare } from "@/config/GameConfig";
import { GameOperation } from "../core/GameOperation";
import { FlowContext } from "../core/GameFlowManager";
import { DiceController } from "../controllers/DiceController";
import { weatherEffects } from "../rules/weather";
import { getDriveEffects } from "../kickoff/driveEffects";
import { eligibleSkills } from "../progression/progression";
import { rollPrayersToNuffle } from "./prayersToNuffle";
import { DesperateMeasure, rollDesperateMeasures } from "./desperateMeasures";
import {
  appointTeamCaptain,
  captainVacancyCandidates,
} from "../rules/teamCaptain";

export interface HeldMeasure {
  measure: DesperateMeasure;
  used: boolean;
}

/** Something a result gave a player for this game only. */
export type MatchGrant =
  | { kind: "skill"; playerId: string; skill: SkillType }
  | { kind: "stat"; playerId: string; stat: "AV" | DopeStat; delta: number };

/** A player Zap! turned into a Frog, and what they were before. */
export interface FrogRecord {
  playerId: string;
  stats: PlayerStats;
  skills: Skill[];
}

export interface MatchInducementsState {
  /** Set once both teams' prayers and measures have been rolled. */
  rolled: boolean;
  prayers: Record<string, PrayerToNuffle[]>;
  measures: Record<string, HeldMeasure[]>;
  grants: MatchGrant[];
  /** You Dope! players, who roll at the end of every drive they play. */
  dopedPlayerIds: string[];
  /** Knocked out by You Dope! this end of drive: they skip KO recovery. */
  noRecoveryPlayerIds: string[];
  /** Teams holding a Sports-Wizard that has not cast yet (Magic Scroll). */
  sportsWizards?: string[];
  /** Zap!'s Frogs, who are themselves again at the end of the drive. */
  frogs?: FrogRecord[];
}

export function emptyMatchInducements(): MatchInducementsState {
  return {
    rolled: false,
    prayers: {},
    measures: {},
    grants: [],
    dopedPlayerIds: [],
    noRecoveryPlayerIds: [],
  };
}

export function getMatchInducements(state: GameState): MatchInducementsState {
  state.matchInducements ??= emptyMatchInducements();
  return state.matchInducements;
}

export function hasPrayer(
  state: GameState,
  teamId: string,
  prayer: PrayerToNuffle
): boolean {
  return state.matchInducements?.prayers[teamId]?.includes(prayer) ?? false;
}

/** Prayers such as Treacherous Trapdoor affect both teams. */
export function prayerInPlay(
  state: GameState,
  prayer: PrayerToNuffle
): boolean {
  return Object.values(state.matchInducements?.prayers ?? {}).some((held) =>
    held.includes(prayer)
  );
}

/** True when the team rolled this measure and has not used it yet. */
export function holdsMeasure(
  state: GameState,
  teamId: string,
  measure: DesperateMeasure
): boolean {
  return (
    state.matchInducements?.measures[teamId]?.some(
      (held) => held.measure === measure && !held.used
    ) ?? false
  );
}

/** Use a held measure once; false when the team has none left. */
export function spendMeasure(
  state: GameState,
  teamId: string,
  measure: DesperateMeasure
): boolean {
  const held = state.matchInducements?.measures[teamId]?.find(
    (entry) => entry.measure === measure && !entry.used
  );
  if (!held) return false;
  held.used = true;
  return true;
}

/**
 * Whether the team's Foul for this turn is spent. Grudge Match (L24) lets a
 * player Foul even when the team already has.
 */
export function foulSpent(state: GameState, teamId: string): boolean {
  return (
    state.turn.hasFouled &&
    !holdsMeasure(state, teamId, DesperateMeasure.GRUDGE_MATCH)
  );
}

/** Rush modifiers: the weather, and -1 under the opposition's Moles. */
export function rushModifier(state: GameState, player: Player): number {
  const moles = Object.entries(state.matchInducements?.prayers ?? {}).some(
    ([teamId, held]) =>
      teamId !== player.teamId &&
      held.includes(PrayerToNuffle.MOLES_UNDER_THE_PITCH)
  );
  return weatherEffects(state.weather).rush - (moles ? 1 : 0);
}

/** Under Scrutiny: the fouled player's team holds the prayer. */
export function underScrutiny(state: GameState, foulerTeamId: string): boolean {
  return Object.entries(state.matchInducements?.prayers ?? {}).some(
    ([teamId, held]) =>
      teamId !== foulerTeamId && held.includes(PrayerToNuffle.UNDER_SCRUTINY)
  );
}

/**
 * Treacherous Trapdoor (L12): a player entering a Trapdoor square rolls a
 * D6 and falls through on a 1. False when no team prayed for it.
 */
export function trapdoorOpens(
  state: GameState,
  dice: DiceController,
  player: Player,
  square: { x: number; y: number }
): boolean {
  if (!isTrapdoorSquare(square.x, square.y)) return false;
  if (!prayerInPlay(state, PrayerToNuffle.TREACHEROUS_TRAPDOOR)) return false;
  return dice.rollD6(`Trapdoor (${player.playerName})`, player.teamId) === 1;
}

/**
 * Discarded Banana Skin (L27): the team whose Tackle Zone a moving opponent
 * just entered, when it still holds the measure. Null otherwise.
 */
export function bananaSkinTeam(
  state: GameState,
  square: { x: number; y: number },
  opponents: Player[]
): string | null {
  const marker = opponents.find(
    (p) =>
      p.gridPosition &&
      hasTackleZone(p) &&
      Math.max(
        Math.abs(p.gridPosition.x - square.x),
        Math.abs(p.gridPosition.y - square.y)
      ) === 1
  );
  if (!marker) return null;
  return holdsMeasure(
    state,
    marker.teamId,
    DesperateMeasure.DISCARDED_BANANA_SKIN
  )
    ? marker.teamId
    : null;
}

/** Ask a team's coach yes or no about one of their held measures. */
export async function offerMeasure(
  context: Pick<FlowContext, "gameService">,
  teamId: string,
  playerId: string,
  measure: DesperateMeasure,
  prompt: string
): Promise<boolean> {
  const answer = (await context.gameService.getDecisionService().request({
    type: "reaction",
    playerId,
    chooserTeamId: teamId,
    skill: measure,
    prompt,
  })) as ReactionDecisionAnswer;
  return (
    answer.accept &&
    spendMeasure(context.gameService.getState(), teamId, measure)
  );
}

function grantSkill(
  state: GameState,
  player: Player,
  skill: SkillType
): boolean {
  if (hasSkill(player.skills, skill)) return false;
  player.skills.push(getSkill(skill));
  getMatchInducements(state).grants.push({
    kind: "skill",
    playerId: player.id,
    skill,
  });
  return true;
}

function grantStat(
  state: GameState,
  player: Player,
  stat: "AV" | DopeStat,
  delta: number
): void {
  player.stats[stat] += delta;
  getMatchInducements(state).grants.push({
    kind: "stat",
    playerId: player.id,
    stat,
    delta,
  });
}

/** Magic Scroll (L28): the team gains a Sports-Wizard for free. */
export function grantSportsWizard(state: GameState, teamId: string): void {
  const mi = getMatchInducements(state);
  mi.sportsWizards = [...(mi.sportsWizards ?? []), teamId];
}

export function holdsSportsWizard(state: GameState, teamId: string): boolean {
  return state.matchInducements?.sportsWizards?.includes(teamId) ?? false;
}

/** The Sports-Wizard casts once per game: spend it. */
export function spendSportsWizard(state: GameState, teamId: string): void {
  const mi = getMatchInducements(state);
  mi.sportsWizards = (mi.sportsWizards ?? []).filter((id) => id !== teamId);
}

/**
 * Zap! (2025 rulebook p.149): the player takes the Frog's profile, MA 5,
 * ST 1, AG 2+, PA -, AV 5+, with Dodge, Leap, No Ball, Stunty, Titchy and
 * Very Long Legs, until the end of the drive.
 */
export function turnIntoFrog(state: GameState, player: Player): void {
  const mi = getMatchInducements(state);
  if (hasCondition(player, PlayerCondition.FROG)) return;
  mi.frogs = [
    ...(mi.frogs ?? []),
    { playerId: player.id, stats: { ...player.stats }, skills: player.skills },
  ];
  // PA 0 shows as "-"; No Ball keeps a Frog from ever passing
  player.stats = { MA: 5, ST: 1, AG: 2, PA: 0, AV: 5 };
  player.skills = [
    SkillType.DODGE,
    SkillType.LEAP,
    SkillType.NO_BALL,
    SkillType.STUNTY,
    SkillType.TITCHY,
    SkillType.VERY_LONG_LEGS,
  ].map((type) => getSkill(type));
  addCondition(player, PlayerCondition.FROG);
}

export function isFrog(state: GameState, playerId: string): boolean {
  return (
    state.matchInducements?.frogs?.some((f) => f.playerId === playerId) ?? false
  );
}

/** End of the drive: every Frog returns to normal with no ill effects. */
export function restoreFrogs(state: GameState, players: Player[]): void {
  const mi = state.matchInducements;
  for (const frog of mi?.frogs ?? []) {
    const player = players.find((p) => p.id === frog.playerId);
    if (!player) continue;
    player.stats = { ...frog.stats };
    player.skills = frog.skills;
    removeCondition(player, PlayerCondition.FROG);
  }
  if (mi) mi.frogs = [];
}

/** Full time: take back every skill and characteristic granted for the game. */
export function revokeMatchGrants(state: GameState, players: Player[]): void {
  const mi = state.matchInducements;
  if (!mi) return;
  restoreFrogs(state, players);
  for (const grant of mi.grants) {
    const player = players.find((p) => p.id === grant.playerId);
    if (!player) continue;
    switch (grant.kind) {
      case "skill": {
        const index = player.skills.findIndex((s) => s.type === grant.skill);
        if (index >= 0) player.skills.splice(index, 1);
        break;
      }
      case "stat":
        player.stats[grant.stat] -= grant.delta;
        break;
    }
  }
  mi.grants = [];
}

/** Players "on your team that are playing this game". */
function availablePlayers(team: Team): Player[] {
  return team.players.filter(
    (p) =>
      p.playerKind !== "star" &&
      p.status !== PlayerStatus.INJURED &&
      p.status !== PlayerStatus.DEAD &&
      p.status !== PlayerStatus.REMOVED
  );
}

/** One of `pool` at random: a D16, re-rolled outside a whole multiple. */
function randomPlayer(
  dice: DiceController,
  pool: Player[],
  label: string,
  teamId: string
): Player | undefined {
  if (pool.length === 0) return undefined;
  const accepted = Math.floor(16 / pool.length) * pool.length;
  let roll: number;
  do {
    roll = dice.rollD16(label, teamId);
  } while (roll > accepted);
  return pool[(roll - 1) % pool.length];
}

function countBought(
  state: GameState,
  teamId: string,
  inducement: Inducement
): number {
  return (state.inducements?.inventory ?? [])
    .filter((e) => e.ownerTeamId === teamId && e.inducement === inducement)
    .reduce((sum, e) => sum + e.quantity, 0);
}

async function choose(
  context: FlowContext,
  request: Omit<InducementChoiceDecisionRequest, "type">
): Promise<InducementChoiceDecisionAnswer> {
  return (await context.gameService.getDecisionService().request({
    type: "inducement-choice",
    ...request,
  })) as InducementChoiceDecisionAnswer;
}

function announce(context: FlowContext, text: string): void {
  context.eventBus.emit(GameEventNames.UI_GameLog, text);
}

/** Stiletto grants Stab, Blessing of Nuffle Pro, to a random player. */
function blessRandomPlayer(
  context: FlowContext,
  team: Team,
  pool: Player[],
  prayer: PrayerToNuffle.STILETTO | PrayerToNuffle.BLESSING_OF_NUFFLE
): void {
  const state = context.gameService.getState();
  const dice = context.gameService.getDiceController();
  const skill =
    prayer === PrayerToNuffle.STILETTO ? SkillType.STAB : SkillType.PRO;
  const player = randomPlayer(dice, pool, prayer, team.id);
  if (player && grantSkill(state, player, skill)) {
    announce(context, `${prayer}: ${player.playerName} gains ${skill}`);
  }
}

/** Grant the chosen player a prayer's skill, and say so if it took. */
function grantChosenSkill(
  context: FlowContext,
  state: GameState,
  player: Player | undefined,
  grant: { skill: SkillType; prayerName: string }
): void {
  const { skill, prayerName } = grant;
  if (player && grantSkill(state, player, skill)) {
    announce(context, `${prayerName}: ${player.playerName} gains ${skill}`);
  }
}

const primarySkills = (player: Player) =>
  eligibleSkills(player, player.primary ?? []);

async function applyPrayer(
  context: FlowContext,
  team: Team,
  prayer: PrayerToNuffle
): Promise<void> {
  const state = context.gameService.getState();
  const dice = context.gameService.getDiceController();
  const pool = availablePlayers(team);
  switch (prayer) {
    case PrayerToNuffle.TREACHEROUS_TRAPDOOR:
    case PrayerToNuffle.MOLES_UNDER_THE_PITCH:
    case PrayerToNuffle.UNDER_SCRUTINY:
      announce(context, `${team.name} prayed for ${prayer}`);
      return;
    case PrayerToNuffle.STILETTO:
    case PrayerToNuffle.BLESSING_OF_NUFFLE:
      blessRandomPlayer(context, team, pool, prayer);
      return;
    case PrayerToNuffle.IRON_MAN: {
      const options = pool.filter((p) => p.stats.AV < 11);
      if (options.length === 0) return;
      const answer = await choose(context, {
        kind: "iron-man",
        chooserTeamId: team.id,
        playerIds: options.map((p) => p.id),
        optional: false,
      });
      const player = options.find((p) => p.id === answer.playerId);
      if (player) {
        grantStat(state, player, "AV", 1);
        announce(context, `Iron Man: ${player.playerName} gains +1 AV`);
      }
      return;
    }
    case PrayerToNuffle.KNUCKLE_DUSTERS: {
      const options = pool.filter(
        (p) => !hasSkill(p.skills, SkillType.MIGHTY_BLOW)
      );
      if (options.length === 0) return;
      const answer = await choose(context, {
        kind: "knuckle-dusters",
        chooserTeamId: team.id,
        playerIds: options.map((p) => p.id),
        optional: false,
      });
      grantChosenSkill(
        context,
        state,
        options.find((p) => p.id === answer.playerId),
        { skill: SkillType.MIGHTY_BLOW, prayerName: "Knuckle Dusters" }
      );
      return;
    }
    case PrayerToNuffle.INTENSIVE_TRAINING: {
      const player = randomPlayer(dice, pool, prayer, team.id);
      if (!player) return;
      const skills = primarySkills(player);
      if (skills.length === 0) return;
      const answer = await choose(context, {
        kind: "intensive-training",
        chooserTeamId: team.id,
        playerIds: [player.id],
        skills,
        optional: false,
      });
      const skill = skills.find((s) => s === answer.skill);
      if (skill)
        grantChosenSkill(context, state, player, {
          skill,
          prayerName: "Intensive Training",
        });
      return;
    }
  }
}

/**
 * Hangover (L23), before the first set-up: one chosen opposition player
 * misses the first drive. Declining keeps nothing: this is the only drive
 * the measure can affect.
 */
async function offerHangover(context: FlowContext, team: Team): Promise<void> {
  const state = context.gameService.getState();
  if (!holdsMeasure(state, team.id, DesperateMeasure.HANGOVER)) return;
  const opposition = context.gameService
    .getTeams()
    .find((t) => t.id !== team.id);
  if (!opposition) return;
  const options = availablePlayers(opposition);
  const answer = await choose(context, {
    kind: "hangover",
    chooserTeamId: team.id,
    playerIds: options.map((p) => p.id),
    optional: true,
  });
  const player = options.find((p) => p.id === answer.playerId);
  if (!player || !spendMeasure(state, team.id, DesperateMeasure.HANGOVER)) {
    return;
  }
  getDriveEffects(state).playerModifiers[player.id] = {
    ...getDriveEffects(state).playerModifiers[player.id],
    confinedToReserves: true,
  };
  announce(context, `Hangover: ${player.playerName} misses the first drive`);
}

/**
 * Before the first set-up: roll every bought prayer and measure, apply the
 * prayers, then offer Hangover. Runs once per match.
 */
export class ResolvePregameInducementsOperation extends GameOperation {
  public readonly name = "ResolvePregameInducements";

  async execute(context: FlowContext): Promise<void> {
    const { gameService } = context;
    const state = gameService.getState();
    const mi = getMatchInducements(state);
    if (mi.rolled) return;
    mi.rolled = true;

    const dice = gameService.getDiceController();
    const teams = gameService.getTeams();
    for (const team of teams) {
      const records = rollPrayersToNuffle(
        dice,
        team.id,
        countBought(state, team.id, Inducement.PRAYERS_TO_NUFFLE)
      );
      state.inducements?.prayerLog.push(...records);
      mi.prayers[team.id] = records.map((r) => r.prayer);
      mi.measures[team.id] = rollDesperateMeasures(
        dice,
        team.id,
        countBought(state, team.id, Inducement.DESPERATE_MEASURES)
      ).map((measure) => ({ measure, used: false }));
      for (const held of mi.measures[team.id]) {
        announce(context, `${team.name} holds ${held.measure}`);
      }
    }
    for (const team of teams) {
      for (const prayer of mi.prayers[team.id]) {
        await applyPrayer(context, team, prayer);
      }
    }
    for (const team of teams) {
      await offerHangover(context, team);
    }
    // Magic Scroll is used before set-up too. Nothing is gained by keeping
    // it, so it is read at once.
    for (const team of teams) {
      if (spendMeasure(state, team.id, DesperateMeasure.MAGIC_SCROLL)) {
        grantSportsWizard(state, team.id);
        announce(context, `Magic Scroll: ${team.name} gains a Sports-Wizard`);
      }
    }
  }
}

/**
 * Team Captain, May 2026 errata to p.155: a team whose Captain has left
 * its roster may appoint a new one "during the Pre-game Sequence of your
 * next League Fixture". Runs once both coaches confirm their inducements,
 * before any Prayer is rolled; declining leaves the team without one.
 */
export class AppointTeamCaptainOperation extends GameOperation {
  public readonly name = "AppointTeamCaptain";

  async execute(context: FlowContext): Promise<void> {
    for (const team of context.gameService.getTeams()) {
      const candidates = captainVacancyCandidates(team);
      if (candidates.length === 0) continue;
      const answer = await choose(context, {
        kind: "team-captain",
        chooserTeamId: team.id,
        playerIds: candidates.map((p) => p.id),
        optional: true,
      });
      const chosen = candidates.find((p) => p.id === answer.playerId);
      if (!chosen) continue;
      appointTeamCaptain(team, chosen);
      announce(
        context,
        `${chosen.playerName} is ${team.name}'s new Team Captain`
      );
    }
  }
}

/**
 * You Dope! (L21), after both set-ups and before the kick: one player of
 * the team on the pitch gets +1 ST or +1 AG for the game. Declining keeps
 * the measure for a later drive.
 */
export class OfferYouDopeOperation extends GameOperation {
  public readonly name = "OfferYouDope";

  async execute(context: FlowContext): Promise<void> {
    const state = context.gameService.getState();
    for (const team of context.gameService.getTeams()) {
      if (!holdsMeasure(state, team.id, DesperateMeasure.YOU_DOPE)) continue;
      const options = team.players.filter(
        (p) => p.gridPosition && (p.stats.ST < 8 || p.stats.AG > 1)
      );
      if (options.length === 0) continue;
      const answer = await choose(context, {
        kind: "you-dope",
        chooserTeamId: team.id,
        playerIds: options.map((p) => p.id),
        stats: ["ST", "AG"],
        optional: true,
      });
      const player = options.find((p) => p.id === answer.playerId);
      const stat = answer.stat;
      if (!player || !stat) continue;
      // +1 AG improves the target number by one, down to 1+.
      const delta = stat === "ST" ? 1 : -1;
      const capped =
        stat === "ST" ? player.stats.ST >= 8 : player.stats.AG <= 1;
      if (capped || !spendMeasure(state, team.id, DesperateMeasure.YOU_DOPE)) {
        continue;
      }
      grantStat(state, player, stat, delta);
      getMatchInducements(state).dopedPlayerIds.push(player.id);
      announce(context, `You Dope!: ${player.playerName} gains +1 ${stat}`);
    }
  }
}

/**
 * You Dope! at the end of each drive the player played: a D6, and on 1 or 2
 * they are Knocked-out and cannot recover this end of drive.
 */
export function rollYouDopeCollapse(
  state: GameState,
  dice: DiceController,
  players: Player[]
): Player[] {
  const mi = state.matchInducements;
  if (!mi) return [];
  const collapsed = players.filter(
    (p) =>
      mi.dopedPlayerIds.includes(p.id) &&
      !!p.gridPosition &&
      dice.rollD6(`You Dope! (${p.playerName})`, p.teamId) <= 2
  );
  mi.noRecoveryPlayerIds = collapsed.map((p) => p.id);
  return collapsed;
}

/** Validate a choice answer against its request; null when it is illegal. */
export function validChoiceAnswer(
  request: InducementChoiceDecisionRequest,
  answer: InducementChoiceDecisionAnswer
): InducementChoiceDecisionAnswer | null {
  if (request.kind === "sports-wizard") return validSpell(request, answer);
  if (answer.playerId === undefined) return request.optional ? {} : null;
  if (!request.playerIds.includes(answer.playerId)) return null;
  switch (request.kind) {
    case "intensive-training":
      return offered(answer.skill, request.skills) ? answer : null;
    case "you-dope":
      return offered(answer.stat, request.stats) ? answer : null;
    case "iron-man":
    case "knuckle-dusters":
    case "hangover":
    case "team-captain":
      return answer;
  }
}

/** The answer names one of the request's options. */
function offered<T>(choice: T | undefined, options: T[] | undefined): boolean {
  return choice !== undefined && !!options?.includes(choice);
}

/** No spell keeps the wizard; Zap! names an offered player, Fireball a square. */
function validSpell(
  request: InducementChoiceDecisionRequest,
  answer: InducementChoiceDecisionAnswer
): InducementChoiceDecisionAnswer | null {
  if (answer.spell === undefined) return {};
  if (!request.spells?.includes(answer.spell)) return null;
  if (answer.spell === "zap") {
    return answer.playerId !== undefined &&
      request.playerIds.includes(answer.playerId)
      ? { spell: "zap", playerId: answer.playerId }
      : null;
  }
  const square = answer.square;
  return square &&
    Number.isInteger(square.x) &&
    Number.isInteger(square.y) &&
    square.x >= 0 &&
    square.y >= 0 &&
    square.x < GameConfig.PITCH_WIDTH &&
    square.y < GameConfig.PITCH_HEIGHT
    ? { spell: "fireball", square: { x: square.x, y: square.y } }
    : null;
}
