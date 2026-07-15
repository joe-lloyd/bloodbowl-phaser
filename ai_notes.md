
- [x] DONE (2026-07-15): can we make a scenario test for this with a seed that works — [blocked ball carrier dropping the ball is not a turnover for the blocking team]
      — New sandbox scenario "Block the Carrier → No Turnover (Seeded)" (seed 2, Human teams): team 2 blocks team 1's carrier, the single block die is a POW, carrier goes down, ball bounces loose, and team 2 keeps their turn. The CLI "turnover ownership" test now drives this exact scenario deterministically (no more seed sweeping).

I NOTICED A SIDE BUIG FROM TEH ONE ABOVE, the follow up lands the player onm the ball but theres no pickup roll made, if a player enders a square with the ball then the  need to roll to pick up 