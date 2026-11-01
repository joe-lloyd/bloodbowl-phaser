import { describe, it, expect, beforeEach } from "vitest";
import {
  CAMERA_SETTINGS_KEY,
  loadCameraSettings,
  saveCameraSettings,
} from "../../../src/config/cameraSettings";

describe("cameraSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("plays the match camera as it is when nothing is stored", () => {
    expect(loadCameraSettings()).toEqual({ zoom: 1, follow: "close" });
  });

  it("round-trips saved settings", () => {
    saveCameraSettings({ zoom: 1.75, follow: "off" });

    expect(loadCameraSettings()).toEqual({ zoom: 1.75, follow: "off" });
  });

  it("returns the defaults when the stored value is corrupt", () => {
    localStorage.setItem(CAMERA_SETTINGS_KEY, "{not json");

    expect(loadCameraSettings()).toEqual({ zoom: 1, follow: "close" });
  });

  it("keeps valid fields and replaces the rest", () => {
    localStorage.setItem(
      CAMERA_SETTINGS_KEY,
      JSON.stringify({ zoom: "close", follow: "light" })
    );
    expect(loadCameraSettings()).toEqual({ zoom: 1, follow: "light" });

    localStorage.setItem(
      CAMERA_SETTINGS_KEY,
      JSON.stringify({ zoom: 1.5, follow: 0.35 })
    );
    expect(loadCameraSettings()).toEqual({ zoom: 1.5, follow: "close" });
  });

  it("clamps a stored zoom to the range and its steps", () => {
    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify({ zoom: 42 }));
    expect(loadCameraSettings().zoom).toBe(2);

    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify({ zoom: 0.4 }));
    expect(loadCameraSettings().zoom).toBe(1);

    localStorage.setItem(CAMERA_SETTINGS_KEY, JSON.stringify({ zoom: 1.3 }));
    expect(loadCameraSettings().zoom).toBe(1.25);
  });
});
