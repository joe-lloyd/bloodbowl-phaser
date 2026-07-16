/**
 * useAuth - React binding for the Firebase auth state.
 */

import { useEffect, useState } from "react";
import {
  AuthUser,
  getCurrentUser,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
} from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";

export interface UseAuth {
  user: AuthUser | null;
  /** False when no Firebase config is present (online play unavailable) */
  onlineAvailable: boolean;
  signIn: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser);

  useEffect(() => subscribeToAuth(setUser), []);

  return {
    user,
    onlineAvailable: isFirebaseConfigured(),
    signIn: signInWithGoogle,
    signOut: signOutUser,
  };
}
