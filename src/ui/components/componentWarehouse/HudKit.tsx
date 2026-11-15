/**
 * HudKit: the game's UI primitives ("Stadium Broadcast").
 *
 * Every floating panel, dialog and button in the match, and every page
 * around it (menu, team builder, competitions, lobby), is built from these,
 * so the look lives in one place. Tokens are Tailwind `hud-*` entries
 * (tailwind.config.js); `.hud-slab`, `.hud-label`, `.hud-field`,
 * `.hud-page`, `.hud-table` and `.hud-check` are in styles/global.css.
 */
export * from "./hudTone";
export * from "./HudPanel";
export * from "./HudButton";
export * from "./HudBits";
export * from "./HudDialog";
export * from "./HudPage";
