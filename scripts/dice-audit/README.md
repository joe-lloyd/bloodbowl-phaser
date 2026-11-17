# Dice audit

Every match played in the browser keeps a dice log: each roll the engine
made, with the generator's state after it, and each re-roll with the dice
before and after. A re-roll that came up the same as the roll it replaced
is flagged `repeated`. The sandbox keeps none.

## Where the logs are

- This browser's localStorage keeps the newest 20 matches, under
  `bloodbowl_dice_log_<id>`, listed in `bloodbowl_dice_logs`.
- A signed-in coach's logs also go to Firestore, at
  `users/{uid}/dice-logs/{id}`. They upload at the end of each turn, drive
  and phase.

## Audit them

Fetch everyone's logs from Firestore, optionally only those since a date,
and audit them:

```sh
FIRESTORE_TOKEN=$(ssh vault token bloodbowl-sevens/firestore-key) \
  pnpm dice:fetch logs.json 2026-11-17
pnpm dice:audit logs.json
```

To audit a browser's logs instead, copy them from its console into a file:

```js
copy(JSON.stringify(JSON.parse(localStorage.bloodbowl_dice_logs)
  .map((id) => JSON.parse(localStorage["bloodbowl_dice_log_" + id]))))
```

To compare against many games of the real engine, simulate some:

```sh
pnpm dice:simulate sim.json 500
pnpm dice:audit sim.json
```

The audit reports:

- Whether the D6 and block dice faces are fair, by chi-squared.
- Any roll that took numbers the generator had already used. The
  generator only moves forward, so this should never happen.
- How often team and Veteran re-rolls repeated the dice they replaced,
  against the chance of that for those exact dice.
- Every repeated re-roll, by match, half and turn.
