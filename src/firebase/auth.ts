import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirebaseAuth, isFirebaseConfigured } from "./config";

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;

  emailVerified: boolean;
  photoURL: string | null;
}

export type ConfirmLink =
  | { kind: "sent" }
  | { kind: "failed"; message: string }
  | { kind: "resent" };

type AuthListener = (user: AuthUser | null) => void;

let currentUser: AuthUser | null = null;

let confirmLink: ConfirmLink = { kind: "sent" };

let linkAttempt = 0;
const listeners = new Set<AuthListener>();
let watching = false;
let resolved = false;

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return requireAuthUser(user);
}

function ensureWatching(): void {
  if (watching || !isFirebaseConfigured()) return;
  watching = true;
  onAuthStateChanged(getFirebaseAuth(), (user) => {
    resolved = true;
    const next = toAuthUser(user);
    if (next?.uid !== currentUser?.uid) {
      confirmLink = { kind: "sent" };
      linkAttempt++;
    }
    currentUser = next;
    listeners.forEach((listener) => {
      listener(currentUser);
    });
  });
}

async function sendLink(user: User, sent: ConfirmLink): Promise<void> {
  const attempt = ++linkAttempt;
  const report = (next: ConfirmLink) => {
    if (attempt !== linkAttempt) return;
    confirmLink = next;
    listeners.forEach((listener) => {
      listener(currentUser);
    });
  };
  await sendEmailVerification(user).then(
    () => {
      report(sent);
    },
    (error: unknown) => {
      report({ kind: "failed", message: authErrorMessage(error) });
    }
  );
}

export function getConfirmLink(): ConfirmLink {
  return confirmLink;
}

export function isAuthResolved(): boolean {
  ensureWatching();
  return !isFirebaseConfigured() || resolved;
}

export function getCurrentUser(): AuthUser | null {
  ensureWatching();
  return currentUser;
}

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

const BAD_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/wrong-password",
  "auth/user-not-found",
]);

export function authErrorMessage(error: unknown): string {
  const code = error instanceof FirebaseError ? error.code : "";
  if (BAD_CREDENTIAL_CODES.has(code)) return "Wrong email or password.";
  switch (code) {
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
  return requireAuthUser(credential.user);
}

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
  await sendLink(credential.user, { kind: "sent" });
  return requireAuthUser(credential.user);
}

export async function sendVerificationLink(): Promise<void> {
  requireConfigured();
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  await sendLink(user, { kind: "resent" });
}

export async function sendPasswordReset(email: string): Promise<void> {
  requireConfigured();
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function signOutUser(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await signOut(getFirebaseAuth());
}

function requireAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    photoURL: user.photoURL,
  };
}
