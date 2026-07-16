
- [x] DONE (2026-07-15): can we make a scenario test for this with a seed that works — [blocked ball carrier dropping the ball is not a turnover for the blocking team]
      — New sandbox scenario "Block the Carrier → No Turnover (Seeded)" (seed 2, Human teams): team 2 blocks team 1's carrier, the single block die is a POW, carrier goes down, ball bounces loose, and team 2 keeps their turn. The CLI "turnover ownership" test now drives this exact scenario deterministically (no more seed sweeping).

- [x] DONE (2026-07-16): the follow up lands the player on the ball but there's no pickup roll made, if a player enters a square with the ball then they need to roll to pick up
      — `GameService.followUpPush` now attempts a pickup when following up onto a loose ball (failed pickup bounces + turnover, as usual). Locked by `__tests__/headless/followup-pickup.test.ts`.

Online 

- [x] DONE (2026-07-16): chat is not working unless it is highlighted in the tab lets add a notification system and have the chat receive messages anyway even when not highlighted
      — Messages were already received on any tab (the `match.onChatMessage` subscription runs regardless of the active tab); they just weren't surfaced from the dice tab. Incoming chat now pops a `UI_Notification` toast (💬 sender: text) as well as the unread badge when you're not viewing the Chat tab.

- [x] ANSWERED (2026-07-16): do we need to add the data for the app in plain json object, is it better to hash the game state instead?
      — Keep the plain-JSON `GameSnapshot` for state transfer: the guest needs the actual fields to render, so a hash can't replace it. A hash is only useful as a cheap *desync detector* — later we can add a `stateHash` to broadcasts and have the guest compare it against its applied snapshot, requesting a resync on mismatch (cheaper than diffing full state). Deferred; not needed while snapshots are authoritative and already reconciled every broadcast.
