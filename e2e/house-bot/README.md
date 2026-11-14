# The house bot

A scripted coach that hosts online games on the production backend, so an
admin can play an online match without a second person. It runs on
old-mac, plays with the same AI as the computer opponent, and hosts the
next game when one ends.

An admin joins from the main menu: Extras, Play the House Bot. The button
looks in `houseBots` for a lobby still waiting for a guest and joins it.
If no bot is waiting it says so.

## How it works

- The bot is an ordinary coach account with an email and password, not a
  Google account. On its first run the runner makes up a password and
  keeps it in `~/.bb-house-bot/credentials.json`, readable only by your
  user. It hands the login to the bot's page in memory, and the app signs
  in, creating the account (coach name House Bot) the first time. The
  address is `house-bot@home.arpa`, and `firestore.rules` lets only that
  account announce a lobby, so another coach cannot pose as the bot.
- The runner sets the `bb-house-bot` flag in that browser. While the bot's
  lobby waits for a guest, the app writes the code to `houseBots/{uid}`
  every minute. Any signed-in coach may read it. An announcement older
  than three minutes is ignored.
- The page loads the app from a Vite dev server on old-mac, because the AI
  driver (`e2e/fullgame/brain.ts`) imports the running engine from it. That
  server reads the production Firebase config from `.env`.
- The bot's team, House Bot Orcs, uses Matched Play, so it owes no skill
  pick after a game and can start the next one at once.
- If the other coach ends the match early, the bot agrees and hosts the
  next one.

## Running it

Email/Password sign-in must be enabled once in the Firebase console:
Authentication, Sign-in method, Email/Password.

Run it from a checkout of `main` that matches the deployed site: the online
protocol refuses a coach on a different version.

```sh
git worktree add ~/house-bot origin/main   # once; later: git -C ~/house-bot pull
cd ~/house-bot
pnpm install
cp ~/Projects/MyProjects/bloodbowl-phaser/.env .env

pnpm house-bot   # hosts games until stopped
```

- `HOUSE_BOT_HEADED=1` shows the bot's browser.
- `HOUSE_BOT_MATCHES=1` stops after one match.
- `HOUSE_BOT_PORT` changes the Vite port from 5299.
- `HOUSE_BOT_OUT` changes where `bot.log` and screenshots go, from
  `~/.bb-house-bot/logs`.
