import type { Player, PlayerAppearance } from "../../types/Player";
import { lookOptions } from "../presentation/layered/layeredModels";
import { randomAppearance, seededRandom, type Random } from "../presentation/layered/looks";
import { modelFor } from "../presentation/playerArt";
import { formatPlayerName, generatePlayerName, nameBookFor, type Gender } from "./playerNames";

export interface PlayerIdentity {
  readonly name: string | undefined;
  readonly appearance: PlayerAppearance | undefined;
}

export interface PositionRef {
  readonly rosterName: string;
  readonly positionName: string;
}

function genderOf(appearance: PlayerAppearance | undefined, random: Random): Gender {
  const body = appearance?.["body"];
  if (body === "f") return "female";
  if (body === "m") return "male";
  return random() < 0.5 ? "female" : "male";
}

export function rollName(position: PositionRef, appearance: PlayerAppearance | undefined, random: Random = Math.random): string | undefined {
  const book = nameBookFor(position.rosterName, position.positionName);
  return book ? formatPlayerName(generatePlayerName(book, genderOf(appearance, random), random)) : undefined;
}

export function rollIdentity(position: PositionRef, random: Random = Math.random): PlayerIdentity {
  const options = lookOptions(modelFor(position.rosterName, position.positionName));
  const appearance = options.length > 0 ? randomAppearance(options, random) : undefined;
  return { name: rollName(position, appearance, random), appearance };
}

export function appearanceOf(player: Pick<Player, "id" | "appearance" | "positionName">, rosterName: string): PlayerAppearance | undefined {
  if (player.appearance) return player.appearance;
  const options = lookOptions(modelFor(rosterName, player.positionName));
  return options.length > 0 ? randomAppearance(options, seededRandom(player.id)) : undefined;
}
