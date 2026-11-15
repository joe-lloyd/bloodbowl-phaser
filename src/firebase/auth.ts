/**
 * Auth - Google sign-in via Firebase Auth with a subscribable user state.
 *
 * Gracefully inert when Firebase isn't configured: subscribers immediately
 * get null and sign-in rejects with a clear error the UI can show.
 */

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth, isFirebaseConfigured } from "./config";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  /** True for Google, and for an email sign-up once its link is clicked. */
  emailVerified: boolean;
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
    emailVerified: user.emailVerified,
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

function requireConfigured(): void {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Online play is not configured. Add Firebase config to .env.local (see .env.example)."
    );
  }
}

/** What a coach is told when an email sign-in or sign-up is refused. */
export function authErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/invalid-email":
      return "That is not an email address.";
    case "auth/email-already-in-use":
      return "An account already uses this email. Sign in instead, with the password or with Google.";
    case "auth/weak-password":
      return "Use a password of at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute and try again.";
    case "auth/popup-closed-by-user":
      return "The Google window was closed before signing in.";
    default:
      return error instanceof Error ? error.message : String(error);
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthUser> {
  requireConfigured();
  const credential = await signInWithEmailAndPassword(
    getFirebaseAuth(),
    email.trim(),
    password
  );
  return toAuthUser(credential.user)!;
}

/** A new email account; a link to prove the address goes to it. */
export async function createAccountWithEmail(
  email: string,
  password: string
): Promise<AuthUser> {
  requireConfigured();
  const credential = await createUserWithEmailAndPassword(
    getFirebaseAuth(),
    email.trim(),
    password
  );
  await sendEmailVerification(credential.user).catch(() => {});
  return toAuthUser(credential.user)!;
}

export async function sendPasswordReset(email: string): Promise<void> {
  requireConfigured();
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await signOut(getFirebaseAuth());
}
