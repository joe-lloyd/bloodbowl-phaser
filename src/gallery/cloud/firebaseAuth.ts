import { type CloudUser, cloudUser } from "./cloudData";
import { FirebaseError } from "./firebaseApp";

const refuse = () =>
  Promise.reject(
    new FirebaseError("auth/gallery", "The gallery does not sign in.")
  );

export class GoogleAuthProvider {
  readonly providerId = "gallery";
}

export const getAuth = () => ({ currentUser: cloudUser() });
export const connectAuthEmulator = () => undefined;
export const createUserWithEmailAndPassword = refuse;
export const signInWithEmailAndPassword = refuse;
export const signInWithPopup = refuse;
export const sendEmailVerification = refuse;
export const sendPasswordResetEmail = refuse;
export const signOut = () => Promise.resolve();

export function onAuthStateChanged(
  _auth: unknown,
  next: (user: CloudUser | null) => void
): () => void {
  next(cloudUser());
  return () => undefined;
}
