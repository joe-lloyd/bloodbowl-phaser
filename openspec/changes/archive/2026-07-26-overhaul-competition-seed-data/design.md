## Context

Development seeding currently builds teams directly with fixed values rather than
through the rules used by the team builder. This produces invalid positional mixes and
treasuries, while competition UI lacks realistic draft, active, completed, and
progressed data. Seed data is test infrastructure and must be deterministic, legal, easy
to replace, and isolated from coach-owned records.

## Goals / Non-Goals

**Goals:**

- Generate every team through shared roster legality, pricing, and advancement services.
- Provide stable examples from rookie through capped development.
- Seed new, active, and completed leagues and tournaments with coherent histories.
- Ensure a team appears in at most one active competition.
- Make seeded records versioned, idempotent, and safely removable.

**Non-Goals:**

- Randomly fuzz all legal roster combinations.
- Modify or clean up coach-created data.
- Make production startup depend on development seeds.

## Decisions

### Describe seed fixtures declaratively and validate them

Versioned fixture definitions name roster intent, advancement state, competition
lifecycle, and stable ids. Builders call the same purchase, legality, progression, and
competition services as user flows. A post-build invariant validator fails loudly if any
fixture is illegal.

### Derive money rather than assign it

Each draft begins with its profile budget. Player, re-roll, staff, and fan purchases are
debited by the normal pricing functions; treasury is the remainder. Team value and
advancement value are then calculated from the resulting record.

### Give active competition membership one owner

A seed membership index assigns each team to zero or one active league/tournament.
Completed memberships remain in historical records and may overlap because they do not
represent current participation.

### Keep seed ownership explicit

Every generated entity includes seed namespace, version, and fixture key. Re-running a
version upserts those ids. Removing or upgrading seeds only targets records carrying
that exact seed ownership metadata.

### Use stable histories and random seeds

Match results, SPP, advancements, injuries, standings, brackets, and winners use named
fixtures and fixed RNG seeds. This keeps screenshots and end-to-end assertions stable.

## Risks / Trade-offs

- **Shared validators may reveal previously tolerated invalid data** → Fail the seed
  command with entity-specific reasons and fix the fixture, not the validator.
- **Schema changes can stale existing seeds** → Increment the seed version and migrate
  by ownership metadata.
- **Rich histories are costly to maintain** → Compose them from reusable legal team,
  match, and competition fixture primitives.

## Migration Plan

Introduce namespaced seed metadata and a new seed version. On explicit development seed
refresh, remove only the prior recognized seed version and rebuild. Existing
coach-created teams and competitions are never selected by cleanup.
