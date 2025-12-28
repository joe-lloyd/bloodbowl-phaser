import { IEventBus } from "../../services/EventBus";
import { GameState, GamePhase, SubPhase } from "@/types/GameState";
import { Team } from "@/types/Team";
import { Player, PlayerStatus } from "@/types/Player";

import { WeatherManager } from "./WeatherManager";
import { GameEventNames } from "../../types/events";

export class BallManager {
  constructor(
    private eventBus: IEventBus,
    private state: GameState,
    private team1: Team,
    private team2: Team,
    private weatherService: WeatherManager,
    private callbacks: {
      onTurnover: (reason: string) => void;
      onPhaseChange: (phase: GamePhase, subPhase: SubPhase) => void;
      onBallPlaced: (x: number, y: number) => void;
    }
  ) {}

  public kickBall(playerId: string, targetX: number, targetY: number): void {
    // Transition to ROLL_KICK_OFF
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.ROLL_KICKOFF);

    // Roll Scatter
    const direction = Math.floor(Math.random() * 8) + 1; // 1-8
    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Kickoff Scatter",
      diceType: "d8",
      value: direction,
      total: direction,
      description: `Scatter Direction: ${direction}`,
      passed: true,
    });

    const distance = Math.floor(Math.random() * 6) + 1; // 1-6
    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Kickoff Scatter",
      diceType: "d6",
      value: distance,
      total: distance,
      description: `Scatter Distance: ${distance}`,
      passed: true,
    });

    // Calculate offset (1: TL, 2: T, 3: TR, 4: L, 5: R, 6: BL, 7: B, 8: BR)
    let dx = 0;
    let dy = 0;
    switch (direction) {
      case 1:
        dx = -1;
        dy = -1;
        break;
      case 2:
        dx = 0;
        dy = -1;
        break;
      case 3:
        dx = 1;
        dy = -1;
        break;
      case 4:
        dx = -1;
        dy = 0;
        break;
      case 5:
        dx = 1;
        dy = 0;
        break;
      case 6:
        dx = -1;
        dy = 1;
        break;
      case 7:
        dx = 0;
        dy = 1;
        break;
      case 8:
        dx = 1;
        dy = 1;
        break;
    }

    const finalX = targetX + dx * distance;
    const finalY = targetY + dy * distance;

    // Update State
    this.state.ballPosition = { x: finalX, y: finalY };

    this.eventBus.emit(GameEventNames.BallKicked, {
      playerId,
      targetX,
      targetY,
      direction,
      distance,
      finalX,
      finalY,
    });

    // Chain to event table
    setTimeout(() => this.rollKickoff(), 1000);
  }

  public rollKickoff(): void {
    this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.RESOLVE_KICKOFF);

    const d6 = () => Math.floor(Math.random() * 6) + 1;
    const d1 = d6();
    const d2 = d6();
    const roll = d1 + d2;
    let event = "Changing Weather";

    switch (roll) {
      case 2:
        event = "Get the Ref!";
        break;
      case 3:
        event = "Riot!";
        break;
      case 4:
        event = "Perfect Defense";
        break;
      case 5:
        event = "High Kick";
        break;
      case 6:
        event = "Cheering Fans";
        break;
      case 7:
        event = "Changing Weather";
        this.weatherService.rollWeather();
        break;
      case 8:
        event = "Brilliant Coaching";
        break;
      case 9:
        event = "Quick Snap!";
        break;
      case 10:
        event = "Blitz!";
        break;
      case 11:
        event = "Throw a Rock";
        break;
      case 12:
        event = "Pitch Invasion!";
        break;
    }

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Kickoff Event",
      diceType: "2d6",
      value: [d1, d2],
      total: roll,
      description: `Kickoff Result: ${event}`,
      passed: true,
    });

    this.eventBus.emit(GameEventNames.KickoffResult, { roll, event });

    setTimeout(() => {
      this.callbacks.onPhaseChange(GamePhase.KICKOFF, SubPhase.PLACE_BALL);
      this.resolveBallPlacement();
    }, 2000);
  }

  public resolveBallPlacement(): void {
    setTimeout(() => {
      this.eventBus.emit(GameEventNames.ReadyToStart);
    }, 1000);
  }

  public attemptPickup(
    player: Player,
    position: { x: number; y: number }
  ): boolean {
    // 1. Calculate Target (AG)
    let target = player.stats.AG;

    // 2. Modifiers (-1 per Enemy Tackle Zone)
    const oppTeam = player.teamId === this.team1.id ? this.team2 : this.team1;
    let standingEnemies = 0;
    oppTeam.players.forEach((p) => {
      if (p.status === PlayerStatus.ACTIVE && p.gridPosition) {
        const dx = Math.abs(p.gridPosition.x - position.x);
        const dy = Math.abs(p.gridPosition.y - position.y);
        if (dx <= 1 && dy <= 1 && !(dx === 0 && dy === 0)) {
          standingEnemies++;
        }
      }
    });

    const modifier = -standingEnemies;

    // 3. Roll
    const d6 = Math.floor(Math.random() * 6) + 1;
    const finalRoll = d6 + modifier;
    const success = d6 !== 1 && (d6 === 6 || finalRoll >= target);

    this.eventBus.emit(GameEventNames.DiceRoll, {
      rollType: "Agility (Pickup)",
      diceType: "d6",
      value: d6,
      total: finalRoll,
      description: `Pickup Roll (Target ${target}+): ${
        success ? "Success" : "FAILURE"
      } (Mod: ${modifier})`,
      passed: success,
    });

    this.eventBus.emit(GameEventNames.BallPickup, {
      playerId: player.id,
      success,
      roll: d6,
      target,
    });

    if (!success) {
      this.callbacks.onTurnover("Failed Pickup");
      return false;
    }

    return true;
  }
}
