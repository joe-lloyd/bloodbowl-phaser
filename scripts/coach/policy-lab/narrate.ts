import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import type { Player } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";
import { activeLayout } from "../../../src/game/variants/activeMatch";
import { squareAt } from "../../../src/game/rules/frames";
import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { openTrace } from "../catalogue-study/replay";
import { argument, isEntry, replaySteps, verifiedHash } from "./lab";

const width = () => GameConfig.PITCH_WIDTH;
const height = () => GameConfig.PITCH_HEIGHT;
const EMPTY = " .";
const OBSTACLE = "##";

const STATUS_MARK: Partial<Record<PlayerStatus, string>> = {
  [PlayerStatus.PRONE]: "_",
  [PlayerStatus.STUNNED]: "~",
};

type Step = MatchRecording["steps"][number];

interface Narration {
  game: HeadlessGame;
  lines: string[];
}

const sideLetter = (side: number) => (side === 0 ? "A" : "b");

function teamsOf(game: HeadlessGame) {
  return [game.ctx.teams[0], game.ctx.teams[1]] as const;
}

function playerName(game: HeadlessGame, id: string): string {
  for (const [side, team] of teamsOf(game).entries()) {
    const player = team.players.find((p) => p.id === id);
    if (player)
      return `${sideLetter(side)}:${player.positionName}#${id.split("-").at(-1) ?? ""}`;
  }
  return id;
}

function letter(player: Player, side: number): string {
  const initial = (player.positionName.split(" ").at(-1) ?? "?").charAt(0);
  return side === 0 ? initial.toUpperCase() : initial.toLowerCase();
}

function onPitch(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width() && y < height();
}

function cell(game: HeadlessGame, player: Player, side: number): string {
  const ball = game.ctx.gameService.getState().ballPosition;
  const at = player.gridPosition;
  const carrying = !!ball && ball.x === at?.x && ball.y === at.y;
  const mark = STATUS_MARK[player.status] ?? (carrying ? "@" : " ");
  return mark + letter(player, side);
}

function placePlayers(game: HeadlessGame, grid: string[][]): void {
  for (const [side, team] of teamsOf(game).entries())
    for (const player of team.players) {
      const at = player.gridPosition;
      const row = at && onPitch(at.x, at.y) ? grid[at.y] : undefined;
      if (at && row) row[at.x] = cell(game, player, side);
    }
}

function placeBall(game: HeadlessGame, grid: string[][]): void {
  const ball = game.ctx.gameService.getState().ballPosition;
  const row = ball ? grid[ball.y] : undefined;
  if (ball && row?.[ball.x] === EMPTY) row[ball.x] = " *";
}

function board(game: HeadlessGame): string {
  const grid = Array.from({ length: height() }, () =>
    Array.from({ length: width() }, () => EMPTY)
  );
  for (const { x, y } of activeLayout().obstacles) {
    const row = grid[y];
    if (row) row[x] = OBSTACLE;
  }
  placePlayers(game, grid);
  placeBall(game, grid);
  const header = Array.from({ length: width() }, (_, x) =>
    String(x % 10).padStart(2)
  ).join("");
  return [
    `   ${header}`,
    ...grid.map((row, y) => `${String(y).padStart(2)} ${row.join("")}`),
  ].join("\n");
}

function turnHeader(game: HeadlessGame): string {
  const state = game.ctx.gameService.getState();
  const [home, away] = teamsOf(game);
  const side = state.activeTeamId === home.id ? 0 : 1;
  const half = state.turn.isHalf2 ? "H2" : "H1";
  const score = `${String(state.score[home.id])}-${String(state.score[away.id])}`;
  return `\n=== ${half} T${String(state.turn.turnNumber)} ${sideLetter(side)} to play, score ${score}`;
}

function listen({ game, lines }: Narration): void {
  const bus = game.ctx.eventBus;
  const name = (id: string) => playerName(game, id);
  const home = teamsOf(game)[0].id;
  bus.on(GameEventNames.TurnStarted, () => {
    lines.push(turnHeader(game), board(game));
  });
  bus.on(GameEventNames.DiceRoll, (d) => {
    if (d.rollType === "Block") return;
    const result =
      d.resultState && d.resultState !== "none" ? ` ${d.resultState}` : "";
    lines.push(
      `      roll ${d.rollType} = ${JSON.stringify(d.value)}${result}`
    );
  });
  bus.on(GameEventNames.BlockDiceKept, (d) => {
    const picks = d.isAttackerChoice ? "" : "(defender picks) ";
    lines.push(
      `      block ${name(d.attackerId)} -> ${name(d.defenderId)} ${String(d.numDice)}d ${picks}${JSON.stringify(d.results)}${d.selectedResult === undefined ? "" : ` kept ${JSON.stringify(d.selectedResult)}`}`
    );
  });
  bus.on(GameEventNames.PlayerKnockedDown, ({ playerId }) => {
    lines.push(`      down ${name(playerId)}`);
  });
  bus.on(GameEventNames.PlayerCasualtyInflicted, ({ victimId }) => {
    lines.push(`      casualty ${name(victimId)}`);
  });
  bus.on(GameEventNames.Turnover, () => {
    lines.push("      TURNOVER");
  });
  bus.on(GameEventNames.Touchdown, ({ teamId }) => {
    lines.push(`      TOUCHDOWN ${sideLetter(teamId === home ? 0 : 1)}`);
  });
}

function describe({ game, lines }: Narration, step: Step): void {
  if (game.ctx.gameService.getState().phase !== "PLAY") return;
  const command = step.command;
  if (command.type !== "declare-action") return;
  const note = step.note ?? step.label;
  lines.push(
    `  ${sideLetter(step.team)} ${playerName(game, command.playerId)} ${command.action}: ${note}`
  );
}

function pitchNote(): string {
  const layout = activeLayout();
  const barricades = layout.barricades.map(
    ({ afterColumn, rows }) =>
      `between x=${String(afterColumn)} and ${String(afterColumn + 1)} on rows ${String(rows.min)}-${String(rows.max)}`
  );
  const lines = layout.frames
    .map((frame) => `x=${String(squareAt(frame, frame.arm.scrimmage, 0).x)}`)
    .join(" and ");
  return `${layout.label}, ${String(layout.cols)} x ${String(layout.rows)}, Lines of Scrimmage at ${lines}${layout.walledSidelines ? ", walled sidelines" : ""}${barricades.length > 0 ? `, barricades ${barricades.join("; ")}` : ""}`;
}

async function narrate(file: string): Promise<string> {
  const { recording, game } = openTrace(file);
  const [home, away] = recording.rosters;
  const narration: Narration = {
    game,
    lines: [
      `${home} (A, scores at x=${String(width() - 1)}) vs ${away} (b, scores at x=0), final ${JSON.stringify(recording.final.score)}`,
      pitchNote(),
    ],
  };
  listen(narration);
  await replaySteps({
    game,
    recording,
    before: (step) => {
      describe(narration, step);
    },
  });
  verifiedHash(game, recording, "Narration");
  return narration.lines.join("\n");
}

if (isEntry(import.meta.url)) {
  console.log = () => undefined;
  process.stdout.write(`${await narrate(argument(2))}\n`);
}
