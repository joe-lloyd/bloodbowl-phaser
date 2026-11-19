import type Phaser from "phaser";
import type { TeamColors } from "../../types/Team";
import {
  staffTerraceCorners,
  type staffTerraceLayout,
} from "../presentation/sidelineLayout";
import type { BoardProjection } from "../presentation/sidelineRoutes";

type TerraceLayout = ReturnType<typeof staffTerraceLayout>;

export function terraceFloor(
  scene: Phaser.Scene,
  layout: TerraceLayout,
  options: { kit: TeamColors; project: BoardProjection }
) {
  const { kit, project } = options;
  const corners = staffTerraceCorners(layout).map((p) => project(p.x, p.y));
  const floor = scene.add.graphics().setDepth(5);
  floor.fillStyle(0x62462d, 1).fillPoints(corners, true);
  for (let col = 0; col < layout.width; col++) {
    for (let row = 0; row < 3; row++) {
      const tile = (
        [
          [col + 0.04, row + 0.04],
          [col + 0.96, row + 0.04],
          [col + 0.96, row + 0.9],
          [col + 0.04, row + 0.9],
        ] as const
      ).map(([x, y]) => project(layout.x + x, layout.y + y * layout.direction));
      floor
        .fillStyle((col + row) % 2 ? 0x705135 : 0x79593b, 1)
        .fillPoints(tile, true);
    }
  }
  floor.lineStyle(2, kit.primary, 0.9).strokePoints(corners, true);
  return { floor, corners };
}

export function terraceLabel(
  scene: Phaser.Scene,
  layout: TerraceLayout,
  project: BoardProjection
): Phaser.GameObjects.Text {
  const at = project(layout.x + layout.width / 2, layout.y);
  return scene.add
    .text(at.x, at.y, "SIDELINE CREW", {
      fontFamily: "Georgia, serif",
      fontSize: "14px",
      color: "#ead9b7",
      stroke: "#352617",
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setAngle(26.565)
    .setDepth(6);
}
