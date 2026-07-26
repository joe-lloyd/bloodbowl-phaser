import { describe, it, expect, beforeEach } from "vitest";
import {
  CAMERA_SETTINGS_KEY,
  DEFAULT_CAMERA_SETTINGS,
  getCameraFitZoom,
  loadCameraSettings,
  registerCameraFitZoom,
  saveCameraSettings,
} from "../../../src/config/cameraSettings";

describe("cameraSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    registerCameraFitZoom(null);
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadCameraSettings()).toEqual(DEFAULT_CAMERA_SETTINGS);
  });

  it("round-trips saved settings", () => {
    saveCameraSettings({ zoom: 1.8, followIntensity: 0.7 });

    expect(loadCameraSettings()).toEqual({ zoom: 1.8, followIntensity: 0.7 });
  });

  it("returns defaults when the stored value is corrupt", () => {
    localStorage.setItem(CAMERA_SETTINGS_KEY, "{not json");

    expect(loadCameraSettings()).toEqual(DEFAULT_CAMERA_SETTINGS);
  });

  it("sanitizes invalid fields and clamps intensity to 0..1", () => {
    localStorage.setItem(
      CAMERA_SETTINGS_KEY,
      JSON.stringify({ zoom: "close", followIntensity: 42 })
    );

    expect(loadCameraSettings()).toEqual({
      zoom: DEFAULT_CAMERA_SETTINGS.zoom,
      followIntensity: 1,
    });
  });

  it("registers the fit-pitch zoom for the HUD control", () => {
    expect(getCameraFitZoom()).toBeNull();

    registerCameraFitZoom(1.44);

    expect(getCameraFitZoom()).toBe(1.44);
  });
});
