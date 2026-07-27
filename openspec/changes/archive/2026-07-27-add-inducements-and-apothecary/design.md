## Context

Inducements are currently represented primarily as names, and an Apothecary can be owned
without a complete pre-match purchase or in-match decision flow. Sevens modifies several
catalog rules and injury outcomes. These decisions must be serialized because they can
pause match setup or injury resolution and may cross save/resume or online ownership
boundaries.

## Goals / Non-Goals

**Goals:**

- Add a deterministic, validated pre-match inducement selection phase.
- Enforce the Sevens Extra Team Training, Star Player, and Prayers to Nuffle rules.
- Implement the once-per-match Sevens Apothecary decision for eligible KO and casualty
  results.
- Persist pending decisions, inventory, usage, and random outcomes.
- Expose equivalent browser, online, and headless commands.

**Non-Goals:**

- Implement every inducement from every rules expansion in this change.
- Change the underlying casualty table.
- Allow clients to choose or fund inducements outside the authoritative rules.

## Decisions

### Build offers from a competition rule profile

The pre-match service receives team values, available treasury/petty cash, format, and
advancement mode, and returns a priced catalog plus budget. Purchases are validated again
when confirmed. Sevens-specific rules are data in the profile rather than UI branches.

### Persist a match-scoped inducement inventory

Confirmed purchases and granted inducements are copied into match state with quantities,
remaining uses, owner, and provenance. Treasury changes and temporary match inventory
are separate, preventing inducements from leaking into the long-lived roster.

### Pause injury resolution for an owned Apothecary

After an eligible result but before final dugout placement, the rules engine creates an
owner-only decision. Declining or resolving it consumes no other gameplay input. The
Apothecary is consumed only when the coach chooses to use it.

### Record random outcomes before applying them

Prayers rerolls and casualty patch-up rolls use the match RNG and are recorded in the
operation log. A restored pending decision does not roll again.

## Risks / Trade-offs

- **Petty-cash policy can differ by competition** → Keep budget calculation in the rule
  profile and serialize its resolved amount into setup state.
- **An injury animation could finish before the decision** → Treat presentation as a
  view of the paused operation and finalize player placement only after the decision.
- **Reconnect could duplicate an inducement use** → Give decisions stable ids and make
  resolution idempotent on the authoritative match.

## Migration Plan

Old saves without inducement state load with an empty match inventory and no pending
inducement decision. Team Apothecary ownership remains the source used to seed the
match-scoped available use.
