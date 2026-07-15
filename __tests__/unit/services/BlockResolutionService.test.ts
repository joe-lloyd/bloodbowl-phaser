import { describe, it, expect } from "vitest";
import { BlockResolutionService } from "../../../src/services/BlockResolutionService";
import { RNGService } from "../../../src/services/rng/RNGService";

/**
 * Push option tiers (rulebook p.55): unoccupied squares whenever any exist;
 * the crowd when only off-pitch exits remain; occupied squares (chain push)
 * only when fully boxed in on-pitch.
 */
describe("BlockResolutionService.getPushOptions", () => {
  const service = new BlockResolutionService(new RNGService(1));

  const nobodyThere = () => false;
  const occupiedAt =
    (...squares: { x: number; y: number }[]) =>
    (x: number, y: number) =>
      squares.some((s) => s.x === x && s.y === y);

  it("offers all three squares behind the defender when open", () => {
    const { options, tier } = service.getPushOptions(
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      nobodyThere
    );
    expect(tier).toBe("open");
    expect(options).toHaveLength(3);
    expect(options).toEqual(
      expect.arrayContaining([
        { x: 11, y: 4 },
        { x: 11, y: 5 },
        { x: 11, y: 6 },
      ])
    );
  });

  it("offers only unoccupied squares when some are taken", () => {
    const { options, tier } = service.getPushOptions(
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      occupiedAt({ x: 11, y: 4 }, { x: 11, y: 5 })
    );
    expect(tier).toBe("open");
    expect(options).toEqual([{ x: 11, y: 6 }]);
  });

  it("forces a chain push when all squares are occupied on-pitch", () => {
    const { options, tier } = service.getPushOptions(
      { x: 9, y: 5 },
      { x: 10, y: 5 },
      occupiedAt({ x: 11, y: 4 }, { x: 11, y: 5 }, { x: 11, y: 6 })
    );
    expect(tier).toBe("chain");
    expect(options).toHaveLength(3);
  });

  it("offers the crowd when the sideline blocks everything else", () => {
    // Defender on the top sideline; both on-pitch squares occupied, so the
    // only exit is the off-pitch square above
    const { options, tier } = service.getPushOptions(
      { x: 9, y: 0 },
      { x: 10, y: 0 },
      occupiedAt({ x: 11, y: 0 }, { x: 11, y: 1 })
    );
    expect(tier).toBe("crowd");
    expect(options).toEqual([{ x: 11, y: -1 }]);
  });

  it("offers only the crowd behind the end zone", () => {
    // Defender in the far end zone column pushed straight off the pitch
    const { options, tier } = service.getPushOptions(
      { x: 24, y: 5 },
      { x: 25, y: 5 },
      nobodyThere
    );
    expect(tier).toBe("crowd");
    expect(options).toHaveLength(3);
    options.forEach((o) => expect(o.x).toBe(26));
  });

  it("prefers an open square over the crowd at the sideline", () => {
    // One on-pitch square free: the crowd must not be offered
    const { options, tier } = service.getPushOptions(
      { x: 9, y: 0 },
      { x: 10, y: 0 },
      occupiedAt({ x: 11, y: 0 })
    );
    expect(tier).toBe("open");
    expect(options).toEqual([{ x: 11, y: 1 }]);
  });
});
