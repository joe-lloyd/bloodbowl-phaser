# The house bot

A scripted coach that joins online games on the production backend, so
you can play an online match without a second person. It runs on old-mac
and plays with the same AI as the computer opponent.

The bot is a friend you invite. Add it on the Friends page with its friend
code, and it accepts the request by itself. Then host a game, invite House
Bot from the lobby, and it joins, picks a random computer team and readies
up. You host, so the game type, team value range, turn timer,
timeout bank and the rest of the settings are yours. Start the match when you are ready.
If the bot is already in a match, it joins as soon as that match ends,
while the invite is still fresh.

## How it works

- The bot is an ordinary coach account with an email and password, not a
  Google account. On its first run the runner makes up a password and
  keeps it in `~/.bb-house-bot/credentials.json`, readable only by your
  user. It hands the login to the bot's page in memory, and the app signs
  in, creating the account (coach name House Bot) the first time. The
  address is `lead.mushroom+housebot@gmail.com`, which reaches Joe's inbox.
- The runner sets the `bb-house-bot` flag in that browser.
- The bot's browser flag enables the same planner and paced command loop
  as the local Standard computer opponent. Its choices go through the
  online session, including block dice, pushes, follow-ups and re-rolls.
  Both peers execute the same commands and check their resulting states.
- The runner handles sign-in, waiting on the main menu, the opening toss
  and leaving full time. On start it goes back to any match or lobby the
  bot was already in. It does not choose moves or translate them into board clicks.
  It never buys inducements either: the computer coach in the page owns
  that step and confirms them itself. A runner click that races the coach
  finds the button gone, so a runner click gives up after a second and
  tries again on the next pass. Sixty misses in a row end the run, and
  launchd starts a fresh one.
  The page loads a Vite dev server on old-mac with the production Firebase
  config from `.env`.
- The bot keeps no team library. In any lobby, its browser
  (`useHouseBotTeam`) builds a random computer team from every template
  that plays the lobby's game type inside its team value range
  (`src/social/houseBotTeam.ts`), in Matched Play so it owes no skill pick,
  and picks again when the host changes either setting. If no template
  fits, it says so in `bot.log` and cannot ready up.
- The bot used to host its own lobbies. On start, its browser closes any
  lobby it still hosts, so a coach left seated there cannot block its
  invites. `firestore.rules` keeps the old `houseBots` rule until no
  deployed client reads it.
- If the other coach ends the match early, the bot agrees and waits for
  the next invite.
- In the bot's browser only, `HouseBotSocial`
  (`src/ui/components/social/HouseBotSocial.tsx`) accepts every incoming
  friend request and every match invite, as long as the bot is not already
  seated in a lobby or playing. It then opens the invited lobby. The runner
  presses Ready!, which stays disabled until the bot's browser has picked a
  team that fits. If the host has not started after twenty minutes, the bot
  leaves the seat. If a lobby it opens never loads, it goes back to the menu
  after thirty seconds.

## Running it

It runs on old-mac as the LaunchAgent `cc.jialab.bb-house-bot`, from a
worktree of `main` at `~/house-bot`. Each run moves that worktree to the
latest `main`, plays one match and exits, and launchd starts the next.
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
pnpm house-bot   # joins games until stopped
```

- `HOUSE_BOT_HEADED=1` shows the bot's browser.
- `HOUSE_BOT_MATCHES=1` stops after one match.
- `HOUSE_BOT_PORT` changes the Vite port from 5299.
- `HOUSE_BOT_OUT` changes where `bot.log` and screenshots go, from
  `~/.bb-house-bot/logs`.
