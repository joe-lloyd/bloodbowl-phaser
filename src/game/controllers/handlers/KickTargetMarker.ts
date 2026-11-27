import type { IEventBus } from "../../../services/EventBus";
import { activeLayout } from "../../variants/activeMatch";
import { DiceWatch } from "../../presentation/diceWatch";
import { kickTargetColor } from "../../presentation/kickTarget";
import { kitOf } from "../../presentation/kits";
import type { KickoffScene } from "./scenePorts";
import { pairSeating, pairTeams } from "../../seating";
import { sceneSeating } from "../sceneSeating";

export class KickTargetMarker {
  private latest = 0;
  private readonly scene: Pick<KickoffScene, "pitch" | "team1" | "team2">;
  private readonly eventBus: IEventBus;

  constructor(
    scene: Pick<KickoffScene, "pitch" | "team1" | "team2">,
    eventBus: IEventBus
  ) {
    this.scene = scene;
    this.eventBus = eventBus;
  }

  showOnceRolled(square: { x: number; y: number }): void {
    this.clear();
    const request = this.latest;
    queueMicrotask(() => {
      void DiceWatch.shared(this.eventBus)
        .landed()
        .then(() => {
          if (request !== this.latest) return;
          this.scene.pitch.markKickTarget(square, this.color());
        });
    });
  }

  clear(): void {
    this.latest++;
    this.scene.pitch.clearKickTarget();
  }

  private color(): number {
    const teams = pairTeams(pairSeating(sceneSeating(this.scene)));
    const kits = teams.map((team) => kitOf(teams, team.id).primary);
    return kickTargetColor(kits, activeLayout().surface);
  }
}
