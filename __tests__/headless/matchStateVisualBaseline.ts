import { GameConfig } from "../../src/config/GameConfig";
import { GameState } from "../../src/types/GameState";
import { Player } from "../../src/types/Player";
import {
  isActivatedThisTurn,
  resolveBallRepresentation,
  resolvePlayerLocation,
} from "../../src/game/presentation/boardState";

/**
 * Deterministic fixed-viewport render of a match checkpoint, used as a
 * screenshot baseline.
 *
 * It draws ONLY what the scene's reconcilers resolve — `resolvePlayerLocation`,
 * `resolveBallRepresentation` and `isActivatedThisTurn` — so a regression that
 * would put a second ball on the pitch, leave a knocked-out player on their
 * square, or drop the activated treatment after a restore changes the image.
 *
 * Fixed 1200×660 viewport, fixed camera (whole pitch), fixed palette, no fonts
 * and no timing: the render is a pure function of canonical state, so it is
 * stable across platforms and needs no browser.
 */

const W = GameConfig.PITCH_WIDTH * GameConfig.SQUARE_SIZE; // 1200
const H = GameConfig.PITCH_HEIGHT * GameConfig.SQUARE_SIZE; // 660
const S = GameConfig.SQUARE_SIZE;

const centre = (n: number) => n * S + S / 2;

export interface BaselineInput {
  state: Pick<GameState, "ballPosition" | "turn">;
  players: Player[];
  /** Colour key: which team each player belongs to. */
  team1Id: string;
}

export function renderMatchStateBaseline(input: BaselineInput): string {
  const { state, players, team1Id } = input;

  const grid =
    Array.from({ length: GameConfig.PITCH_WIDTH + 1 }, (_, x) =>
      `M${x * S} 0V${H}`
    ).join("") +
    Array.from({ length: GameConfig.PITCH_HEIGHT + 1 }, (_, y) =>
      `M0 ${y * S}H${W}`
    ).join("");

  const marks: string[] = [];

  // Players, in a stable id order so the document never reorders.
  [...players]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((player) => {
      const location = resolvePlayerLocation(player);
      if (location.kind !== "pitch") {
        // Off the pitch: drawn only as a box tag, never as a pitch counter.
        marks.push(
          `  <text class="box" data-player="${player.id}" data-box="${location.box}">${player.id}</text>`
        );
        return;
      }
      const activated = isActivatedThisTurn(state, player.id);
      marks.push(
        `  <circle cx="${centre(location.square.x)}" cy="${centre(
          location.square.y
        )}" r="21" fill="${
          player.teamId === team1Id ? "#cc2222" : "#2244cc"
        }" stroke="#ffffff" stroke-width="3" opacity="${
          activated ? "0.5" : "1"
        }" data-player="${player.id}"/>`
      );
    });

  // Exactly one ball mark, ever: loose ball OR a carrier badge.
  const ball = resolveBallRepresentation(state, players);
  if (ball.kind === "loose") {
    marks.push(
      `  <ellipse cx="${centre(ball.square.x)}" cy="${centre(
        ball.square.y
      )}" rx="24" ry="16" fill="#8b4513" stroke="#000000" stroke-width="1.5" data-ball="loose"/>`
    );
  } else if (ball.kind === "carried") {
    marks.push(
      `  <circle cx="${centre(ball.square.x) + 16}" cy="${
        centre(ball.square.y) - 16
      }" r="9" fill="#8b4513" stroke="#ffffff" stroke-width="2" data-ball="carried" data-carrier="${
        ball.playerId
      }"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#2d5016"/>
  <rect width="${S}" height="${H}" fill="#ffffff" fill-opacity=".08"/>
  <rect x="${W - S}" width="${S}" height="${H}" fill="#ffffff" fill-opacity=".08"/>
  <path d="${grid}" stroke="#ffffff" stroke-opacity=".28" fill="none"/>
${marks.join("\n")}
</svg>`;
}
