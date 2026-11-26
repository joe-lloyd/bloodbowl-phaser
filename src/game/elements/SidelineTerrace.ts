import Phaser from "phaser";
import { type IEventBus } from "../../services/EventBus";
import { type Team, type TeamColors } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { type Facing } from "../presentation/playerArt";
import {
  staffTerraceLayout,
  staffTerraceSlot,
} from "../presentation/sidelineLayout";
import {
  getEmptySidelineCrewInfo,
  getSidelineCrewInfo,
  getVisibleSidelineStaff,
  type SidelineCrewInfo,
} from "../presentation/sidelineStaff";
import type { BoardProjection } from "../presentation/sidelineRoutes";
import type { DugoutSquares } from "./Stadium";
import { SidelineStaffSprite } from "./SidelineStaffSprite";
import { terraceFloor, terraceLabel } from "./terraceFloor";

export class SidelineTerrace {
  private objects: Phaser.GameObjects.GameObject[] = [];
  public readonly bounds: { x: number; y: number }[];

  constructor(options: {
    scene: Phaser.Scene;
    team: Team;
    kit: TeamColors;
    squares: DugoutSquares;
    project: BoardProjection;
    facing: Facing;
    bus: IEventBus;
  }) {
    const { scene, team, kit, squares, project, facing, bus } = options;
    const layout = staffTerraceLayout(squares);
    const { floor, corners } = terraceFloor(scene, layout, { kit, project });
    this.bounds = corners;
    this.objects.push(floor);
    this.objects.push(terraceLabel(scene, layout, project));
    const staff = getVisibleSidelineStaff(team);
    for (const member of staff) {
      const slot = staffTerraceSlot(layout, member);
      const at = project(slot.x, slot.y);
      const figure = new SidelineStaffSprite({
        scene: scene,
        x: at.x,
        y: at.y,
        role: member.type,
        kit: kit,
        facing: facing,
        index: member.index,
      });
      figure.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-19, -58, 38, 64),
        hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) =>
          Phaser.Geom.Rectangle.Contains(area, x, y),
        useHandCursor: true,
      });
      this.inspectable(
        figure,
        () => getSidelineCrewInfo(member.type, team),
        bus
      );
      this.objects.push(figure);
    }
    if (staff.length === 0) {
      const at = project(layout.x + 3, layout.y + 1.5 * layout.direction);
      const empty = scene.add
        .text(at.x, at.y, "NO STAFF", {
          fontFamily: "Georgia, serif",
          fontSize: "13px",
          color: "#d6c6a6",
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });
      this.inspectable(empty, getEmptySidelineCrewInfo, bus);
      this.objects.push(empty);
    }
  }

  private inspectable(
    object: Phaser.GameObjects.GameObject,
    info: () => SidelineCrewInfo,
    bus: IEventBus
  ): void {
    const show = () => {
      bus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew: info(),
      });
    };
    object.on("pointerover", show);
    object.on("pointerdown", show);
    object.on("pointerout", () => {
      bus.emit(GameEventNames.UI_HidePlayerInfo, undefined);
    });
  }

  public destroy(): void {
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects = [];
  }
}
