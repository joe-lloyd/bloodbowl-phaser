import { GameScene } from "./GameScene";
import { sandboxTeam } from "./sandboxTeam";
import type { GameSceneData } from "./matchStart";
import { ServiceContainer } from "../services/ServiceContainer";
import { applyScenario } from "../game/applyScenario";
import { activateMatchFormat } from "../game/variants/activeMatch";
import { readPlayground } from "../boundary/kickoffPlayground";
import {
  playgroundLanding,
  playgroundScenario,
  type PlaygroundConfig,
} from "../data/kickoffPlayground";

const HOME_COLOR = 0x4169e1;
const AWAY_COLOR = 0xdc143c;
const BOARD_READY_MS = 400;

export class KickoffPlaygroundScene extends GameScene {
  private config: PlaygroundConfig | null = null;

  constructor() {
    super("KickoffPlaygroundScene");
  }

  override init(data: GameSceneData): void {
    const config = readPlayground(new URLSearchParams(location.search));
    const { rosters, kicking, scene } = config;
    const team1 = sandboxTeam(rosters.team1, `Home ${rosters.team1}`, HOME_COLOR);
    const team2 = sandboxTeam(rosters.team2, `Away ${rosters.team2}`, AWAY_COLOR);
    for (const team of [team1, team2]) team.rerolls = 3;
    activateMatchFormat(scene.format);
    const initialState = {
      ...applyScenario(playgroundScenario(config), team1, team2),
      ...scene.format,
    };
    ServiceContainer.initialize({
      eventBus: globalThis.eventBus,
      teams: [team1, team2],
      initialState,
    });
    super.init({ ...data, teams: [team1, team2], autosaveEnabled: false });
    this.kickingTeam = kicking === "team1" ? team1 : team2;
    this.receivingTeam = kicking === "team1" ? team2 : team1;
    this.config = config;
  }

  override create(): void {
    super.create();
    this.placePlayersOnPitch();
    this.time.delayedCall(BOARD_READY_MS, () => {
      this.kickInto();
    });
  }

  private kickInto(): void {
    const { config } = this;
    if (!config) return;
    void this.gameService.rehearseKickoffEvent({
      event: config.scene.event,
      isTeam1Kicking: config.kicking === "team1",
      landing: playgroundLanding(playgroundScenario(config), config.kicking),
      ...(config.players !== null && { selectionLimit: config.players }),
    });
  }
}
