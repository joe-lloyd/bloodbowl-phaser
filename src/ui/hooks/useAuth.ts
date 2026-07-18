/**
 * useAuth - React binding for the Firebase auth state.
 */

import { useEffect, useState } from "react";
import {
  AuthUser,
  getCurrentUser,
  isAuthResolved,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
} from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";

export interface UseAuth {
  user: AuthUser | null;
  /** True once the initial auth state is known — a null user before then
   * may just be a session still restoring */
  ready: boolean;
  /** False when no Firebase config is present (online play unavailable) */
  onlineAvailable: boolean;
  signIn: () => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser);
  const [ready, setReady] = useState(isAuthResolved);

  useEffect(
    () =>
      subscribeToAuth((next) => {
        setUser(next);
        setReady(isAuthResolved());
      }),
    []
  );

  return {
    user,
    ready,
    onlineAvailable: isFirebaseConfigured(),
    signIn: signInWithGoogle,
    signOut: signOutUser,
  };
}
