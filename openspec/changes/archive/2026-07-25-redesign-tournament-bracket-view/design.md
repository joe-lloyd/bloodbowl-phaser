## Context

`CompetitionView` derives `rounds` as the distinct `fixture.round` values, then renders a `grid lg:grid-cols-2` with one block per round and a stack of fixture cards inside. Each card shows home/away entrant names, the score or a placeholder, and — when the fixture is ready — buttons to launch locally, launch hosted, or enter a score. Presentation is identical for a league and for a knockout tournament apart from a "Bracket" heading.

The data needed for a real bracket is already generated: `CompetitionFixture` has `round`, `order` within the round, `sourceFixtureIds` (which ties feed it), `nextFixtureId`, and `nextSlot` ("home" | "away"). `FixtureResult.bye` marks automatic advances. `TournamentDoc.championEntrantId` names the winner. Nothing needs to be invented — it needs to be laid out.

## Goals / Non-Goals

**Goals:**
- A coach can read the shape of the competition at a glance: who plays whom, who is out, how far each team is from the final.
- The layout is derived by a pure function that can be unit-tested against awkward draws.
- Existing fixture actions keep working in place.

**Non-Goals:**
- Double elimination, group-then-knockout, or Swiss formats. Single elimination only.
- Changing how brackets are generated or how results advance — `tournament-builder` owns that.
- Animating the bracket. Static and legible first.

## Decisions

**1. Geometry is computed by a pure `layoutBracket(fixtures, entrants)` helper, not by the component.**
It returns, for each fixture, its column (round), its side of the draw (left/right/final), its vertical position in a normalized coordinate space, and the connector segments joining it to its `nextFixtureId`. The component renders that description. This is what makes byes, odd entrant counts, and deep brackets testable without a DOM — the layout bugs in bracket UIs are always geometry bugs, and geometry in JSX is untestable.

**2. Mirrored layout with the final at the centre.**
Rounds are split into two halves of the draw. The left half advances rightward, the right half advances leftward, and both meet at the central final with the trophy. Alternative considered: the conventional left-to-right ladder. Rejected — the report explicitly asks for teams converging on the centre and the cup, and for larger draws the mirrored form fits the screen far better than a ladder that grows only in one direction.

**3. Vertical positions come from the leaves, and parents centre on their children.**
First-round fixtures are evenly spaced; every later fixture sits at the midpoint of the fixtures feeding it, resolved from `sourceFixtureIds`. This produces correct spacing for any draw size, including uneven ones, without special-casing round counts.

**4. Byes are rendered as an advance, not an empty tie.**
A fixture with `result.bye` shows the advancing team and a "bye" marker, and its connector is drawn to the next tie. An empty slot in an incomplete bracket shows "TBD" as it does today.

**5. Connectors are SVG drawn over the same normalized coordinate space.**
One SVG layer sized to the bracket, with orthogonal elbow connectors. Alternative considered: CSS borders and pseudo-elements per card. Rejected — it cannot express the mirrored geometry cleanly and breaks at every draw size that is not a power of two.

**6. Elimination state is derived, not stored.**
An entrant is eliminated when a completed fixture they played in advanced the other team. Derived from results, so it cannot disagree with the standings.

**7. Wide brackets scroll inside their own container.**
The bracket lives in an `overflow-x: auto` container so the page body never scrolls horizontally. On narrow screens the bracket falls back to the existing round-by-round list rather than an unreadable squeeze.

## Risks / Trade-offs

- **[Mirrored layout is unfamiliar for small draws]** → For a four-team draw the mirrored form is two semi-finals and a final, which reads naturally. Below four entrants the bracket degrades to a single fixture card.
- **[Large draws become wide]** → Horizontal scroll inside the container, plus the narrow-screen fallback. Zooming or collapsing rounds is deliberately out of scope for the first version.
- **[The layout helper duplicates knowledge of how brackets advance]** → It reads `sourceFixtureIds` and `nextFixtureId` rather than recomputing advancement, so generation stays the single source of truth. If those links are missing for existing tournaments, the helper falls back to pairing by round and order and the gap is filled in `logic.ts`.
- **[Fixture cards carry a lot of controls for a dense layout]** → Cards show names and score always; actions appear on the focused or ready fixture, so the bracket stays readable.

## Migration Plan

No data changes. The bracket replaces the rounds grid for `format === "single-elimination"` only; round-robin and league views are untouched. If existing tournament documents lack `sourceFixtureIds`/`nextFixtureId` linkage, a one-time repair pass derives it from round and order.

## Open Questions

- Should third-place playoffs be supported? Not currently generated; if added later the layout reserves a slot beneath the final rather than inside the tree.
- Should the bracket show each fixture's score inline, or only the advancing team? Proposed: both — score inline, advancing team emphasised.
