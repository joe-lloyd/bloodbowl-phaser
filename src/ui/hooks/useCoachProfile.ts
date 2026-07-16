/**
 * useCoachProfile - the current user's coach display name.
 *
 * This is the name shown to opponents in lobbies, chat, and the match, kept
 * separate from the Google account name so the real name is never leaked.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getCoachName,
  setCoachName as saveCoachName,
  defaultCoachName,
} from "../../firebase/lobby";
import { AuthUser } from "../../firebase/auth";

export interface UseCoachProfile {
  /** Stored coach name, or null if the user hasn't set one yet */
  coachName: string | null;
  /** The name actually used in matches (stored name or a safe default) */
  effectiveName: string;
  loading: boolean;
  save: (name: string) => Promise<void>;
}

export function useCoachProfile(user: AuthUser | null): UseCoachProfile {
  const [coachName, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setName(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getCoachName(user.uid)
      .then((name) => {
        if (!cancelled) setName(name);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const save = useCallback(
    async (name: string) => {
      if (!user) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      await saveCoachName(user.uid, trimmed);
      setName(trimmed);
    },
    [user]
  );

  return {
    coachName,
    effectiveName: coachName ?? (user ? defaultCoachName(user.uid) : "Coach"),
    loading,
    save,
  };
}
