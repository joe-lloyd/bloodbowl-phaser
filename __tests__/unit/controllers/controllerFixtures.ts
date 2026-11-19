import type { InteractionMarker } from "../../../src/game/controllers/interaction/ports";
import { vi } from "vitest";
import { DiceController } from "../../../src/game/controllers/DiceController";
import { BallMovementController } from "../../../src/game/controllers/BallMovementController";
import { EventBus, type IEventBus } from "../../../src/services/EventBus";
import { RNGService } from "../../../src/services/rng/RNGService";
import { createTestPlayer } from "../../fixtures/players";
import { createTestTeam } from "../../fixtures/teams";
import { PlayerStatus, type Player, type PlayerStats } from "../../../src/types/Player";
import type { Team } from "../../../src/types/Team";

type PlayerInput = Partial<Omit<Player, "stats" | "baseStats">> & {
  stats?: Partial<PlayerStats>;
  baseStats?: Partial<PlayerStats>;
};

export function playerWith(input: PlayerInput = {}): Player {
  const base = createTestPlayer();
  const { stats, baseStats, ...rest } = input;
  return {
    ...base,
    status: PlayerStatus.ACTIVE,
    ...rest,
    stats: { ...base.stats, ...stats },
    baseStats: { ...base.baseStats, ...baseStats },
  };
}

export function teamWith(input: Partial<Team>): Team {
  return { ...createTestTeam(), ...input };
}

export function diceWith() {
  const dice = new DiceController(new EventBus(), new RNGService(1));
  const spies = {
    rollD3: vi.spyOn(dice, "rollD3"),
    rollD6: vi.spyOn(dice, "rollD6"),
    rollD8: vi.spyOn(dice, "rollD8"),
    rollD16: vi.spyOn(dice, "rollD16"),
    roll2D6: vi.spyOn(dice, "roll2D6"),
    rollMultipleD8: vi.spyOn(dice, "rollMultipleD8"),
    rollLowerOf2D6: vi.spyOn(dice, "rollLowerOf2D6"),
    rollSkillCheck: vi.spyOn(dice, "rollSkillCheck"),
  };
  return Object.assign(dice, { ...spies, spies });
}

export function movementWith() {
  const movement = new BallMovementController(diceWith());
  const spies = {
    bounce: vi.spyOn(movement, "bounce"),
    scatter: vi.spyOn(movement, "scatter"),
    deviate: vi.spyOn(movement, "deviate"),
  };
  return Object.assign(movement, { ...spies, spies });
}

export function busWith() {
  const bus = new EventBus();
  const spies = { emit: vi.spyOn(bus, "emit") };
  return Object.assign(bus, { ...spies, spies });
}

export function observeEmit(bus: IEventBus) {
  return vi.spyOn(bus, "emit");
}

export function markerWith(input: Partial<InteractionMarker> = {}) {
  const { destroy: destroyInput, ...rest } = input;
  const destroy = vi.fn<Parameters<InteractionMarker["destroy"]>, void>((...args) => { destroyInput?.(...args); });
  const marker: InteractionMarker = {
    scene: {},
    destroy,
    setName: () => marker,
  };
  return Object.assign(marker, { destroySpy: destroy }, rest);
}

export function skillCheckWith(input: Partial<ReturnType<DiceController["rollSkillCheck"]>>) {
  return { success: true, roll: 6, effectiveTotal: 6, needed: 3, ...input };
}
