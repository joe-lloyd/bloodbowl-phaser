# Playing Blood Bowl Sevens

Two coaches field up to seven players each. Carry the ball into the opposing
end zone to score. Each half gives each coach six turns.

## Start a local match

1. Open **Build Team** from the main menu.
2. Create a team, choose its roster and advancement mode, then hire a legal squad.
   The builder shows budget and roster restrictions.
3. Save the team and create a second team for the other coach.
4. Return to the menu and choose **Play Local**.
5. Select a different team in each column, choose a stadium style and start.
6. Follow the coin-toss and setup prompts. The setup checklist shows what
   each coach must fix before confirming their formation.

Both coaches use the same screen. You can build teams and play locally without
signing in. Saved teams and a local match are stored in that browser, so clearing
site data removes those local saves. Use **Resume Match** when it appears on the menu.

## During the match

Select one of the active coach's players and choose an action from the HUD.
Click a highlighted target or destination, then follow the prompts for dice,
re-rolls, pushes and follow-ups. The HUD shows the selected player's abilities,
movement and available actions. End their activation when finished, or end
the team turn with **End Turn**.

Many failed actions cause a turnover. The other coach then takes their turn.
The game handles drive resets, half-time and match results.

To inspect the board:

- Scroll the mouse wheel to zoom around the pointer.
- Drag with the right or middle mouse button to pan.
- Press `0` or `1` to return to the overview.

Reduced-motion preferences disable camera glides. Landscape gives the pitch
and action panels more room.

## Develop a team

Team pages show player statistics, treasury, injuries and development choices.
The team's advancement mode determines how it gains skills. Leagues and
tournaments have their own pages in the main menu. Teams must satisfy the
competition's eligibility checks before entering.

## Play online

On a deployment with Firebase configured, sign in with Google and use
**Host Game** or **Join Game**. The host shares the game code with the other
coach. Each coach supplies a team and uses their own browser.

Online play is still in development. Use it with people you trust and read the
[known limits](STATUS.md#online-play) before relying on a long-running match.
If Host and Join are disabled with “Needs Firebase config”, use local play or
follow the [Firebase setup guide](DEVELOPMENT.md#online-play-with-firebase).
