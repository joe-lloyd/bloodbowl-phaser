import type Phaser from "phaser";

const RING = { w: 66, h: 30 };

interface RingStyle {
  width: number;
  height: number;
  stroke: number;
  color: number;
  alpha?: number;
}

function ring(
  scene: Phaser.Scene,
  style: RingStyle
): Phaser.GameObjects.Ellipse {
  const shape = scene.add.ellipse(0, 0, style.width, style.height);
  shape.setStrokeStyle(style.stroke, style.color, style.alpha);
  shape.setVisible(false);
  return shape;
}

export function playerRings(scene: Phaser.Scene) {
  const shadow = scene.add.ellipse(0, 0, 44, 18, 0x000000, 0.35);
  const teamTurnBorder = ring(scene, {
    width: RING.w,
    height: RING.h,
    stroke: 2,
    color: 0xffffff,
    alpha: 0.4,
  });
  const selectionRing = ring(scene, {
    width: RING.w + 6,
    height: RING.h + 3,
    stroke: 4,
    color: 0xffff00,
  });
  const remoteSelectionRing = ring(scene, {
    width: RING.w + 14,
    height: RING.h + 7,
    stroke: 3,
    color: 0xff3b30,
  });
  const carrierMarker = ring(scene, {
    width: RING.w - 10,
    height: RING.h - 5,
    stroke: 3,
    color: 0xffc83a,
    alpha: 0.95,
  });
  return {
    shadow,
    teamTurnBorder,
    selectionRing,
    remoteSelectionRing,
    carrierMarker,
  };
}

function distracted(
  scene: Phaser.Scene,
  headY: number
): Phaser.GameObjects.Container {
  const marker = scene.add.container(0, headY - 12);
  const swirl = scene.add.circle(0, 0, 8, 0x9b59b6);
  swirl.setStrokeStyle(2, 0xffffff);
  const dizzy = scene.add.graphics();
  dizzy.lineStyle(1.5, 0xffffff);
  dizzy.strokeCircle(-2, -1, 2.5);
  dizzy.strokeCircle(3, 1, 2);
  marker.add([swirl, dizzy]);
  marker.setVisible(false);
  return marker;
}

function frog(
  scene: Phaser.Scene,
  headY: number
): Phaser.GameObjects.Container {
  const marker = scene.add.container(0, headY + 4);
  const face = scene.add.ellipse(0, 0, 22, 15, 0x4ade80);
  face.setStrokeStyle(2, 0x14532d);
  const eyes = [-6, 6].flatMap((x) => [
    scene.add.circle(x, -6, 4, 0xffffff).setStrokeStyle(1, 0x14532d),
    scene.add.circle(x, -6, 1.6, 0x111111),
  ]);
  marker.add([face, ...eyes]);
  marker.setVisible(false);
  return marker;
}

function carrierBadge(
  scene: Phaser.Scene,
  headY: number
): Phaser.GameObjects.Container {
  const marker = scene.add.container(0, headY - 18);
  const disc = scene.add.circle(0, 0, 10, 0x140c08, 0.85);
  disc.setStrokeStyle(2, 0xffc83a);
  const leather = scene.add.ellipse(0, 0, 13, 8, 0x8b4513);
  leather.setStrokeStyle(1, 0x2a1408);
  const laces = scene.add.graphics();
  laces.lineStyle(1.2, 0xffffff);
  laces.lineBetween(-3.5, 0, 3.5, 0);
  laces.lineBetween(-1.5, -1.8, -1.5, 1.8);
  laces.lineBetween(1.5, -1.8, 1.5, 1.8);
  marker.add([disc, leather, laces]);
  marker.setVisible(false);
  return marker;
}

export function playerStatusMarkers(
  scene: Phaser.Scene,
  owner: Phaser.GameObjects.Container,
  headY: number
) {
  const distractedMarker = distracted(scene, headY);
  owner.add(distractedMarker);
  const frogMarker = frog(scene, headY);
  owner.add(frogMarker);
  const badge = carrierBadge(scene, headY);
  owner.add(badge);
  const stunnedMarker = scene.add.text(0, -26, "★ ★", {
    fontSize: "13px",
    color: "#ffd84a",
    stroke: "#000000",
    strokeThickness: 3,
  });
  stunnedMarker.setOrigin(0.5);
  stunnedMarker.setVisible(false);
  owner.add(stunnedMarker);
  return { distractedMarker, frogMarker, carrierBadge: badge, stunnedMarker };
}

export function playerNumber(
  scene: Phaser.Scene,
  number: number
): Phaser.GameObjects.Text {
  const text = scene.add.text(0, 10, number.toString(), {
    fontFamily: "Georgia, serif",
    fontSize: "12px",
    color: "#ffffff",
    fontStyle: "bold",
    stroke: "#000000",
    strokeThickness: 3,
  });
  text.setOrigin(0.5, 0);
  return text;
}
