## Context

`connectMatchSavePersistenceToAuth()` subscribes to Firebase auth and, on every signed-in callback, immediately calls `fetchCloudMatchSave(user.uid)` → `getDoc` on `users/{uid}/saved-matches/local`. `firestore.rules` allows this read whenever `request.auth.uid == uid`, which is true for the caller — but Firestore's SDK can dispatch the request before the freshly-restored session's ID token is attached, so the security-rule evaluation on the server sees no `request.auth` and denies it. The catch block treats every error identically (`console.error`, repository → `null`), so a purely transient race is indistinguishable from a real authorization bug and costs the user their resumable match.

## Goals / Non-Goals

**Goals:**
- Eliminate the spurious permission-denied on a normal, already-authorized load.
- Never regress to `null` (losing the resumable match) over a transient token race when a local or cloud save exists.

**Non-Goals:**
- Changing `firestore.rules` (the rule is already correct).
- Handling genuine authorization failures (e.g., a tampered uid) differently than today — those should still surface as errors.

## Decisions

- **Force a token refresh before the read, not a blind retry-after-failure.** Call `await user.getIdToken()` (cheap no-op if already fresh, forces a refresh if stale/pending) immediately before `fetchCloudMatchSave`. This closes the race at its source rather than papering over it.
- **Still keep one retry on `permission-denied`/`unauthenticated`**, in case the token call itself races the same restoration window: re-run the fetch once after `await user.getIdToken(true)` (forced refresh). This is the belt-and-suspenders layer for the rare double-race.
- **Classify by Firebase error `code`**, not by string-matching the message — `FirebaseError.code` is `'permission-denied'` / `'unauthenticated'` for this class; everything else keeps today's `console.error` + `null` behavior.
- **On exhausted retry, fall back to the local repository** (same shape as the signed-out path) instead of `null`, so the user can still resume their match this session; the next successful auth cycle will reconcile local/cloud as normal.

## Risks / Trade-offs

- [Forcing `getIdToken()` on every auth callback adds one extra network round-trip] → negligible; it only runs once per sign-in/session-restore, not per render, and Firebase caches the token client-side.
- [A genuine rules regression would now retry once before failing, adding a small delay to surfacing the real error] → acceptable; the error still surfaces, just one retry later, and is still logged.
