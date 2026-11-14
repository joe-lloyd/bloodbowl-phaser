/**
 * The house bot's account. firestore.rules lets only this address announce
 * a lobby in `houseBots`, so another coach cannot pose as the bot. Kept
 * apart from houseBot.ts so the Node runner can read it without Firebase.
 */
export const HOUSE_BOT_EMAIL = "house-bot@home.arpa";
