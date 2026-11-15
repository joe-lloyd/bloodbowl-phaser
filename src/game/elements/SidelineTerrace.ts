import Phaser from "phaser";
import { IEventBus } from "../../services/EventBus";
import { Team, TeamColors } from "../../types/Team";
import { GameEventNames } from "../../types/events";
import { Facing } from "../presentation/playerArt";
import {
  staffTerraceCorners,
  staffTerraceLayout,
  staffTerraceSlot,
} from "../presentation/sidelineLayout";
import {
  getEmptySidelineCrewInfo,
  getSidelineCrewInfo,
  getVisibleSidelineStaff,
  SidelineCrewInfo,
} from "../presentation/sidelineStaff";
import type { BoardProjection } from "../presentation/sidelineRoutes";
import type { DugoutSquares } from "./Stadium";
import { SidelineStaffSprite } from "./SidelineStaffSprite";

/** Dedicated space for crew, beside the player boxes and behind the exit lane. */
export class SidelineTerrace {
  private objects: Phaser.GameObjects.GameObject[] = [];
  public readonly bounds: { x: number; y: number }[];

  constructor(
    scene: Phaser.Scene,
    team: Team,
    kit: TeamColors,
    squares: DugoutSquares,
    project: BoardProjection,
    facing: Facing,
    bus: IEventBus
  ) {
    const layout = staffTerraceLayout(squares);
    const corners = staffTerraceCorners(layout).map((p) => project(p.x, p.y));
    this.bounds = corners;
    const floor = scene.add.graphics().setDepth(5);
    this.objects.push(floor);
    floor.fillStyle(0x62462d, 1).fillPoints(corners, true);
    for (let col = 0; col < layout.width; col++) {
      for (let row = 0; row < 3; row++) {
        const tile = [
          [col + 0.04, row + 0.04],
          [col + 0.96, row + 0.04],
          [col + 0.96, row + 0.9],
          [col + 0.04, row + 0.9],
        ].map(([x, y]) =>
          project(layout.x + x, layout.y + y * layout.direction)
        );
        floor
          .fillStyle((col + row) % 2 ? 0x705135 : 0x79593b, 1)
          .fillPoints(tile, true);
      }
    }
    floor.lineStyle(2, kit.primary, 0.9).strokePoints(corners, true);
    const labelAt = project(layout.x + layout.width / 2, layout.y);
    const label = scene.add
      .text(labelAt.x, labelAt.y, "SIDELINE CREW", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#ead9b7",
        stroke: "#352617",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setAngle(26.565)
      .setDepth(6);
    this.objects.push(label);
    const staff = getVisibleSidelineStaff(team);
    for (const member of staff) {
      const slot = staffTerraceSlot(layout, member);
      const at = project(slot.x, slot.y);
      const figure = new SidelineStaffSprite(
        scene,
        at.x,
        at.y,
        member.type,
        kit,
        facing,
        member.index
      );
      figure.setInteractive(
        new Phaser.Geom.Rectangle(-19, -58, 38, 64),
        Phaser.Geom.Rectangle.Contains
      );
      figure.input!.cursor = "pointer";
      this.inspectable(
        figure,
        () => getSidelineCrewInfo(member.type, team),
        bus
      );
      this.objects.push(figure);
    }
    if (!staff.length) {
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
    const show = () =>
      bus.emit(GameEventNames.UI_ShowInfo, {
        kind: "sidelineCrew",
        crew: info(),
      });
    object.on("pointerover", show);
    object.on("pointerdown", show);
    object.on("pointerout", () => bus.emit(GameEventNames.UI_HidePlayerInfo));
  }

  public destroy(): void {
    this.objects.forEach((object) => object.destroy());
    this.objects = [];
  }
}
