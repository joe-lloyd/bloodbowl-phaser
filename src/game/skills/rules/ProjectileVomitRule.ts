/**
 * Projectile Vomit (2025 rulebook p.133, trait) — a Special Action against
 * an adjacent Standing opposition player: roll a D6. On a 2+, an
 * unmodifiable Armour Roll against the target (broken → Injury Roll). On a
 * 1, the same against THIS player (covered in acidic bile). May replace the
 * Block of a Blitz. The activation ends once resolved; never a turnover
 * unless a downed carrier drops the ball.
 *
 * The behaviour lives in ProjectileVomitOperation (declared action "vomit",
 * Stab pattern). This registration marks the trait implemented for the
 * coverage gate.
 */

import { SkillRule } from "../SkillRule";

export const ProjectileVomitRule: SkillRule = {};
