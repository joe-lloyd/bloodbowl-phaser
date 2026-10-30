/**
 * Admin gating for the dev-tools "Extras" area (Sandbox, Sound Test).
 *
 * Purely client-side: these pages expose no protected data, they're just
 * hidden from regular coaches on the deployed site. Admin accounts are an
 * email allowlist, overridable via VITE_ADMIN_EMAILS (comma-separated).
 * Without Firebase configured (pure local dev) there are no accounts at
 * all, so everything stays available.
 */

import { AuthUser } from "./auth";
import { isFirebaseConfigured } from "./config";

const DEFAULT_ADMIN_EMAILS = "joe.lloyd.22.24@gmail.com";

/** The build settings the admin check reads. */
export interface AdminEnv {
  VITE_ADMIN_EMAILS?: string;
  VITE_FIREBASE_USE_EMULATORS?: string;
}

/**
 * Is this address an admin? VITE_ADMIN_EMAILS lists them, comma-separated,
 * and falls back to the owner's address. "*" makes every account an admin,
 * but only on a build that talks to the local emulators, so it can never
 * open the dev tools on the deployed site.
 */
export function isAdminEmail(
  email: string | undefined,
  env: AdminEnv
): boolean {
  if (!email) return false;
  const listed = (env.VITE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const emulated = env.VITE_FIREBASE_USE_EMULATORS === "true";
  if (listed.includes("*") && emulated) return true;
  const emails = listed.filter((entry) => entry !== "*");
  const allowed = emails.length > 0 ? emails : [DEFAULT_ADMIN_EMAILS];
  return allowed.includes(email.toLowerCase());
}

export function isAdminUser(user: AuthUser | null): boolean {
  if (!isFirebaseConfigured()) return true;
  const env = import.meta.env;
  return isAdminEmail(user?.email ?? undefined, {
    VITE_ADMIN_EMAILS: env?.VITE_ADMIN_EMAILS,
    VITE_FIREBASE_USE_EMULATORS: env?.VITE_FIREBASE_USE_EMULATORS,
  });
}
