import { z } from "zod";

const environmentSchema = z.object({
  VITE_FIREBASE_API_KEY: z.string().exactOptional(),
  VITE_FIREBASE_AUTH_DOMAIN: z.string().exactOptional(),
  VITE_FIREBASE_PROJECT_ID: z.string().exactOptional(),
  VITE_FIREBASE_APP_ID: z.string().exactOptional(),
  VITE_FIREBASE_USE_EMULATORS: z.string().exactOptional(),
  VITE_FIREBASE_AUTH_EMULATOR_PORT: z.string().exactOptional(),
  VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: z.string().exactOptional(),
  VITE_ADMIN_EMAILS: z.string().exactOptional(),
});

export function firebaseEnvironment() {
  const value: unknown = import.meta.env;
  return environmentSchema.parse(value ?? {});
}

export function firebaseAppConfig() {
  const environment = firebaseEnvironment();
  const apiKey = environment.VITE_FIREBASE_API_KEY;
  const authDomain = environment.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = environment.VITE_FIREBASE_PROJECT_ID;
  const appId = environment.VITE_FIREBASE_APP_ID;
  return apiKey && authDomain && projectId && appId
    ? { apiKey, authDomain, projectId, appId }
    : null;
}
