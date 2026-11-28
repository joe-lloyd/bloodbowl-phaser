import type { GameScene } from "../../../scenes/GameScene";
import type { IGameService } from "../../../services/interfaces/IGameService";
import type { IEventBus } from "../../../services/EventBus";
import type { Team } from "../../../types/Team";
import type { SubPhase } from "../../../types/GameState";
import { GameEventNames } from "../../../types/events";
import { getActiveOnlineMatch } from "../../../network/OnlineMatch";
import { seatOf } from "../../seating";
import { sceneSeating } from "../sceneSeating";

type PlacementScene = Pick<GameScene, "teams" | "disableSetupInteraction" | "highlightSetupZone" | "enablePlacement">;

export function showSetupPlacement(context: {
  scene: PlacementScene;
  gameService: Pick<IGameService, "getSetupStatus">;
  eventBus: IEventBus;
}, setup: { subPhase: SubPhase; team: Team }): void {
  const { scene, gameService, eventBus } = context;
  const { subPhase, team: activeTeam } = setup;
  const match = getActiveOnlineMatch();
  if (match && activeTeam.id !== match.myTeamId) {
    eventBus.emit(GameEventNames.UI_HideSetupControls, undefined);
    scene.disableSetupInteraction();
    eventBus.emit(GameEventNames.UI_SyncBoard, undefined);
    return;
  }
  const isTeam1 = seatOf(sceneSeating(scene), activeTeam.id).index === 0;
  const status = gameService.getSetupStatus(activeTeam.id);
  eventBus.emit(GameEventNames.UI_ShowSetupControls, { subPhase, activeTeam, ...(status !== undefined && { status }) });
  scene.highlightSetupZone(isTeam1);
  scene.enablePlacement(activeTeam, isTeam1);
}
