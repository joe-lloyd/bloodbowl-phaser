import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CameraController } from "../../../src/game/controllers/CameraController";

describe("CameraController", () => {
  let controller: CameraController;
  let mockScene;
  let mockCamera;
  let mockTweens;

  beforeEach(() => {
    // Mock camera
    mockCamera = {
      scrollX: 0,
      scrollY: 0,
      zoom: 1.0,
      width: 1920,
      height: 1080,
      startFollow: vi.fn(),
      stopFollow: vi.fn(),
      shake: vi.fn(),
      flash: vi.fn(),
      fade: vi.fn(),
    };

    // Mock tweens
    mockTweens = {
      add: vi.fn((config) => {
        // Immediately call onComplete if provided
        if (config.onComplete) {
          config.onComplete();
        }
        return { stop: vi.fn() };
      }),
      killTweensOf: vi.fn(),
    };

    // Mock scene
    mockScene = {
      cameras: {
        main: mockCamera,
      },
      tweens: mockTweens,
      time: {
        delayedCall: vi.fn((delay, callback) => {
          callback();
        }),
      },
    };

    const pitchBounds = { x: 0, y: 0, width: 1200, height: 660 };
    controller = new CameraController(mockScene, pitchBounds);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Zoom Operations", () => {
    it("should zoom to target level", async () => {
      await controller.zoomTo(2.0, 800);

      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: mockCamera,
          zoom: 2.0,
          duration: 800,
        })
      );
    });

    it("should use default duration if not provided", async () => {
      await controller.zoomTo(1.5);

      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: 800,
        })
      );
    });
  });

  describe("Pan Operations", () => {
    it("should pan to specific coordinates", async () => {
      await controller.panTo(600, 330, 800);

      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: mockCamera,
          duration: 800,
        })
      );
    });

    it("should calculate scroll position to center on target", async () => {
      mockCamera.zoom = 1.0;
      mockCamera.width = 1920;
      mockCamera.height = 1080;

      await controller.panTo(600, 330);

      const call = mockTweens.add.mock.calls[0][0];
      expect(call.scrollX).toBeDefined();
      expect(call.scrollY).toBeDefined();
    });
  });

  describe("Object Tracking", () => {
    it("should start following an object", () => {
      const mockObject = { x: 100, y: 100 };

      controller.trackObject(mockObject, 2.0, 800);

      expect(mockCamera.startFollow).toHaveBeenCalledWith(
        mockObject,
        true,
        0.25,
        0.25
      );
      expect(mockTweens.add).toHaveBeenCalled();
      expect(controller.getIsTracking()).toBe(true);
    });

    it("should use the intensity-derived track zoom if none provided", () => {
      const mockObject = { x: 100, y: 100 };

      // Defaults: resting zoom 1.0, full intensity -> MAX track zoom 2.5
      controller.trackObject(mockObject);

      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 2.5,
        })
      );
    });

    it("should stop existing tracking before starting new", () => {
      const mockObject1 = { x: 100, y: 100 };
      const mockObject2 = { x: 200, y: 200 };

      controller.trackObject(mockObject1);
      controller.trackObject(mockObject2);

      expect(mockCamera.startFollow).toHaveBeenCalledTimes(2);
    });
  });

  describe("Camera Reset", () => {
    it("should stop tracking and return to default view", async () => {
      const mockObject = { x: 100, y: 100 };
      controller.trackObject(mockObject);

      await controller.reset(800);

      expect(mockCamera.stopFollow).toHaveBeenCalled();
      expect(controller.getIsTracking()).toBe(false);
      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 1.0,
          scrollX: 0,
          scrollY: 0,
        })
      );
    });

    it("should supersede in-flight camera tweens", async () => {
      await controller.reset(800);

      expect(mockTweens.killTweensOf).toHaveBeenCalledWith(mockCamera);
    });
  });

  describe("Resting Zoom", () => {
    // pitchBounds 1200x660 on a 1920x1080 camera -> fit = min(1.6, 1.636) * 0.9
    const FIT_ZOOM = 1.6 * 0.9;

    it("should expose the fit-pitch zoom", () => {
      expect(controller.getFitZoom()).toBeCloseTo(FIT_ZOOM, 5);
    });

    it("should return null fit zoom without pitch bounds", () => {
      const noBounds = new CameraController(mockScene);
      expect(noBounds.getFitZoom()).toBeNull();
    });

    it("should return to the resting zoom instead of the captured default", async () => {
      controller.setRestingZoom(2.0);

      await controller.reset(800);

      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 2.0,
          // Phaser zooms around the viewport center; scroll is unscaled.
          scrollX: 0,
          scrollY: 0,
        })
      );
    });

    it("should clamp the resting zoom to the fit-pitch minimum", () => {
      controller.setRestingZoom(0.5);

      expect(controller.getRestingZoom()).toBeCloseTo(FIT_ZOOM, 5);
    });

    it("should clamp the resting zoom to the maximum", () => {
      controller.setRestingZoom(99);

      expect(controller.getRestingZoom()).toBe(2.5);
    });
  });

  describe("Follow Intensity", () => {
    it("should default to full intensity (legacy close tracking)", () => {
      expect(controller.getFollowIntensity()).toBe(1.0);
      expect(controller.isFollowEnabled()).toBe(true);
    });

    it("should clamp intensity to 0..1", () => {
      controller.setFollowIntensity(2);
      expect(controller.getFollowIntensity()).toBe(1);

      controller.setFollowIntensity(-1);
      expect(controller.getFollowIntensity()).toBe(0);
    });

    it("should not follow or zoom when intensity is Off", () => {
      controller.setFollowIntensity(0);
      const mockObject = { x: 100, y: 100 };

      controller.trackObject(mockObject);

      expect(controller.isFollowEnabled()).toBe(false);
      expect(mockCamera.startFollow).not.toHaveBeenCalled();
      expect(mockTweens.add).not.toHaveBeenCalled();
      expect(controller.getIsTracking()).toBe(false);
    });

    it("should map intensity to the follow lerp (Light .. Close)", () => {
      const mockObject = { x: 100, y: 100 };

      controller.setFollowIntensity(0.5);
      controller.trackObject(mockObject);

      const lerp = mockCamera.startFollow.mock.calls[0][2];
      // 0.08 + (0.25 - 0.08) * 0.5
      expect(lerp).toBeCloseTo(0.165, 5);
      expect(mockCamera.startFollow.mock.calls[0][3]).toBeCloseTo(lerp, 5);
    });

    it("should keep the legacy tight lerp at full intensity", () => {
      const mockObject = { x: 100, y: 100 };

      controller.trackObject(mockObject);

      expect(mockCamera.startFollow).toHaveBeenCalledWith(
        mockObject,
        true,
        0.25,
        0.25
      );
    });

    it("should derive a gentler track zoom at low intensity", () => {
      const mockObject = { x: 100, y: 100 };

      controller.setFollowIntensity(0.5);
      controller.trackObject(mockObject);

      // resting 1.0 + (2.5 - 1.0) * 0.5
      expect(mockTweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 1.75,
        })
      );
    });
  });

  describe("Camera Effects", () => {
    it("should shake camera with specified intensity", () => {
      controller.shake(0.02, 300);

      expect(mockCamera.shake).toHaveBeenCalledWith(300, 0.02);
    });

    it("should use default shake values", () => {
      controller.shake();

      expect(mockCamera.shake).toHaveBeenCalledWith(200, 0.01);
    });

    it("should flash camera with specified color", () => {
      controller.flash(250, 0xff0000);

      expect(mockCamera.flash).toHaveBeenCalledWith(250, 0xff0000);
    });

    it("should fade camera", async () => {
      await controller.fade(500, 0x000000);

      expect(mockCamera.fade).toHaveBeenCalledWith(500, 0x000000);
      expect(mockScene.time.delayedCall).toHaveBeenCalledWith(
        500,
        expect.any(Function)
      );
    });
  });

  describe("Show All Players", () => {
    it("should zoom to fit entire pitch", async () => {
      await controller.showAllPlayers(800);

      expect(mockCamera.stopFollow).toHaveBeenCalled();
      expect(controller.getIsTracking()).toBe(false);
      expect(mockTweens.add).toHaveBeenCalled();
    });

    it("should warn if pitch bounds not set", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const controllerNoBounds = new CameraController(mockScene);

      await controllerNoBounds.showAllPlayers();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Pitch bounds not set, using default zoom"
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Track with Pre-Zoom", () => {
    it("should zoom to pre-zoom target before tracking", async () => {
      const preZoomTarget = { x: 100, y: 100 };
      const trackObject = { x: 200, y: 200 };

      await controller.trackObjectWithPreZoom(
        preZoomTarget,
        trackObject,
        2.2,
        2.5,
        500
      );

      // Should have called panTo, zoomTo, and trackObject
      expect(mockTweens.add).toHaveBeenCalled();
      expect(mockCamera.startFollow).toHaveBeenCalledWith(
        trackObject,
        true,
        0.25,
        0.25
      );
    });

    it("should wait for track duration if specified", async () => {
      const preZoomTarget = { x: 100, y: 100 };
      const trackObject = { x: 200, y: 200 };

      await controller.trackObjectWithPreZoom(
        preZoomTarget,
        trackObject,
        2.2,
        2.5,
        500,
        1000
      );

      expect(mockScene.time.delayedCall).toHaveBeenCalled();
    });
  });

  describe("Cleanup", () => {
    it("should stop tracking and clean up on destroy", () => {
      const mockObject = { x: 100, y: 100 };
      controller.trackObject(mockObject);

      controller.destroy();

      expect(mockCamera.stopFollow).toHaveBeenCalled();
    });
  });
});
