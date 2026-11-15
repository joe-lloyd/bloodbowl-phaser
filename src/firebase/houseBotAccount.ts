/**
 * The house bot's account. firestore.rules lets only this address announce
 * a lobby in `houseBots`, so another coach cannot pose as the bot. Kept
 * apart from houseBot.ts so the Node runner can read it without Firebase.
 */
export const HOUSE_BOT_EMAIL = "lead.mushroom+housebot@gmail.com";
/** The account made with that address; firestore.rules pins it as well. */
export const HOUSE_BOT_UID = "RXklxhmipMYFLUZNimxsbJWuJew1";
