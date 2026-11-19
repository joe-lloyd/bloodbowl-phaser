import {
  firebaseAppConfig,
  firebaseEnvironment,
} from "../boundary/firebaseEnvironment";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let initialized = false;

function init(): void {
  if (initialized) return;
  initialized = true;

  const config = firebaseAppConfig();
  if (!config) return;

  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);

  const env = firebaseEnvironment();

  if (env.VITE_FIREBASE_USE_EMULATORS === "true") {
    const authPort = environmentValue(
      env.VITE_FIREBASE_AUTH_EMULATOR_PORT,
      "9099"
    );
    const firestorePort = Number(
      environmentValue(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT, "8080")
    );
    connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, "127.0.0.1", firestorePort);
  }
}

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

function environmentValue(value: string | undefined, fallback: string): string {
  return value?.length ? value : fallback;
}
