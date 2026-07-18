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

function adminEmails(): Set<string> {
  const env =
    typeof import.meta !== "undefined"
      ? (import.meta as unknown as { env?: Record<string, string> }).env
      : undefined;
  const raw = env?.VITE_ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS;
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: AuthUser | null): boolean {
  if (!isFirebaseConfigured()) return true;
  const email = user?.email?.toLowerCase();
  return !!email && adminEmails().has(email);
}
