## 1. Token-race fix

- [x] 1.1 In `connectMatchSavePersistenceToAuth` (`src/firebase/cloudMatchSaveRepository.ts`), await `user.getIdToken()` before calling `fetchCloudMatchSave(user.uid)`
- [x] 1.2 Catch `permission-denied`/`unauthenticated` errors from the initial `fetchCloudMatchSave` call by `error.code`, `console.warn` instead of `console.error`, then retry once after `await user.getIdToken(true)`
- [x] 1.3 On a second failed permission-classified retry, fall back to `local` (same repository the signed-out path uses) instead of calling `setMatchSaveRepository(null)`, and log the failure once
- [x] 1.4 Leave the existing `console.error` + `setMatchSaveRepository(null)` behavior for any non-permission error unchanged

## 2. Verification

- [x] 2.1 Add a unit test around `connectMatchSavePersistenceToAuth`/`fetchCloudMatchSave` (mocking `getDoc` to reject with a `permission-denied` `FirebaseError` once then succeed) asserting no `console.error` call and a successful load
- [x] 2.2 Add a unit test for the double-failure path asserting fallback to the local repository and exactly one `console.error`
- [x] 2.3 Add a unit test asserting a non-permission error still logs via `console.error` and sets the repository to `null`
- [x] 2.4 Run the full unit test suite and confirm no regressions
