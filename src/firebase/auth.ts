/**
 * Auth - Google sign-in via Firebase Auth with a subscribable user state.
 *
 * Gracefully inert when Firebase isn't configured: subscribers immediately
 * get null and sign-in rejects with a clear error the UI can show.
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./config";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

type AuthListener = (user: AuthUser | null) => void;

let currentUser: AuthUser | null = null;
const listeners = new Set<AuthListener>();
let watching = false;
let resolved = false;

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
  };
}

function ensureWatching(): void {
  if (watching || !isFirebaseConfigured()) return;
  watching = true;
  onAuthStateChanged(getFirebaseAuth(), (user) => {
    resolved = true;
    currentUser = toAuthUser(user);
    listeners.forEach((listener) => listener(currentUser));
  });
}

/**
 * True once Firebase has reported the initial auth state (or when Firebase
 * isn't configured, so there is nothing to wait for). Until then a null
 * user may just mean "still restoring the session" — don't redirect on it.
 */
export function isAuthResolved(): boolean {
  ensureWatching();
  return !isFirebaseConfigured() || resolved;
}

/** Current signed-in user, or null (always null when unconfigured). */
export function getCurrentUser(): AuthUser | null {
  ensureWatching();
  return currentUser;
}

/**
 * Subscribe to auth state. The callback fires immediately with the current
 * state, then on every change. Returns an unsubscribe function.
 */
export function subscribeToAuth(listener: AuthListener): () => void {
  ensureWatching();
  listeners.add(listener);
  listener(currentUser);
  return () => listeners.delete(listener);
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Online play is not configured. Add Firebase config to .env.local (see .env.example)."
    );
  }
  const credential = await signInWithPopup(
    getFirebaseAuth(),
    new GoogleAuthProvider()
  );
  const user = toAuthUser(credential.user);
  if (!user) throw new Error("sign-in-returned-no-user");
  return user;
}

export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await signOut(getFirebaseAuth());
}
