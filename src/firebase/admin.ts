import { firebaseEnvironment } from "../boundary/firebaseEnvironment";
import { type AuthUser } from "./auth";
import { isFirebaseConfigured } from "./config";

const DEFAULT_ADMIN_EMAILS = "joe.lloyd.22.24@gmail.com";

export interface AdminEnv {
  VITE_ADMIN_EMAILS?: string;
  VITE_FIREBASE_USE_EMULATORS?: string;
}

export function isAdminEmail(
  email: string | undefined,
  env: AdminEnv,

  verified = true
): boolean {
  if (!email) return false;
  const listed = (env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const emulated = env.VITE_FIREBASE_USE_EMULATORS === "true";
  if (listed.includes("*") && emulated) return true;

  if (!verified) return false;
  const emails = listed.filter((entry) => entry !== "*");
  const allowed = emails.length > 0 ? emails : [DEFAULT_ADMIN_EMAILS];
  return allowed.includes(email.toLowerCase());
}

export function isAdminUser(user: AuthUser | null): boolean {
  if (!isFirebaseConfigured()) return true;
  const env = firebaseEnvironment();
  return isAdminEmail(
    user?.email ?? undefined,
    env,
    user?.emailVerified ?? false
  );
}
