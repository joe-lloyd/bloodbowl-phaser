import { type GameState } from "@/types/GameState";
import { Inducement } from "@/types/Inducements";
import { type Player } from "@/types/Player";
import { SkillType } from "@/types/Skills";
import { type DiceController } from "../controllers/DiceController";
import { inducementCount } from "./inventory";
import { getMatchInducements, revokeGrant } from "./matchInducements";
import { grantSkills } from "./potionShared";
import {
  type HeldSouvenir,
  SOUVENIRS,
  type Souvenir,
  getVariantInducements,
  souvenirsCarried,
} from "./variantState";

const SOUVENIR_SKILLS: Record<Souvenir, readonly SkillType[]> = {
  "Sports Sandals": [],
  "Suntan Lotion": [],
  Thong: [SkillType.DISTURBING_PRESENCE],
  Sunglasses: [SkillType.ACCURATE, SkillType.SAFE_PASS],
  Bottle: [SkillType.STAB],
  "Puka Shell Necklace": [SkillType.PRO],
  "Sticky Bun": [],
  Gatorcade: [SkillType.FRENZY, SkillType.JUMP_UP, SkillType.NO_BALL],
};

export function souvenirForRoll(roll: number): Souvenir {
  const souvenir = SOUVENIRS[Math.min(SOUVENIRS.length, Math.max(1, roll)) - 1];
  if (!souvenir) throw new Error(`No souvenir for ${String(roll)}`);
  return souvenir;
}

export function rollSouvenirs(
  state: GameState,
  dice: DiceController,
  teams: readonly { id: string; name: string }[]
): HeldSouvenir[] {
  const variant = getVariantInducements(state);
  if (variant.souvenirsRolled) return [];
  variant.souvenirsRolled = true;
  const rolled = teams.flatMap((team) =>
    Array.from(
      { length: inducementCount(state, team.id, Inducement.SOUVENIR) },
      () => ({
        teamId: team.id,
        souvenir: souvenirForRoll(
          dice.rollD8(`Souvenir Shop (${team.name})`, team.id)
        ),
      })
    )
  );
  variant.souvenirs.push(...rolled);
  return rolled;
}

export function unassignedSouvenirs(
  state: GameState,
  teamId: string
): HeldSouvenir[] {
  return (state.matchInducements?.variant?.souvenirs ?? []).filter(
    (held) => held.teamId === teamId && held.playerId === undefined
  );
}

export function assignSouvenir(
  state: GameState,
  held: HeldSouvenir,
  player: Player
): void {
  const mi = getMatchInducements(state);
  const variant = getVariantInducements(state);
  held.playerId = player.id;
  const before = mi.grants.length;
  grantSkills(state, player, SOUVENIR_SKILLS[held.souvenir]);
  variant.halfGrants.push(...mi.grants.splice(before));
}

export function breakSouvenirs(state: GameState, players: Player[]): void {
  const variant = state.matchInducements?.variant;
  if (!variant) return;
  for (const grant of variant.halfGrants) {
    const player = players.find((p) => p.id === grant.playerId);
    if (player) revokeGrant(player, grant);
  }
  variant.halfGrants = [];
  variant.souvenirs = variant.souvenirs.filter(
    (held) => held.playerId === undefined
  );
}

export type SouvenirRoll =
  | "rush"
  | "dodge"
  | "pick-up"
  | "catch"
  | "intercept"
  | "pass";

const ROLL_BONUS: Record<Souvenir, Partial<Record<SouvenirRoll, number>>> = {
  "Sports Sandals": { rush: 1 },
  "Suntan Lotion": { dodge: 1 },
  Thong: {},
  Sunglasses: {},
  Bottle: {},
  "Puka Shell Necklace": {},
  "Sticky Bun": { "pick-up": 1, catch: 1, intercept: 1, pass: -1 },
  Gatorcade: {},
};

export function souvenirModifier(
  state: GameState,
  playerId: string,
  roll: SouvenirRoll
): number {
  return souvenirsCarried(state, playerId).reduce(
    (sum, souvenir) => sum + (ROLL_BONUS[souvenir][roll] ?? 0),
    0
  );
}
