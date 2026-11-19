import { useEffect, useState } from "react";
import {
  type AuthUser,
  type ConfirmLink,
  getConfirmLink,
  getCurrentUser,
  isAuthResolved,
  signOutUser,
  subscribeToAuth,
} from "../../firebase/auth";
import { isFirebaseConfigured } from "../../firebase/config";

export interface UseAuth {
  user: AuthUser | null;

  ready: boolean;

  onlineAvailable: boolean;

  confirmLink: ConfirmLink;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser);
  const [ready, setReady] = useState(isAuthResolved);
  const [confirmLink, setConfirmLink] = useState(getConfirmLink);

  useEffect(
    () =>
      subscribeToAuth((next) => {
        setUser(next);
        setReady(isAuthResolved());
        setConfirmLink(getConfirmLink());
      }),
    []
  );

  return {
    user,
    ready,
    onlineAvailable: isFirebaseConfigured(),
    confirmLink,
    signOut: signOutUser,
  };
}
