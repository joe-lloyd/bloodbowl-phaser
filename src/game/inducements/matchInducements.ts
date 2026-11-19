import { type GameState } from "@/types/GameState";
import { Inducement, PrayerToNuffle } from "@/types/Inducements";
import {
  type Player,
  PlayerCondition,
  type PlayerStats,
  PlayerStatus,
  addCondition,
  hasCondition,
  hasTackleZone,
  removeCondition,
} from "@/types/Player";
import { type Skill, SkillType, getSkill, hasSkill } from "@/types/Skills";
import { type Team } from "@/types/Team";
import {
  type DopeStat,
  type InducementChoiceDecisionAnswer,
  type InducementChoiceDecisionRequest,
  type ReactionDecisionAnswer,
} from "@/types/decisions";
import { GameEventNames } from "@/types/events";
import { GameConfig, isTrapdoorSquare } from "@/config/GameConfig";
import { GameOperation } from "../core/GameOperation";
import { type FlowContext } from "../core/GameFlowManager";
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

export type MatchGrant =
  | { kind: "skill"; playerId: string; skill: SkillType }
  | { kind: "stat"; playerId: string; stat: "AV" | DopeStat; delta: number };

export interface FrogRecord {
  playerId: string;
  stats: PlayerStats;
  skills: Skill[];
}

export interface MatchInducementsState {
  rolled: boolean;
  prayers: Record<string, PrayerToNuffle[]>;
  measures: Record<string, HeldMeasure[]>;
  grants: MatchGrant[];

  dopedPlayerIds: string[];

  noRecoveryPlayerIds: string[];

  sportsWizards?: string[];

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

export function prayerInPlay(
  state: GameState,
  prayer: PrayerToNuffle
): boolean {
  return Object.values(state.matchInducements?.prayers ?? {}).some((held) =>
    held.includes(prayer)
  );
}

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

export function foulSpent(state: GameState, teamId: string): boolean {
  return (
    state.turn.hasFouled &&
    !holdsMeasure(state, teamId, DesperateMeasure.GRUDGE_MATCH)
  );
}

export function rushModifier(state: GameState, player: Player): number {
  const moles = Object.entries(state.matchInducements?.prayers ?? {}).some(
    ([teamId, held]) =>
      teamId !== player.teamId &&
      held.includes(PrayerToNuffle.MOLES_UNDER_THE_PITCH)
  );
  return weatherEffects(state.weather).rush - (moles ? 1 : 0);
}

export function underScrutiny(state: GameState, foulerTeamId: string): boolean {
  return Object.entries(state.matchInducements?.prayers ?? {}).some(
    ([teamId, held]) =>
      teamId !== foulerTeamId && held.includes(PrayerToNuffle.UNDER_SCRUTINY)
  );
}

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

function grantSportsWizard(state: GameState, teamId: string): void {
  const mi = getMatchInducements(state);
  mi.sportsWizards = [...(mi.sportsWizards ?? []), teamId];
}

export function holdsSportsWizard(state: GameState, teamId: string): boolean {
  return state.matchInducements?.sportsWizards?.includes(teamId) ?? false;
}

export function spendSportsWizard(state: GameState, teamId: string): void {
  const mi = getMatchInducements(state);
  mi.sportsWizards = (mi.sportsWizards ?? []).filter((id) => id !== teamId);
}

export function turnIntoFrog(state: GameState, player: Player): void {
  const mi = getMatchInducements(state);
  if (hasCondition(player, PlayerCondition.FROG)) return;
  mi.frogs = [
    ...(mi.frogs ?? []),
    { playerId: player.id, stats: { ...player.stats }, skills: player.skills },
  ];

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

function availablePlayers(team: Team): Player[] {
  return team.players.filter(
    (p) =>
      p.playerKind !== "star" &&
      p.status !== PlayerStatus.INJURED &&
      p.status !== PlayerStatus.DEAD &&
      p.status !== PlayerStatus.REMOVED
  );
}

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

function blessRandomPlayer(
  context: FlowContext,
  team: Team,
  pool: Player[],
  prayer:
    | typeof PrayerToNuffle.STILETTO
    | typeof PrayerToNuffle.BLESSING_OF_NUFFLE
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
      const held = rollDesperateMeasures(
        dice,
        team.id,
        countBought(state, team.id, Inducement.DESPERATE_MEASURES)
      ).map((measure) => ({ measure, used: false }));
      mi.measures[team.id] = held;
      for (const measure of held) {
        announce(context, `${team.name} holds ${measure.measure}`);
      }
    }
    for (const team of teams) {
      for (const prayer of mi.prayers[team.id] ?? []) {
        await applyPrayer(context, team, prayer);
      }
    }
    for (const team of teams) {
      await offerHangover(context, team);
    }

    for (const team of teams) {
      if (spendMeasure(state, team.id, DesperateMeasure.MAGIC_SCROLL)) {
        grantSportsWizard(state, team.id);
        announce(context, `Magic Scroll: ${team.name} gains a Sports-Wizard`);
      }
    }
  }
}

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

function offered<T>(choice: T | undefined, options: T[] | undefined): boolean {
  return choice !== undefined && !!options?.includes(choice);
}

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
