import * as THREE from "three";
import type { DiceKind } from "./diceScene";
import { indexed } from "./diceValues";
import { D16_FACE_UP } from "./d16";
import { FACE_NORMALS, normals, TRAY, upFace } from "./dicePhysics";

let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  return renderer;
}

function addLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x1a1020, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-4, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 5, bottom: -5 });
  scene.add(sun);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(TRAY.w + 4, TRAY.d + 4),
    new THREE.ShadowMaterial({ opacity: 0.45 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

const FOV = 32;
const CLOSE_FOV = 26;

export function createStage(host: HTMLElement, close = false) {
  const gl = getRenderer();
  const width = host.clientWidth;
  const height = host.clientHeight;
  gl.setSize(width, height);
  host.appendChild(gl.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    close ? CLOSE_FOV : FOV,
    width / height,
    0.1,
    100
  );
  camera.position.set(0, 9.4, 5.4);
  const lookAt = new THREE.Vector3(0, 0, 0.15);
  camera.lookAt(lookAt);
  addLighting(scene);
  return { host, gl, scene, camera, lookAt };
}

export function drawStage({ host, gl, scene, camera }: Stage): void {
  const { clientWidth: width, clientHeight: height } = host;
  const aspect = width / height;
  if (width > 0 && height > 0 && aspect !== camera.aspect) {
    gl.setSize(width, height);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }
  gl.render(scene, camera);
}

export type Stage = ReturnType<typeof createStage>;
const LIFT_MS = 420;

export function faceCamera(input: {
  camera: THREE.PerspectiveCamera;
  at: THREE.Vector3;
  local: THREE.Vector3;
  side: THREE.Vector3;
}): THREE.Quaternion {
  const { camera, at, local, side } = input;
  const toCamera = camera.position.clone().sub(at).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(camera.quaternion)
    .projectOnPlane(toCamera)
    .normalize();
  const world = new THREE.Matrix4().makeBasis(
    toCamera,
    screenUp,
    toCamera.clone().cross(screenUp)
  );
  const body = new THREE.Matrix4().makeBasis(
    local,
    side,
    local.clone().cross(side)
  );
  return new THREE.Quaternion().setFromRotationMatrix(
    world.multiply(body.transpose())
  );
}

export function faceForward(input: {
  mesh: THREE.Mesh;
  kind: DiceKind;
  camera: THREE.PerspectiveCamera;
  at: THREE.Vector3;
}): THREE.Quaternion {
  const { mesh, kind, camera, at } = input;
  const { face } = upFace(mesh.quaternion, kind);
  const local = new THREE.Vector3(...indexed(normals(kind), face));
  const side =
    kind === "d16"
      ? indexed(D16_FACE_UP, face)
      : new THREE.Vector3(
          ...indexed(
            FACE_NORMALS,
            FACE_NORMALS.findIndex((_n, k) => k >> 1 !== face >> 1)
          )
        );
  return faceCamera({ camera, at, local, side });
}

export function liftEase(elapsed: number): number {
  const t = Math.min(1, elapsed / LIFT_MS);
  return 1 - Math.pow(1 - t, 3);
}
