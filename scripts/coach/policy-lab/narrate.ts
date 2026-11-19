import { GameEventNames } from "../../../src/types/events";
import { PlayerStatus } from "../../../src/types/Player";
import type { Player } from "../../../src/types/Player";
import { GameConfig } from "../../../src/config/GameConfig";
import type { HeadlessGame } from "../../../src/headless/HeadlessGame";
import type { MatchRecording } from "../../../src/simulation/runMatch";
import { openTrace } from "../catalogue-study/replay";
import { argument, isEntry, replaySteps } from "./lab";

const WIDTH = GameConfig.PITCH_WIDTH;
const HEIGHT = GameConfig.PITCH_HEIGHT;
const EMPTY = " .";

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
  return [game.ctx.team1, game.ctx.team2] as const;
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
  return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT;
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
  const grid = Array.from({ length: HEIGHT }, () =>
    Array.from({ length: WIDTH }, () => EMPTY)
  );
  placePlayers(game, grid);
  placeBall(game, grid);
  const header = Array.from({ length: WIDTH }, (_, x) =>
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
      `      block ${name(d.attackerId)} -> ${name(d.defenderId)} ${String(d.numDice)}d ${picks}${JSON.stringify(d.results)} kept ${JSON.stringify(d.selectedResult ?? null)}`
    );
  });
  bus.on(GameEventNames.PlayerKnockedDown, ({ playerId }) =>
    lines.push(`      down ${name(playerId)}`)
  );
  bus.on(GameEventNames.PlayerCasualtyInflicted, ({ victimId }) =>
    lines.push(`      casualty ${name(victimId)}`)
  );
  bus.on(GameEventNames.Turnover, () => lines.push("      TURNOVER"));
  bus.on(GameEventNames.Touchdown, ({ teamId }) =>
    lines.push(`      TOUCHDOWN ${sideLetter(teamId === home ? 0 : 1)}`)
  );
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

async function narrate(file: string): Promise<string> {
  const { recording, game } = openTrace(file);
  const [home, away] = recording.rosters;
  const narration: Narration = {
    game,
    lines: [
      `${home} (A, scores at x=${String(WIDTH - 1)}) vs ${away} (b, scores at x=0), final ${JSON.stringify(recording.final.score)}`,
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
  return narration.lines.join("\n");
}

if (isEntry(import.meta.url)) {
  console.log = () => undefined;
  process.stdout.write(`${await narrate(argument(2))}\n`);
}
