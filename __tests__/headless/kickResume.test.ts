import { describe, expect, it } from "vitest";
import { matchSaveSchema } from "../../src/boundary/schemas/MatchSave";
import { KickoffEvent } from "../../src/game/kickoff/kickoffEvents";
import { KICKOFF_TABLES } from "../../src/game/kickoff/kickoffTables";
import { kickoffTurnPlay } from "../../src/game/kickoff/kickoffTurn";
import { kickoffTurnOf } from "../../src/game/kickoff/kickRecord";
import { SetupManager } from "../../src/game/managers/SetupManager";
import { FormationManager } from "../../src/game/managers/FormationManager";
import { TeamFactory } from "../../src/game/TeamFactory";
import { isStandableSquare } from "../../src/game/rules/pitchSquares";
import { activateMatchFormat, activeLayout } from "../../src/game/variants/activeMatch";
import type { KickoffTableId } from "../../src/game/variants/gameTypeRules";
import { stateChecksum } from "../../src/headless/checksum";
import { HeadlessGame } from "../../src/headless/HeadlessGame";
import type { HeadlessCommand, PendingDecision } from "../../src/headless/protocol";
import type { MatchSave } from "../../src/headless/serialization";
import { restoreEngine } from "../../src/network/LockstepSession";
import { GameService } from "../../src/services/GameService";
import { fixtureValue } from "../../src/testing/fixtureValue";
import { GamePhase, SubPhase } from "../../src/types/GameState";
import { PlayerStatus } from "../../src/types/Player";
import { RosterName } from "../../src/types/Team";
import { playgroundEvent } from "../../src/data/kickoffPlayground";

const TABLES = [
  "sevens",
  "street-bowl",
  "beach-bowl",
  "gutter-street",
  "gutter-sewer",
] as const satisfies readonly KickoffTableId[];

const EVENTS = TABLES.flatMap((table) =>
  [...new Set(Object.values(KICKOFF_TABLES[table]))].map((event) => ({
    table,
    event,
  }))
);

const PACE: Record<string, number> = { "900": 2, "1000": 2, "800": 2, "200": 2 };

type Watch = (ms: number) => void;

interface Moment {
  label: string;
  save: MatchSave;
  pending: PendingDecision | null;
  checksum: string;
  kicks: number;
}

function delayFor(watch: { onDelay: Watch }) {
  return async (ms: number) => {
    watch.onDelay(ms);
    await new Promise((resolve) => setTimeout(resolve, PACE[String(ms)] ?? 0));
  };
}

function line(isTeam1: boolean) {
  return new FormationManager()
    .getDefaultFormation(isTeam1)
    .map(({ x, y }) => ({ x, y }));
}

function freshGame(table: KickoffTableId, seed: number, watch: { onDelay: Watch }) {
  const { format } = playgroundEvent(table, KickoffEvent.CHARGE);
  activateMatchFormat(format);
  const team1 = TeamFactory.createTestTeam(RosterName.HUMAN, "One", 1);
  const team2 = TeamFactory.createTestTeam(RosterName.ORC, "Two", 2);
  for (const [index, team] of [team1, team2].entries()) {
    team.id = `team${String(index + 1)}`;
    for (const [at, player] of team.players.entries()) {
      player.id = `${team.id}-${String(at)}`;
      player.teamId = team.id;
      player.skills = [];
    }
    SetupManager.sanitizeTeam(team);
    team.rerolls = 0;
    for (const [at, square] of line(index === 0).entries()) {
      const player = fixtureValue(team.players[at]);
      player.gridPosition = { ...square };
      player.status = PlayerStatus.ACTIVE;
    }
  }
  const initialState = {
    ...GameService.createInitialState({
      team1,
      team2,
      startingPhase: GamePhase.KICKOFF,
      startingSubPhase: SubPhase.ROLL_KICKOFF,
    }),
    ...format,
    activeTeamId: "team2",
  };
  return new HeadlessGame({
    team1,
    team2,
    initialState,
    seed,
    kickingTeamId: "team1",
    delay: delayFor(watch),
  });
}

const quiet = async (game: HeadlessGame) => {
  for (let i = 0; i < 400; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    const { gameService } = game.ctx;
    const waiting =
      gameService.kickInTheAir() !== null && !gameService.getKickoffEventStep();
    if (!waiting) break;
  }
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};

const teamOf = (game: HeadlessGame, teamId: string) =>
  fixtureValue(game.ctx.gameService.getTeam(teamId));

function freeNeighbour(game: HeadlessGame, at: { x: number; y: number }) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as const) {
    const square = { x: at.x + dx, y: at.y + dy };
    const taken = game.ctx.gameService.getPlayerAt(square.x, square.y);
    if (!taken && isStandableSquare(square)) return square;
  }
  return null;
}

async function answer(game: HeadlessGame, pending: PendingDecision): Promise<HeadlessCommand> {
  switch (pending.type) {
    case "kickoff-event":
      return chooseStep(game, pending);
    case "touchback": {
      const taker = teamOf(game, pending.teamId).players.find(
        (p) => p.gridPosition && p.status === PlayerStatus.ACTIVE
      );
      return { type: "touchback", playerId: fixtureValue(taker).id };
    }
    case "reroll":
      return { type: "use-reroll", accept: false };
    case "reaction":
      return { type: "use-reaction", accept: false };
    case "inducement-choice":
      return { type: "choose-inducement" };
    case "apothecary":
      return { type: "use-apothecary", accept: false };
    case "block-dice":
    case "push-direction":
    case "follow-up":
    case "interception":
    case "bite-target":
    case "foul-assists":
      throw new Error(`no answer for ${pending.type}`);
  }
}

async function chooseStep(
  game: HeadlessGame,
  pending: Extract<PendingDecision, { type: "kickoff-event" }>
): Promise<HeadlessCommand> {
  const { selectedPlayerIds, selectionLimit, landingSquare, chooserTeamId } = pending;
  const [picked] = selectedPlayerIds;
  if (landingSquare && picked)
    return { type: "kickoff-place-player", playerId: picked, ...landingSquare };
  const wanted = landingSquare ? 1 : Math.min(2, selectionLimit);
  if (selectedPlayerIds.length >= wanted) return { type: "kickoff-confirm" };
  for (const player of teamOf(game, chooserTeamId).players) {
    if (selectedPlayerIds.includes(player.id) || !player.gridPosition) continue;
    const chosen = await game.execute({ type: "kickoff-select-player", playerId: player.id });
    if (chosen.ok) await game.execute({ type: "kickoff-select-player", playerId: player.id });
    if (chosen.ok) return { type: "kickoff-select-player", playerId: player.id };
  }
  return { type: "kickoff-skip" };
}

function playTurn(game: HeadlessGame): HeadlessCommand {
  const gs = game.ctx.gameService;
  const state = gs.getState();
  const turn = fixtureValue(kickoffTurnOf(state) ?? undefined);
  const active = state.activePlayer;
  if (active && gs.getMovementUsed(active.id) > 0)
    return { type: "end-activation", playerId: active.id };
  const next = turn.playerIds.find((id) => !state.turn.activatedPlayerIds.has(id));
  const at = next ? gs.getPlayerById(next)?.gridPosition : undefined;
  const square = at && freeNeighbour(game, at);
  if (!next || !square) return { type: "end-turn" };
  if (turn.play.kind === "one-square")
    return { type: "kickoff-move-player", playerId: next, ...square };
  if (!turn.play.actions.includes("move"))
    return { type: "end-activation", playerId: next };
  return active
    ? { type: "move", playerId: next, path: [square] }
    : { type: "declare-action", playerId: next, action: "move" };
}

interface Script {
  kicks: number;
  reselected: boolean;
}

function aim(kicker: string, corner: boolean) {
  const { cols, rows } = activeLayout();
  const y = Math.floor(rows / 2);
  if (kicker === "team2") return { x: 3, y };
  return corner ? { x: cols - 1, y: 0 } : { x: cols - 4, y };
}

async function nextCommand(game: HeadlessGame, script: Script, corner: boolean): Promise<HeadlessCommand | "next-drive" | null> {
  const pending = game.pendingDecision();
  if (pending) return answer(game, pending);
  const state = game.ctx.gameService.getState();
  if (kickoffTurnOf(state)) {
    if (!script.reselected && game.ctx.gameService.getKickoffEventStep()?.canReselect) {
      script.reselected = true;
      return { type: "kickoff-reselect" };
    }
    return playTurn(game);
  }
  if (state.phase === GamePhase.KICKOFF && !state.kick) {
    script.kicks++;
    const kicker = script.kicks === 1 ? "team1" : "team2";
    const player = fixtureValue(teamOf(game, kicker).players.find((p) => p.gridPosition));
    return { type: "kick-ball", playerId: player.id, ...aim(kicker, corner) };
  }
  return script.kicks >= 2 ? null : "next-drive";
}

function nextDrive(game: HeadlessGame): void {
  const gs = game.ctx.gameService;
  gs.resetDriveState();
  for (const [index, team] of [game.ctx.team1, game.ctx.team2].entries()) {
    const fit = team.players.filter(
      ({ status }) =>
        status === PlayerStatus.ACTIVE ||
        status === PlayerStatus.RESERVE ||
        status === PlayerStatus.PRONE ||
        status === PlayerStatus.STUNNED
    );
    for (const player of team.players) delete player.gridPosition;
    for (const [at, square] of line(index === 0).entries()) {
      const player = fit[at];
      if (!player) continue;
      player.gridPosition = { ...square };
      player.status = PlayerStatus.ACTIVE;
    }
  }
  const state = gs.getState();
  state.phase = GamePhase.KICKOFF;
  state.subPhase = SubPhase.ROLL_KICKOFF;
  state.activeTeamId = "team1";
}

async function play(
  game: HeadlessGame,
  options: { script: Script; corner: boolean; atRest?: (label: string, script: Script) => void }
): Promise<string> {
  const { script, corner, atRest } = options;
  for (let guard = 0; guard < 80; guard++) {
    await quiet(game);
    const command = await nextCommand(game, { ...script }, corner);
    if (command === null) return stateChecksum(game);
    if (command === "next-drive") {
      nextDrive(game);
      continue;
    }
    const phase = game.snapshot().kick?.stage ?? "selecting kicker";
    atRest?.(`${phase} before ${command.type}`, script);
    if (command.type === "kick-ball") script.kicks++;
    if (command.type === "kickoff-reselect") script.reselected = true;
    const response = await game.execute(command);
    if (!response.ok) throw new Error(`${command.type}: ${String(response.reason)}`);
  }
  throw new Error("the script never finished");
}

function momentOf(game: HeadlessGame, label: string, script: Script): Moment & { reselected: boolean } {
  return {
    label,
    save: matchSaveSchema.parse(structuredClone(game.matchSave())),
    pending: structuredClone(game.pendingDecision()),
    checksum: stateChecksum(game),
    kicks: script.kicks,
    reselected: script.reselected,
  };
}

const MID_AIR = new Set([900, 800, 1000, 200]);

async function uninterrupted(table: KickoffTableId, seed: number, corner: boolean) {
  const moments: ReturnType<typeof momentOf>[] = [];
  const script: Script = { kicks: 0, reselected: false };
  const watch: { onDelay: Watch } = { onDelay: () => undefined };
  const game = freshGame(table, seed, watch);
  watch.onDelay = (ms) => {
    const stage = game.ctx.gameService.getState().kick?.stage;
    if (stage && MID_AIR.has(ms) && !game.ctx.gameService.isKickoffTableResolving())
      moments.push(momentOf(game, `${stage} during ${String(ms)} ms`, script));
  };
  const final = await play(game, {
    script,
    corner,
    atRest: (label) => moments.push(momentOf(game, label, script)),
  });
  watch.onDelay = () => undefined;
  return { moments, final };
}

async function restored(moment: ReturnType<typeof momentOf>, corner: boolean): Promise<string> {
  const game = new HeadlessGame({
    matchSave: structuredClone(moment.save),
    delay: delayFor({ onDelay: () => undefined }),
  });
  return play(game, { script: { kicks: moment.kicks, reselected: moment.reselected }, corner });
}

async function resynced(
  table: KickoffTableId,
  { moment, stale, corner }: { moment: ReturnType<typeof momentOf>; stale: ReturnType<typeof momentOf>; corner: boolean }
): Promise<string> {
  const game = freshGame(table, 1, { onDelay: () => undefined });
  const state = (from: ReturnType<typeof momentOf>) => ({
    snapshot: { ...structuredClone(from.save.snapshot), ...(from.save.turnManager && { turnManager: from.save.turnManager }) },
    teams: structuredClone(from.save.teams),
    pending: structuredClone(from.pending),
    rng: structuredClone(from.save.rng),
    matchStats: structuredClone(from.save.matchStats),
    checksum: from.checksum,
  });
  restoreEngine(game, state(stale));
  await quiet(game);
  restoreEngine(game, state(moment));
  return play(game, { script: { kicks: moment.kicks, reselected: moment.reselected }, corner });
}

async function seedFor(table: KickoffTableId, event: KickoffEvent): Promise<number> {
  for (let seed = 1; seed < 400; seed++) {
    const game = freshGame(table, seed, { onDelay: () => undefined });
    await game.execute({
      type: "kick-ball",
      playerId: "team1-0",
      ...aim("team1", false),
    });
    await quiet(game);
    const { kick } = game.ctx.gameService.getState();
    const step = game.pendingDecision()?.type === "kickoff-event";
    if (kick?.resolution?.event !== event) continue;
    if (event === KickoffEvent.HIGH_KICK && !step) continue;
    return seed;
  }
  throw new Error(`no seed rolls ${event} on ${table}`);
}

async function touchbackSeed(table: KickoffTableId): Promise<number> {
  for (let seed = 1; seed < 200; seed++) {
    const { moments } = await uninterrupted(table, seed, true);
    if (moments.some(({ pending }) => pending?.type === "touchback")) return seed;
  }
  throw new Error("no touchback");
}

async function sweep(table: KickoffTableId, seed: number, corner: boolean) {
  const { moments, final } = await uninterrupted(table, seed, corner);
  const stale = [moments[0], moments.find(({ pending }) => pending !== null), moments.at(-1)];
  const failures: string[] = [];
  for (const moment of moments) {
    const saved = await restored(moment, corner).catch(String);
    if (saved !== final) failures.push(`save at ${moment.label}: ${saved}`);
    for (const peer of stale) {
      if (!peer) continue;
      const synced = await resynced(table, { moment, stale: peer, corner }).catch(String);
      if (synced !== final)
        failures.push(`resync at ${moment.label} over ${peer.label}: ${synced}`);
    }
  }
  return { failures, labels: moments.map(({ label }) => label) };
}

describe("a kick-off restored at every stage", () => {
  const expectedStops = (event: KickoffEvent) => {
    if (event === KickoffEvent.HIGH_KICK)
      return ["high-kick before kickoff-select-player", "high-kick before kickoff-place-player"];
    return kickoffTurnPlay(event)
      ? [
          ...(event === KickoffEvent.GET_READY_LADS
            ? []
            : ["coach before kickoff-select-player"]),
          "coach before kickoff-confirm",
          "coach before kickoff-reselect",
        ]
      : [];
  };

  it.each(EVENTS)(
    "$event on the $table table finishes as if it had never stopped",
    async ({ table, event }) => {
      const { failures, labels } = await sweep(table, await seedFor(table, event), false);
      expect(failures).toEqual([]);
      expect(labels).toEqual(
        expect.arrayContaining([
          "selecting kicker before kick-ball",
          "event during 900 ms",
          "landing during 1000 ms",
          "placing during 200 ms",
          ...expectedStops(event),
        ])
      );
    },
    300_000
  );

  it.each(TABLES)(
    "a touchback on the %s table finishes as if it had never stopped",
    async (table) => {
      const { failures, labels } = await sweep(table, await touchbackSeed(table), true);
      expect(failures).toEqual([]);
      expect(labels).toContain("landed before touchback");
    },
    300_000
  );
});
