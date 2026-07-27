# online-auth-persistence

## Purpose

Define Google sign-in via Firebase Auth and per-user cloud persistence: online actions require a signed-in identity while local play stays available signed out, saved teams persist to the user's own Firestore library (or localStorage when signed out), and locally saved teams can be migrated on first sign-in.

## Requirements

### Requirement: Google sign-in

The system SHALL let a user sign in with Google via Firebase Auth, and sign out. The signed-in identity SHALL be available to the rest of the app as a stable user id. Local play and team building SHALL remain usable while signed out; only online (host/join) actions SHALL require a signed-in user.

#### Scenario: User signs in with Google

- **WHEN** a signed-out user chooses to sign in and completes the Google flow
- **THEN** the app shows them as signed in and their user id is available to online features

#### Scenario: Online action requires sign-in

- **WHEN** a signed-out user chooses Host Game or Join Game
- **THEN** they are prompted to sign in first and the online action proceeds only after sign-in succeeds

#### Scenario: Local play without sign-in

- **WHEN** a signed-out user builds a team or starts a local hotseat game
- **THEN** it works without any sign-in prompt

### Requirement: Cloud team library

For a signed-in user, saved teams SHALL persist to that user's Firestore team library and load from it, keyed by their user id. A user SHALL only be able to read and write their own team library. While signed out, teams SHALL persist to and load from `localStorage` as before.

#### Scenario: Signed-in team saved to cloud

- **WHEN** a signed-in user saves a team
- **THEN** the team is stored in their Firestore library and is available after they sign in on another device

#### Scenario: Signed-out team stays local

- **WHEN** a signed-out user saves a team
- **THEN** the team persists in `localStorage` only and is not written to Firestore

#### Scenario: Library isolation

- **WHEN** a signed-in user loads their team library
- **THEN** they see only their own teams and cannot read another user's teams

### Requirement: One-time migration of local teams

On a user's first sign-in, any teams already stored in `localStorage` SHALL be offered for migration into their Firestore library. Migration SHALL NOT silently overwrite existing cloud teams, and declining SHALL leave local teams untouched.

#### Scenario: Local teams migrated on first sign-in

- **WHEN** a user with locally saved teams signs in for the first time and accepts migration
- **THEN** those teams appear in their Firestore library and remain available on other devices

#### Scenario: Migration declined

- **WHEN** the user declines the migration offer
- **THEN** no teams are uploaded and the local teams remain available while signed out

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
