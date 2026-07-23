# Design: add-spp-progression-stats

## Context

The engine uses a Phaser-free typed EventBus and already exposes interception attribution, movement, blocks, and most pass state. It lacks a scorer on `Touchdown`, a reliable successful-completion signal, Throw Team-mate SPP outcomes, and a casualty event. `Player` has unused `spp`/`level` fields but does not retain its Primary/Secondary categories or advancement history.

## Goals / Non-Goals

**Goals**

- Apply every standard 2025 SPP and advancement rule supplied with this change.
- Keep raw statistics engine-driven, deterministic, and available headlessly.
- Make all coach decisions explicit and only persist after confirmation.
- Safely load older teams with no progression metadata.

**Non-Goals**

- League scheduling, standings, winnings, fans, hiring, firing, or redrafting.
- Automatically choosing coach decisions.
- Implementing niche skill-specific SPP exceptions beyond events the engine already models; the event catalog remains extensible.

## Decisions

### 1. Progression is an explicit match rule

`progressionEnabled` travels with local route state and online lobby settings. A tracker may still collect flavour statistics, but finalisation returns no SPP and performs no writes when disabled. This directly represents a League Fixture versus a Friendly.

### 2. `MatchStats` observes typed outcome events

One engine-adjacent accumulator owns `Map<playerId, PlayerMatchStats>`. It subscribes to attributed events and is mounted by both `ServiceContainer` and `createHeadlessGame`.

- `PassCompleted` is emitted only for an Accurate Pass caught directly by a team-mate.
- `ThrowTeammateLanded` identifies thrower, thrown player, whether it was a Superb Throw, and safe landing; it awards the thrower and passenger independently.
- `PlayerCasualtyInflicted` identifies causer, victim, and cause. Only `cause === "block"` is standard SPP-eligible. Emission happens on the Injury casualty result, so recovery does not revoke it.
- `Touchdown` identifies the scorer for played touchdowns; awarded concession touchdowns are explicit post-match allocations.
- `PlayerParticipated` is recorded when a player is placed/activated, providing the MVP pool.

### 3. MVP and allocation are coach-controlled finalisation

The post-match controller requires up to six eligible participating players per team (exactly six when six are available), assigns slots 1-6, and rolls through the seeded RNG. It emits `MvpAwarded` only after a valid nomination. A normal fixture has one MVP per team. A conceding team loses its match SPP and MVP; its opponent gets a second MVP. Awarded touchdown SPP is assigned to chosen eligible roster players before confirmation.

Finalisation has a match id/guard and produces an immutable summary. Reopening the screen cannot duplicate SPP.

### 4. Progression is pure data + explicit rolls

`progression.ts` owns constants and pure transformations.

- SPP values: Completion 1; Superb Throw + safe landing to thrower 1; safe landing to thrown player 1; Interception 2; eligible Casualty 2; Touchdown 3; MVP 4.
- Advancement costs by advancement index:

| Advancement     | Random Primary | Choose Primary | Choose Secondary | Characteristic |
| --------------- | -------------: | -------------: | ---------------: | -------------: |
| 1 Experienced   |              3 |              6 |               10 |             14 |
| 2 Veteran       |              4 |              8 |               12 |             16 |
| 3 Emerging Star |              6 |             12 |               16 |             20 |
| 4 Star          |              8 |             16 |               20 |             24 |
| 5 Superstar     |             10 |             20 |               24 |             28 |
| 6 Legend        |             15 |             30 |               34 |             38 |

There is no random Secondary option in the 2025 table.

For a random Primary, the coach chooses an eligible Primary category. Each candidate rolls a first D6 (1-3 first half, 4-6 second half) and second D6 (row); two legal candidates are generated and the coach chooses one, except identical results are mandatory. Existing or incompatible skills reroll.

Characteristic improvement spends its full cost before a D8 roll. Legal choices are AV; AV/PA; AV/MA/PA; MA/PA; AG/MA; AG/ST; or any characteristic for results 1 through 8. The coach may instead choose a legal Primary or Secondary skill without a refund. A characteristic can be improved at most twice and not beyond MA 9, ST 8, AG 1+, PA 1+, AV 11+.

### 5. Player value stores advancement value separately

Every applied advancement appends a durable record and increases `teamValue` (the player's advancement value): Primary +20k, Secondary +40k, AV +10k, MA/PA +20k, AG +30k, ST +60k. Block, Dodge, Guard, and Mighty Blow are Elite and add another +10k. The hiring `cost` remains the base hiring fee; current player value is `cost + teamValue`.

### 6. Migration defaults are derived from the roster

New players copy Primary/Secondary categories from their template. On load, older players are hydrated by matching their roster position template. Missing SPP, level, history, category access, kind, and characteristic-increase counters receive safe defaults.

## Risks / Trade-offs

- Accurate completion currently spans Pass and Catch operations. The Catch operation receives pass metadata so it emits only after the direct catch succeeds.
- Some mutually exclusive skill rules are catalog-specific. Duplicate rejection is mandatory now; incompatibility is centralized in a table so more pairs can be added without changing the UI.
- Online finalisation must remain authoritative. The host owns the tally and seeded rolls; each client persists only the team it owns.
- Journeymen can earn SPP but only retain it if later hired. This change records/returns their earned total; the separate hiring step decides whether it persists.

## Migration Plan

Add event payloads and migration defaults, then mount the tracker, add the pure progression module/tests, and finally add the post-match UI and persistence. All new stored fields are optional on read.
