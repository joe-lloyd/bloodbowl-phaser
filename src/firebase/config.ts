import {
  firebaseAppConfig,
  firebaseEnvironment,
} from "../boundary/firebaseEnvironment";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseState: {
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  initialized: boolean;
} = { app: null, auth: null, db: null, initialized: false };

function init(): void {
  if (firebaseState.initialized) return;
  firebaseState.initialized = true;

  const config = firebaseAppConfig();
  if (!config) return;

  const app = initializeApp(config);
  firebaseState.app = app;
  const auth = getAuth(app);
  firebaseState.auth = auth;
  const db = getFirestore(app);
  firebaseState.db = db;

  const env = firebaseEnvironment();

  if (env.VITE_FIREBASE_USE_EMULATORS !== "true") return;
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

export function isFirebaseConfigured(): boolean {
  init();
  return firebaseState.app !== null;
}

export function getFirebaseAuth(): Auth {
  init();
  if (!firebaseState.auth) throw new Error("firebase-not-configured");
  return firebaseState.auth;
}

export function getDb(): Firestore {
  init();
  if (!firebaseState.db) throw new Error("firebase-not-configured");
  return firebaseState.db;
}

function environmentValue(value: string | undefined, fallback: string): string {
  return value?.length ? value : fallback;
}
