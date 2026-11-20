import { rollCasualty } from "@/game/operations/injuryVerdict";
import { type Player } from "@/types/Player";
import { GamePhase } from "@/types/GameState";
import { GameEventNames } from "@/types/events";
import { CasualtyOperation } from "@/game/operations/CasualtyOperation";
import { movePlayerToBox } from "@/game/rules/playerLocation";
import { nearestFreeSquare } from "@/game/rules/pitchSquares";
import type { GameParts } from "./parts";

type PitRoll = "casualty" | "stays" | "climbs-out";

function sewerPitRoll(roll: number): PitRoll {
  if (roll <= 1) return "casualty";
  return roll <= 3 ? "stays" : "climbs-out";
}

function climbOut(
  parts: GameParts,
  player: Player,
  pit: { x: number; y: number }
): void {
  const occupied = (square: { x: number; y: number }) =>
    parts.game.getPlayerAt(square.x, square.y) !== undefined;
  const to = nearestFreeSquare(pit, occupied);
  if (!to) return;
  delete player.sewerPit;
  movePlayerToBox(player, { box: "pitch", position: to }, parts.eventBus);
  parts.eventBus.emit(GameEventNames.PlayerClimbedOutOfPit, {
    playerId: player.id,
    pit: { ...pit },
    to: { ...to },
  });
}

function pitCasualty(parts: GameParts, player: Player): void {
  movePlayerToBox(player, { box: "casualty" }, parts.eventBus);
  parts.eventBus.emit(GameEventNames.PlayerCasualtyInflicted, {
    victimId: player.id,
    cause: "special",
    sppEligible: false,
  });
  parts.flowManager.add(
    new CasualtyOperation(player.id, rollCasualty(parts.diceController, player)),
    true
  );
}

export function rollSewerPits(parts: GameParts): boolean {
  if (parts.state.phase !== GamePhase.PLAY) return false;
  let queued = false;
  for (const player of [...parts.team1.players, ...parts.team2.players]) {
    const pit = player.sewerPit;
    if (!pit) continue;
    const roll = parts.diceController.rollD6(
      `Sewer Pit (${player.playerName})`,
      player.teamId
    );
    const outcome = sewerPitRoll(roll);
    if (outcome === "climbs-out") climbOut(parts, player, pit);
    if (outcome === "casualty") {
      pitCasualty(parts, player);
      queued = true;
    }
  }
  return queued;
}
