import type { Commands } from "./rendererPorts";
import type Phaser from "phaser";
import type { IEventBus } from "../../services/EventBus";
import type { Pitch } from "../elements/Pitch";

type Camera = Phaser.Cameras.Scene2D.Camera;

export type CameraLens = Pick<Camera,
  "zoom" | "scrollX" | "scrollY" | "x" | "y" | "width" | "height" |
  "roundPixels" | "originX" | "originY"> & Commands<Pick<Camera,
  "centerOn" | "setBackgroundColor" | "setBounds" | "setZoom" | "pan" | "zoomTo" |
  "setFollowOffset" | "shake" | "startFollow" | "stopFollow">> & {
  once(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
  getBounds(): { x: number; y: number; right: number; bottom: number };
  panEffect: { isRunning: boolean; reset(): unknown };
  zoomEffect: { isRunning: boolean; reset(): unknown };
};

type CameraInput = Commands<Pick<Phaser.Input.InputPlugin, "on" | "off">> & {
  mouse?: Pick<Phaser.Input.Mouse.MouseManager, "disableContextMenu"> | null;
  keyboard?: Pick<Phaser.Input.Keyboard.KeyboardPlugin, "addKey" | "removeKey"> | null;
};

export interface CameraScene {
  cameras: { main: CameraLens };
  scale: Pick<Phaser.Scale.ScaleManager, "width" | "height"> & Commands<Pick<Phaser.Scale.ScaleManager, "on" | "off">>;
  input: CameraInput;
  events: Commands<Pick<Phaser.Events.EventEmitter, "on" | "off">>;
  time: {
    delayedCall(delay: number, callback: () => void): { remove(dispatchCallback?: boolean): unknown };
  };
}

export type CameraPitch = Pick<Pitch, "getPixelPosition" | "getPointPosition">;
export type CameraBus = Pick<IEventBus, "emit">;
