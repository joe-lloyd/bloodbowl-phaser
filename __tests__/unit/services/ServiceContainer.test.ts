import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ServiceContainer } from "../../../src/services/ServiceContainer.js";
import { EventBus } from "../../../src/services/EventBus.js";
import { TeamBuilder } from "../../utils/test-builders.js";

describe("ServiceContainer", () => {
  let team1: any;
  let team2: any;

  beforeEach(() => {
    team1 = new TeamBuilder()
      .withId("team-1")
      .withName("Team 1")
      .withPlayers(7)
      .build();

    team2 = new TeamBuilder()
      .withId("team-2")
      .withName("Team 2")
      .withPlayers(7)
      .build();
  });

  afterEach(() => {
    ServiceContainer.reset();
  });

  describe("Initialization", () => {
    it("should initialize with teams", () => {
      const eventBus = new EventBus();
      const container = ServiceContainer.initialize(eventBus, team1, team2);

      expect(container).toBeDefined();
      expect(container.eventBus).toBeDefined();
      expect(container.gameService).toBeDefined();
    });

    it("should return same instance on subsequent calls", () => {
      const eventBus = new EventBus();
      const container1 = ServiceContainer.initialize(eventBus, team1, team2);
      const container2 = ServiceContainer.getInstance();

      expect(container1).toBe(container2);
    });

    it("should throw error if getInstance called before initialize", () => {
      expect(() => {
        ServiceContainer.getInstance();
      }).toThrow("ServiceContainer not initialized");
    });

    it("should report initialization status correctly", () => {
      expect(ServiceContainer.isInitialized()).toBe(false);

      const eventBus = new EventBus();
      ServiceContainer.initialize(eventBus, team1, team2);

      expect(ServiceContainer.isInitialized()).toBe(true);
    });
  });

  describe("Service Access", () => {
    beforeEach(() => {
      const eventBus = new EventBus();
      ServiceContainer.initialize(eventBus, team1, team2);
    });

    it("should provide access to EventBus", () => {
      const container = ServiceContainer.getInstance();

      expect(container.eventBus).toBeDefined();
      expect(typeof container.eventBus.on).toBe("function");
      expect(typeof container.eventBus.emit).toBe("function");
    });

    it("should provide access to GameService", () => {
      const container = ServiceContainer.getInstance();

      expect(container.gameService).toBeDefined();
      expect(typeof container.gameService.getPhase).toBe("function");
      expect(typeof container.gameService.placePlayer).toBe("function");
    });

    it("should share same EventBus between services", () => {
      const container = ServiceContainer.getInstance();
      let eventFired = false;

      (container.eventBus as any).on("test", () => {
        eventFired = true;
      });

      (container.eventBus as any).emit("test");

      expect(eventFired).toBe(true);
    });
  });

  describe("Reset", () => {
    it("should reset container to uninitialized state", () => {
      const eventBus = new EventBus();
      ServiceContainer.initialize(eventBus, team1, team2);
      expect(ServiceContainer.isInitialized()).toBe(true);

      ServiceContainer.reset();

      expect(ServiceContainer.isInitialized()).toBe(false);
      expect(() => ServiceContainer.getInstance()).toThrow();
    });

    it("should allow re-initialization after reset", () => {
      const eventBus1 = new EventBus();
      ServiceContainer.initialize(eventBus1, team1, team2);
      ServiceContainer.reset();

      const eventBus2 = new EventBus();
      const newContainer = ServiceContainer.initialize(eventBus2, team1, team2);

      expect(newContainer).toBeDefined();
      expect(ServiceContainer.isInitialized()).toBe(true);
    });
  });
});
