/**
 * Cloud Functions — edge validation only.
 *
 * These validate the rare, security-relevant edges of a match (lobby
 * create/join, roster legality). They deliberately do NOT execute game
 * commands: the host browser is authoritative for gameplay (friends-play
 * trust model), which keeps Function invocations rare and free-tier safe.
 *
 * Implementations land in the cloud-functions task (6.1).
 */

import { initializeApp } from "firebase-admin/app";

initializeApp();

// Callable functions are exported here in task 6.1:
// export { createLobby, joinLobby } from "./lobby";
