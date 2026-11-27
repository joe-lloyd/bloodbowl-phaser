import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "../../../src/services/EventBus";

type TestEvents = Record<"event1" | "event2" | "event3" | "no-listeners" | "other-event" | "test-event", unknown>;

describe("EventBus", () => {
  let eventBus: EventBus<TestEvents>;

  beforeEach(() => {
    eventBus = new EventBus<TestEvents>();
  });

  describe("emit and on", () => {
    it("should emit and receive events", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      eventBus.emit("test-event", { data: "test" });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ data: "test" });
    });

    it("should support multiple listeners for same event", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      eventBus.emit("test-event", "data");

      expect(callback1).toHaveBeenCalledWith("data");
      expect(callback2).toHaveBeenCalledWith("data");
    });

    it("should support multiple different events", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("event1", callback1);
      eventBus.on("event2", callback2);

      eventBus.emit("event1", "data1");
      eventBus.emit("event2", "data2");

      expect(callback1).toHaveBeenCalledWith("data1");
      expect(callback2).toHaveBeenCalledWith("data2");
    });

    it("should not call callback if event not emitted", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      eventBus.emit("other-event", undefined);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should handle emit with no data", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      eventBus.emit("test-event", undefined);

      expect(callback).toHaveBeenCalledWith(undefined);
    });
  });

  describe("off", () => {
    it("defers a replacement listener until the next emission", () => {
      const calls: string[] = [];
      const replacement = () => {
        calls.push("replacement");
      };
      const original = () => {
        calls.push("original");
        eventBus.off("test-event", original);
        eventBus.on("test-event", replacement);
      };
      eventBus.on("test-event", original);

      eventBus.emit("test-event", undefined);
      expect(calls).toEqual(["original"]);
      eventBus.emit("test-event", undefined);
      expect(calls).toEqual(["original", "replacement"]);
    });

    it("should remove listener", () => {
      const callback = vi.fn();
      eventBus.on("test-event", callback);

      eventBus.off("test-event", callback);
      eventBus.emit("test-event", undefined);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should only remove specified callback", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      eventBus.off("test-event", callback1);
      eventBus.emit("test-event", "data");

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith("data");
    });

    it("should handle removing non-existent listener gracefully", () => {
      const callback = vi.fn();

      expect(() => {
        eventBus.off("test-event", callback);
      }).not.toThrow();
    });
  });

  describe("once", () => {
    it("should call listener only once", () => {
      const callback = vi.fn();
      eventBus.once("test-event", callback);

      eventBus.emit("test-event", "data1");
      eventBus.emit("test-event", "data2");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith("data1");
    });

    it("should work with multiple once listeners", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.once("test-event", callback1);
      eventBus.once("test-event", callback2);

      eventBus.emit("test-event", "data");

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it("should not interfere with regular listeners", () => {
      const onceCallback = vi.fn();
      const regularCallback = vi.fn();

      eventBus.once("test-event", onceCallback);
      eventBus.on("test-event", regularCallback);

      eventBus.emit("test-event", "data1");
      eventBus.emit("test-event", "data2");

      expect(onceCallback).toHaveBeenCalledTimes(1);
      expect(regularCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("edge cases", () => {
    it("should handle emitting event with no listeners", () => {
      expect(() => {
        eventBus.emit("no-listeners", undefined);
      }).not.toThrow();
    });

    it("should handle callback errors gracefully", () => {
      const errorCallback = vi.fn(() => {
        throw new Error("Callback error");
      });
      const successCallback = vi.fn();

      eventBus.on("test-event", errorCallback);
      eventBus.on("test-event", successCallback);

      expect(() => {
        eventBus.emit("test-event", undefined);
      }).not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });

    it("should support complex data types", () => {
      const callback = vi.fn();
      const complexData = {
        nested: {
          array: [1, 2, 3],
          object: { key: "value" },
        },
      };

      eventBus.on("test-event", callback);
      eventBus.emit("test-event", complexData);

      expect(callback).toHaveBeenCalledWith(complexData);
    });
  });

  describe("removeAllListeners", () => {
    it("finishes the active emission when a listener removes all registrations", () => {
      const calls: string[] = [];
      eventBus.on("test-event", () => {
        calls.push("first");
        eventBus.removeAllListeners("test-event");
      });
      eventBus.on("test-event", () => {
        calls.push("second");
      });

      eventBus.emit("test-event", undefined);
      expect(calls).toEqual(["first", "second"]);
      eventBus.emit("test-event", undefined);
      expect(calls).toEqual(["first", "second"]);
    });

    it("should remove all listeners for specific event", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);
      eventBus.on("other-event", callback1);

      eventBus.removeAllListeners("test-event");

      eventBus.emit("test-event", undefined);
      eventBus.emit("other-event", undefined);

      expect(callback2).not.toHaveBeenCalled();

      expect(callback1).toHaveBeenCalledTimes(1);
    });

    it("should remove all listeners for all events when no event specified", () => {
      const callback = vi.fn();

      eventBus.on("event1", callback);
      eventBus.on("event2", callback);
      eventBus.once("event3", callback);

      eventBus.removeAllListeners();

      eventBus.emit("event1", undefined);
      eventBus.emit("event2", undefined);
      eventBus.emit("event3", undefined);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should remove once listeners too", () => {
      const callback = vi.fn();

      eventBus.once("test-event", callback);
      eventBus.removeAllListeners("test-event");

      eventBus.emit("test-event", undefined);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("listenerCount", () => {
    it("should return 0 for event with no listeners", () => {
      expect(eventBus.listenerCount("no-listeners")).toBe(0);
    });

    it("should count regular listeners", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.on("test-event", callback2);

      expect(eventBus.listenerCount("test-event")).toBe(2);
    });

    it("should count once listeners", () => {
      const callback = vi.fn();

      eventBus.once("test-event", callback);

      expect(eventBus.listenerCount("test-event")).toBe(1);
    });

    it("should count both regular and once listeners", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on("test-event", callback1);
      eventBus.once("test-event", callback2);

      expect(eventBus.listenerCount("test-event")).toBe(2);
    });

    it("should update count after removing listeners", () => {
      const callback = vi.fn();

      eventBus.on("test-event", callback);
      expect(eventBus.listenerCount("test-event")).toBe(1);

      eventBus.off("test-event", callback);
      expect(eventBus.listenerCount("test-event")).toBe(0);
    });
  });
});
