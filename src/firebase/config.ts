/**
 * Firebase bootstrap - lazy, guarded initialization.
 *
 * The client config is publishable (not a secret): security is enforced by
 * Firestore rules and Cloud Functions, never by hiding these values. When no
 * config is present (e.g. a fresh checkout, CI, headless), the app still runs
 * for local/signed-out play — online features check isFirebaseConfigured().
 */

import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, Auth } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from "firebase/firestore";

interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function readEnvConfig(): FirebaseEnvConfig | null {
  // import.meta.env is provided by Vite (and Vitest); guard for plain Node
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string> }).env
      : undefined;
  if (!env) return null;

  const apiKey = env.VITE_FIREBASE_API_KEY;
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const appId = env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return { apiKey, authDomain, projectId, appId };
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initialized = false;

function init(): void {
  if (initialized) return;
  initialized = true;

  const config = readEnvConfig();
  if (!config) return;

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  // Local emulators (firebase emulators:start) — opt in via env flag
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  if (env?.VITE_FIREBASE_USE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
}

/** True when a Firebase project is configured; online features require it. */
export function isFirebaseConfigured(): boolean {
  init();
  return app !== null;
}

export function getFirebaseAuth(): Auth {
  init();
  if (!auth) throw new Error("firebase-not-configured");
  return auth;
}

export function getDb(): Firestore {
  init();
  if (!db) throw new Error("firebase-not-configured");
  return db;
}
