# online-auth-persistence

## ADDED Requirements

### Requirement: Cloud match-save load tolerates a transient permission race
Loading a signed-in user's cloud match save SHALL request a fresh ID token before reading Firestore. If that read is rejected with a `permission-denied` or `unauthenticated` error, it SHALL be retried once after forcing a token refresh, and SHALL NOT be logged as an application error on that first rejection. If the retry also fails, the match-save repository SHALL fall back to the local-only save rather than becoming unavailable, and only that final failure SHALL be logged as an error.

#### Scenario: A transient permission race recovers silently
- **WHEN** the first cloud match-save read for a newly signed-in user is rejected with `permission-denied`
- **THEN** the read is retried once after a forced token refresh with no `console.error`, and if the retry succeeds the cloud save loads normally

#### Scenario: A repeated permission failure degrades to local
- **WHEN** both the initial read and the retried read are rejected with `permission-denied`
- **THEN** the match-save repository falls back to the local save instead of `null`, and the failure is logged once

#### Scenario: A non-permission error is unaffected
- **WHEN** the cloud match-save read fails with an error other than `permission-denied` or `unauthenticated`
- **THEN** it is logged as an error and the repository falls back to `null`, unchanged from today's behavior
