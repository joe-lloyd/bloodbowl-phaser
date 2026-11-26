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

const authState: {
  currentUser: AuthUser | null;
  confirmLink: ConfirmLink;
  linkAttempt: number;
  watching: boolean;
  resolved: boolean;
} = {
  currentUser: null,
  confirmLink: { kind: "sent" },
  linkAttempt: 0,
  watching: false,
  resolved: false,
};
const listeners = new Set<AuthListener>();

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return requireAuthUser(user);
}

function ensureWatching(): void {
  if (authState.watching || !isFirebaseConfigured()) return;
  authState.watching = true;
  onAuthStateChanged(getFirebaseAuth(), (user) => {
    authState.resolved = true;
    const next = toAuthUser(user);
    if (next?.uid !== authState.currentUser?.uid) {
      authState.confirmLink = { kind: "sent" };
      authState.linkAttempt++;
    }
    authState.currentUser = next;
    for (const listener of listeners) {
      listener(authState.currentUser);
    }
  });
}

async function sendLink(user: User, sent: ConfirmLink): Promise<void> {
  const attempt = ++authState.linkAttempt;
  const report = (next: ConfirmLink) => {
    if (attempt !== authState.linkAttempt) return;
    authState.confirmLink = next;
    for (const listener of listeners) {
      listener(authState.currentUser);
    }
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
  return authState.confirmLink;
}

export function isAuthResolved(): boolean {
  ensureWatching();
  return !isFirebaseConfigured() || authState.resolved;
}

export function getCurrentUser(): AuthUser | null {
  ensureWatching();
  return authState.currentUser;
}

export function subscribeToAuth(listener: AuthListener): () => void {
  ensureWatching();
  listeners.add(listener);
  listener(authState.currentUser);
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
