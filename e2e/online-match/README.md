# An online match between two machines

`twoCoaches.e2e.ts` plays one Sevens match between two browsers, each
driven as its own coach through the real UI. Online play is lockstep: both
browsers run the engine, the acting coach runs each command locally and
sends only the command with state checksums. After every move it compares
the engine state each page holds and where each canvas draws the players,
the ball and the scoreboard. A difference that outlasts a grace period goes
to `divergences.jsonl` with a screenshot from each side.

`DISRUPT` adds failures at given move counts, for example
`DISRUPT=40:guest-offline-20,90:host-reload,140:guest-away-45`. The kinds
are `offline` (network cut for N seconds), `reload`, and `away` (tab closed
for N seconds, then the match reopened).

## Running it across two machines

The app, the Firebase emulators and the guest's browser can each live on a
different machine. Firebase's sign-in popup only works on a secure origin,
so every browser has to load the app and the emulators from `127.0.0.1`.
SSH tunnels make that true on both machines.

On the guest machine:

1. Run the emulators (auth and Firestore, project `demo-bloodbowl`) with
   this repo's `firestore.rules`.
2. Install `playwright` at the version in `package.json` and start a
   browser server: `playwright launch-server --browser chromium --config
   server.json`, where `server.json` sets `host`, `port` and a random
   `wsPath`.

On the host machine:

```sh
ssh -N -L 19099:localhost:19099 -L 18080:localhost:18080 \
  -R 127.0.0.1:5199:127.0.0.1:5199 <guest-machine>
VITE_FIREBASE_AUTH_EMULATOR_PORT=19099 \
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=18080 \
  pnpm exec vite --mode e2e-online --host 127.0.0.1 --port 5199
GUEST_WS=ws://<guest-machine>:<port>/<wsPath> \
APP_URL=http://127.0.0.1:5199 \
  pnpm e2e:online-match
```

Serve the app from a checkout you are not editing: Vite reloads both pages
when a source file changes, which ends the match.

Without `GUEST_WS` both browsers run locally.

## What a run leaves behind

In `ONLINE_OUT`: `match.log`, `divergences.jsonl`, a video per side (and
one per closed tab), `video-starts.log` (when each recording began, on the
host machine's clock, for lining the videos up), `net-*.log` (every
envelope with its size and timing), `latency.log` (how long each coach's
own move took to show) and `lockstep-*.log` (checksum mismatches). Each
page shows a strip with that machine's clock and whether its coach may
act, so a side-by-side edit can be checked by eye.

Restart the emulator before a long run, then sign in once by hand: the
first sign-in after a restart can take longer than the test allows.
