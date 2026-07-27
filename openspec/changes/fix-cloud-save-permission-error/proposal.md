## Why

Every app load logs `Failed to load cloud match save: FirebaseError: Missing or insufficient permissions.` to the console. `connectMatchSavePersistenceToAuth()` (`src/firebase/cloudMatchSaveRepository.ts`) fires `fetchCloudMatchSave(user.uid)` the instant `onAuthStateChanged` reports a restored session, but Firestore's own request can still see a stale/absent ID token at that exact moment (a well-known Firebase race between auth-state restoration and the token actually being attached to outgoing requests), so the read is rejected under `firestore.rules`'s owner-only rule even though the user does own the document. The catch-all handler treats this the same as any other failure: it logs a raw `FirebaseError` via `console.error` and drops the match-save repository back to `null`, silently losing the user's resumable local match for that session.

## What Changes

- The cloud match-save load SHALL wait for a fresh ID token (`user.getIdToken()`) before issuing the Firestore read, closing the race that produces the permission-denied response on a normal, authorized load.
- A `permission-denied` (or `unauthenticated`) error from that read SHALL be treated as a recoverable condition: log it with `console.warn` (not `console.error`) and retry the read once after the token refresh completes, rather than surfacing it as an app-level failure.
- If the retry still fails, the repository SHALL fall back to the local-only match save (matching today's signed-out behavior) instead of leaving `null`, so the user doesn't lose their in-progress match resume over a transient cloud hiccup.
- Any other (non-permission) Firestore error SHALL keep today's behavior: logged via `console.error`, repository set to `null`.

## Capabilities

### Modified Capabilities
- `online-auth-persistence`: add a requirement that a transient permission-denied response while loading a signed-in user's cloud match save is retried once after a token refresh and degrades to the local save rather than logging an uncaught error or losing the resumable match.

## Impact

- `src/firebase/cloudMatchSaveRepository.ts`: `fetchCloudMatchSave`, `connectMatchSavePersistenceToAuth`.
- No Firestore rules change — `firestore.rules`'s existing owner-only rule for `users/{uid}/saved-matches/{saveId}` is already correct; the bug is a client-side race, not an authorization gap.
