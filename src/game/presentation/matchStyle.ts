/**
 * How the match looks: a pre-rendered Blood Bowl stadium, a matching render
 * of every player model, and the canvas colour around the stadium. There is
 * one look, so the scene, the sprites and the HUD read it from here.
 *
 * Saves, autosaves, online lobbies and links from before this may still
 * carry a pitch theme id (`presentation.pitchThemeId`, `settings.pitchThemeId`
 * or `?theme=`), such as the retired "neon". Nothing reads it any more, so
 * those matches open in this look.
 */
export const MATCH_STYLE = {
  /** Folder under public/ for the stadium backdrop and its meta.json. */
  stadiumPath: "/stadium/bloodbowl",
  /** Folder under public/ for the player atlases. */
  spritePath: "/sprites/bloodbowl",
  /** Canvas colour around the stadium. */
  background: 0x0b0805,
} as const;
