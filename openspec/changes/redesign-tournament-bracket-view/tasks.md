## 1. Layout helper

- [ ] 1.1 Add a pure `layoutBracket(fixtures, entrants)` returning per-fixture round column, side of draw, normalized vertical position, and connector segments
- [ ] 1.2 Position first-round fixtures evenly and centre each later fixture on the midpoint of the fixtures feeding it
- [ ] 1.3 Split rounds into the two halves of the draw with the final at the centre
- [ ] 1.4 Handle byes as automatic advances and undetermined slots for incomplete rounds
- [ ] 1.5 Fall back to pairing by round and order when next-fixture linkage is missing
- [ ] 1.6 Unit-test the helper across draws of 3, 4, 5, 8, 11, and 16 entrants

## 2. Bracket rendering

- [ ] 2.1 Build the bracket container rendering fixture cards at the helper's positions
- [ ] 2.2 Draw connectors as an SVG layer over the same coordinate space with orthogonal elbows
- [ ] 2.3 Render the trophy and the champion at the centre when the tournament completes
- [ ] 2.4 Mark eliminated entrants and carry winners into their next tie, deriving both from results
- [ ] 2.5 Show each fixture's score inline and emphasise the advancing team

## 3. Integration with the competition view

- [ ] 3.1 Use the bracket for `format === "single-elimination"` only; leave league and round-robin views untouched
- [ ] 3.2 Keep launch-local, launch-hosted, and report-score available on ready fixtures within the bracket
- [ ] 3.3 Hide action controls on fixtures that are not ready
- [ ] 3.4 Degrade to direct fixture display for draws below four entrants

## 4. Responsive behavior

- [ ] 4.1 Put the bracket in a horizontally scrolling container so the page body never scrolls horizontally
- [ ] 4.2 Fall back to the round-by-round list below the bracket's minimum readable width
- [ ] 4.3 Verify a sixteen-team bracket on a narrow window

## 5. Data linkage

- [ ] 5.1 Verify `logic.ts` generates `sourceFixtureIds`, `nextFixtureId`, and `nextSlot` for every generated bracket
- [ ] 5.2 Add a one-time repair deriving the linkage from round and order for existing tournaments that lack it
- [ ] 5.3 Render entrant names from the cached display fields without fetching rosters

## 6. Verification

- [ ] 6.1 Run a tournament through to a champion and confirm the bracket tracks eliminations and advancement at each round
- [ ] 6.2 Confirm a bye-containing draw renders and advances correctly
- [ ] 6.3 Confirm launching and reporting still work from the bracket
- [ ] 6.4 Mark the item fixed in `ai_notes.md` with a dated note
