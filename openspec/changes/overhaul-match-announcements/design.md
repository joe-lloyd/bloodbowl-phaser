## Context

Today there is one channel for everything: `GameEventNames.UI_Notification` carries a bare string, `NotificationFeed` renders it as a small stacked toast, and it disappears. `DiceLog` listens to a different event (`DiceRoll`) plus `SkillTriggered` and `RerollUsed`, so a roll appears in the log but its *consequence* only ever appeared in a toast that has since vanished. The weather roll and the kickoff table are the clearest cases: the log shows "2D6: 8" and the toast that said what an 8 means is gone.

`BoardLabelOverlay` maps design-space label positions onto the live canvas rect. That mapping is correct for a static camera and wrong for a moving one: it knows the canvas box but nothing about camera zoom or scroll, so during the kickoff action-cam zoom the labels stay exactly where they were. The `add-action-camera-options` change will add more camera moves, so a per-move fix would need redoing each time.

Setup drag runs through `PlayerPlacementController`, which emits `PlayerSelected` with a player id rather than `UI_ShowPlayerInfo` with a player, so `PlayerInfoPanel` never receives anything during setup.

## Goals / Non-Goals

**Goals:**
- One durable record of what happened (the log) and one loud channel for structural transitions (the announcer).
- A coach placing players can see who they are placing.
- Overlay labels behave correctly under any camera move, present or future, without per-move code.

**Non-Goals:**
- Redesigning the Dice Log's visual language beyond what carrying outcomes requires.
- Building the action camera itself — that is `add-action-camera-options`. This change only defines how the overlay reacts to camera state.
- Localisation of announcement text.

## Decisions

**1. Split `UI_Notification` into two typed events rather than tagging one event.**
`UI_LogEntry` carries a structured outcome (category, headline, detail, optional roll and team) and lands in the Dice Log. `UI_Announce` carries a structural transition (kind, headline, optional subtitle) and drives the centred announcer. Alternative considered: keeping one event with a `severity`/`placement` field and routing on it. Rejected — the two have genuinely different shapes and lifetimes (one is a permanent record, one is a timed takeover), and a single event means every emitter has to remember to set the flag correctly, which is exactly the mistake the current code makes.

**2. Outcome text is produced where the rule is resolved, not in the HUD.**
The weather table, the kickoff table, and skill rules each own the sentence describing their result, and emit it as the `detail` of a log entry alongside the roll. Alternative considered: a HUD-side lookup table mapping roll → text. Rejected — it duplicates the rulebook in a second place and drifts; the resolver already knows which entry it applied.

**3. The announcer is a takeover element, not a stacked feed.**
One announcement at a time, centred, large, with an enter/hold/exit beat. A new announcement replaces the current one. Kinds are exactly: turn started, round passed to the other coach, halftime, full time. Anything else is a log entry. Constraining the kind list is what keeps the announcer meaningful — if any code can announce anything, it degrades back into a toast feed.

**4. The overlay subscribes to camera state, and its default is "hidden while the camera is not neutral".**
`CameraController` SHALL emit a camera-state event (neutral / active, with a duration) that the overlay consumes: on leaving neutral it scales up slightly and fades out over the move duration; on returning it scales back and fades in. Alternative considered: projecting each label through the camera transform every frame so labels track the zoom. Rejected for now — it is more code, it fights the DOM-text crispness that motivated the overlay, and end-zone team names zoomed to fill the screen are not what the coach wants to look at during a kickoff. Fading is both simpler and better-looking, and one subscription covers every future camera move.

**5. Setup emits the same player-info event as play.**
`PlayerPlacementController` and the dugout emit `UI_ShowPlayerInfo` with the full player on selection, drag start, and hover, so the existing panel works unchanged. No new panel, no setup-specific variant.

## Risks / Trade-offs

- **[Splitting the event touches every emitter]** → `UI_Notification` is kept as a deprecated alias that routes to a log entry, so nothing goes silent mid-migration; emitters are converted in one pass and the alias is removed at the end.
- **[The announcer's takeover could obscure the pitch at a bad moment]** → It occupies the top band only, is click-through, and auto-dismisses; the hold duration is short and it never waits for input.
- **[Losing the toast channel removes a debugging affordance]** → The log gains a low-priority category for informational messages, so developer-facing text has somewhere to go that is still visible.
- **[Overlay fade during long camera sequences hides useful labels]** → Labels return automatically on camera reset; if a future action-camera mode is long-lived, it can opt into a reduced-opacity persistent state rather than a full fade.
- **[Online divergence]** → Both new events must be classified in the `UI_INTENT_EVENTS` filter so a guest's log and announcer match the host's; covered explicitly in tasks.

## Migration Plan

1. Add `UI_LogEntry` and `UI_Announce`; make `UI_Notification` an alias that emits a low-priority log entry.
2. Convert emitters table by table (weather, kickoff, turn flow, skills), each with its outcome sentence.
3. Replace `NotificationFeed` with the announcer component; wire the four announcement kinds.
4. Remove the `UI_Notification` alias and its remaining call sites.

No persisted data changes. The online envelope gains two event names in its filter list.

## Open Questions

- Should the log distinguish the two coaches by colour for every entry, or only for entries attributable to a team? Leaning "only when attributable", since neutral events (weather, kickoff table) belong to neither coach.
