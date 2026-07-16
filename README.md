# Blood Bowl Sevens

Blood Bowl Sevens (2025 rules) in the browser — Phaser 3 board + React UI, with a
fully headless engine (`pnpm headless`) driven by a JSON action protocol.

## Development

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm test         # Vitest
pnpm headless     # play a game in the terminal (add --json for AI stdio mode)
```

## Online multiplayer (Firebase)

Online play (host/join, cloud team library, chat) uses Firebase: Auth (Google
sign-in), Firestore (lobbies + message bus), and Cloud Functions (edge
validation). Without Firebase config the app still runs — local hotseat play
and team building work signed-out; only Host/Join require it.

### Setup

1. Create a Firebase project at <https://console.firebase.google.com>.
2. Enable **Authentication → Google** provider.
3. Enable **Firestore** (production mode; rules ship in `firestore.rules`).
4. Add a **Web app** in Project settings and copy its config into `.env.local`
   (see `.env.example` for the variable names).
5. Deploy the security rules (free Spark plan):
   `npm i -g firebase-tools`, `firebase login`, then
   `firebase deploy --only firestore:rules`.
   **Do not deploy functions** unless you've upgraded to Blaze — Cloud
   Functions can't be deployed on the free plan, and the game fully works
   without them (join is a client-side transaction enforced by the rules;
   the Function is an optional extra validation layer).
6. Recommended: enable a Firestore **TTL policy** on the `games` collection's
   `expiresAt` field (console → Firestore → TTL) so abandoned lobbies are
   reaped automatically. Cleanly finished matches delete themselves.

### Local emulators

```bash
firebase emulators:start --only auth,firestore   # auth :9099, firestore :8080
# then set VITE_FIREBASE_USE_EMULATORS=true in .env.local
```

### Security model (read this before worrying about the API key)

The Firebase client config in `.env.local` is **publishable, not secret** —
every Firebase web app ships it to the browser. Security is enforced by:

- **Firestore rules** (`firestore.rules`): your team library is owner-only;
  only a game's two members can write to it; chat/command messages must be
  `from` the authenticated writer and are append-only.
- **Cloud Functions** (`functions/`): validate lobby create/join and roster
  legality. They do *not* run gameplay — the host browser is authoritative
  (friends-play trust model), which keeps Function invocations rare and the
  whole stack inside Firebase's free (Spark) tier.

### Cost posture

Turn-based play writes a handful of Firestore docs per turn and calls a
Function only at lobby create/join. No per-second writes (the turn timer is
derived client-side from a stored deadline), one snapshot listener per client,
and finished games are cleaned up — designed to stay free.
