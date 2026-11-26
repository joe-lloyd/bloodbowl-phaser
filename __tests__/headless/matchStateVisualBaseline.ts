import { GameConfig } from "../../src/config/GameConfig";
import { type GameState } from "../../src/types/GameState";
import { type Player } from "../../src/types/Player";
import {
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../../src/game/presentation/boardState";

const W = GameConfig.PITCH_WIDTH * GameConfig.SQUARE_SIZE;
const H = GameConfig.PITCH_HEIGHT * GameConfig.SQUARE_SIZE;
const S = GameConfig.SQUARE_SIZE;

const centre = (n: number) => n * S + S / 2;

export interface BaselineInput {
  state: Pick<GameState, "ballPosition" | "turn">;
  players: Player[];

  team1Id: string;
}

export function renderMatchStateBaseline(input: BaselineInput): string {
  const { state, players, team1Id } = input;

  const grid =
    Array.from(
      { length: GameConfig.PITCH_WIDTH + 1 },
      (_, x) => `M${String(x * S)} 0V${String(H)}`
    ).join("") +
    Array.from(
      { length: GameConfig.PITCH_HEIGHT + 1 },
      (_, y) => `M0 ${String(y * S)}H${String(W)}`
    ).join("");

  const marks: string[] = [];

  const sorted = players.toSorted((a, b) => a.id.localeCompare(b.id));
  for (const player of sorted) {
      const location = resolvePlayerLocation(player);
      if (location.kind !== "pitch") {
        marks.push(
          `  <text class="box" data-player="${player.id}" data-box="${location.box}">${player.id}</text>`
        );
        continue;
      }
      const activated = isActivatedThisTurn(state, player.id);
      marks.push(
        `  <circle cx="${String(centre(location.square.x))}" cy="${String(
          centre(location.square.y)
        )}" r="21" fill="${
          player.teamId === team1Id ? "#cc2222" : "#2244cc"
        }" stroke="#ffffff" stroke-width="3" opacity="${
          activated ? "0.5" : "1"
        }" data-player="${player.id}"/>`
      );
    }

  const ball = resolveBallRepresentation(state, players);
  if (ball.kind === "loose") {
    marks.push(
      `  <ellipse cx="${String(centre(ball.square.x))}" cy="${String(
        centre(ball.square.y)
      )}" rx="24" ry="16" fill="#8b4513" stroke="#000000" stroke-width="1.5" data-ball="loose"/>`
    );
  } else if (ball.kind === "carried") {
    marks.push(
      `  <circle cx="${String(centre(ball.square.x) + 16)}" cy="${String(
        centre(ball.square.y) - 16
      )}" r="9" fill="#8b4513" stroke="#ffffff" stroke-width="2" data-ball="carried" data-carrier="${
        ball.playerId
      }"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(H)}" viewBox="0 0 ${String(W)} ${String(H)}">
  <rect width="${String(W)}" height="${String(H)}" fill="#2d5016"/>
  <rect width="${String(S)}" height="${String(H)}" fill="#ffffff" fill-opacity=".08"/>
  <rect x="${String(W - S)}" width="${String(S)}" height="${String(H)}" fill="#ffffff" fill-opacity=".08"/>
  <path d="${grid}" stroke="#ffffff" stroke-opacity=".28" fill="none"/>
${marks.join("\n")}
</svg>`;
}
