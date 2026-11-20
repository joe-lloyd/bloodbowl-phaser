# The house bot

A scripted coach that hosts online games on the production backend, so an
admin can play an online match without a second person. It runs on
old-mac, plays with the same AI as the computer opponent, and hosts the
next game when one ends.

An admin joins from the main menu: Extras, Play the House Bot. The button
looks in `houseBots` for a lobby still waiting for a guest and joins it.
If no bot is waiting it says so.

The bot is also a friend you can invite. Add it on the Friends page with
its friend code, and it accepts the request by itself. Then host a game,
invite House Bot from the lobby, and it joins, picks one of its teams at
random and readies up. You host, so the game type, turn timer, timeout bank
and the rest of the settings are yours. Start the match when you are ready.
If the bot is already in a match, it joins as soon as that match ends,
while the invite is still fresh.

## How it works

- The bot is an ordinary coach account with an email and password, not a
  Google account. On its first run the runner makes up a password and
  keeps it in `~/.bb-house-bot/credentials.json`, readable only by your
  user. It hands the login to the bot's page in memory, and the app signs
  in, creating the account (coach name House Bot) the first time. The
  address is `lead.mushroom+housebot@gmail.com`, which reaches Joe's inbox.
  `firestore.rules` lets only that address, in the account with uid
  `HOUSE_BOT_UID` (`src/firebase/houseBotAccount.ts`), announce a lobby,
  so another coach cannot pose as the bot.
- The runner sets the `bb-house-bot` flag in that browser. While the bot's
  lobby waits for a guest, the app writes the code to `houseBots/{uid}`
  every minute. Any signed-in coach may read it. An announcement older
  than three minutes is ignored.
- The bot's browser flag enables the same planner and paced command loop
  as the local Standard computer opponent. Its choices go through the
  online session, including block dice, pushes, follow-ups and re-rolls.
  Both peers execute the same commands and check their resulting states.
- The runner handles sign-in, lobby hosting, the opening toss and leaving
  full time. It does not choose moves or translate them into board clicks.
  The page loads a Vite dev server on old-mac with the production Firebase
  config from `.env`.
- The bot owns House Bot Orcs and eight teams built from the computer team
  templates listed in `SQUAD` in the runner, all in Matched Play, so none
  owes a skill pick after a game. The runner drafts any that are missing on
  start. In a lobby it picks at random among the teams the lobby allows for
  its game type, and picks again if the host changes the game type.
- If the other coach ends the match early, the bot agrees and hosts the
  next one.
- In the bot's browser only, `HouseBotSocial`
  (`src/ui/components/social/HouseBotSocial.tsx`) accepts every incoming
  friend request and every match invite, as long as the bot has no guest
  waiting and is not playing. It then opens the invited lobby. The runner
  waits the same way as host or guest: it picks the team and presses Ready!,
  and as host it presses Start Match once the guest is ready.

## Running it

It runs on old-mac as the LaunchAgent `cc.jialab.bb-house-bot`, from a
worktree of `main` at `~/house-bot`. Each run moves that worktree to the
latest `main`, hosts one match and exits, and launchd starts the next.
Install and run output goes to `~/Library/Logs/bb-house-bot.log`; the
bot's own log is still `~/.bb-house-bot/logs/bot.log`.

```sh
git worktree add --detach ~/house-bot origin/main   # once
cd ~/house-bot && CI=true pnpm install --ignore-scripts
cp ~/Projects/MyProjects/bloodbowl-phaser/.env .env
cp e2e/house-bot/cc.jialab.bb-house-bot.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/cc.jialab.bb-house-bot.plist
```

Stop it with `launchctl bootout gui/$(id -u)/cc.jialab.bb-house-bot`.

The agent installs with `CI=true`. Without a terminal, pnpm refuses to
rebuild `node_modules` when its settings change, and with `--silent` the
run just exits 1 and launchd retries every 30 seconds.

To run it by hand instead, stop the agent first and use a checkout of
`main` that matches the deployed site: the online protocol refuses a coach
on a different version.

```sh
pnpm house-bot   # hosts games until stopped
```

- `HOUSE_BOT_HEADED=1` shows the bot's browser.
- `HOUSE_BOT_MATCHES=1` stops after one match.
- `HOUSE_BOT_PORT` changes the Vite port from 5299.
- `HOUSE_BOT_OUT` changes where `bot.log` and screenshots go, from
  `~/.bb-house-bot/logs`.
