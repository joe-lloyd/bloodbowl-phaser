## Context

Several skills replace the Block portion of an activation with a special attack. Their
rule resolvers already exist or are independently testable, but declaration and browser
interaction are inconsistent: a standing adjacent player may receive a direct action
while a player who must move first cannot reliably declare the same replacement as part
of a Blitz. The declaration must survive input, movement, online synchronization, and
headless execution.

## Goals / Non-Goals

**Goals:**

- Give Stab, Chainsaw, Breathe Fire, Monstrous Mouth, and Projectile Vomit a shared
  direct-action and Blitz-replacement declaration contract.
- Preserve each skill's existing target eligibility and resolution rules.
- Spend the correct team action and player activation exactly once.
- Keep legal-action discovery and command execution identical across graphical,
  headless, and online clients.
- Cover each action with roster-authentic or rules-plausible seeded players.

**Non-Goals:**

- Rewrite the individual attack resolution tables.
- Grant skills to implausible players solely to make a test convenient.
- Permit more than one Block-replacing attack in a single activation.

## Decisions

### Represent the replacement in the activation declaration

A Blitz command will carry an optional `blockReplacement` identifier. It is validated
when declared, retained while the player moves, and consumed when the player attacks.
Direct use is represented by the same replacement identifier without a Blitz movement
phase.

This avoids inferring the chosen attack from mutable menus or the player's complete
skill list after movement.

### Separate action availability from skill resolution

One shared availability service determines whether a direct or Blitz variant may be
offered. Once a legal target is selected, the existing skill-specific resolver handles
dice and effects. This keeps common action-economy rules out of every skill operation.

### Reserve the team Blitz on declaration

Declaring `Blitz (with <attack>)` reserves the team's Blitz action immediately. Cancelling
before any movement or roll follows the existing cancellation policy; after commitment,
the action remains spent. A resolved replacement completes the attack portion and cannot
be followed by a normal Block.

### Use skill-provenance-aware scenario fixtures

Scenario metadata will name why a player has the skill: roster default, roster-supported
position, or legal advancement access. Default holders are preferred, such as a Dark Elf
Assassin for Stab and a rostered Chainsaw player for Chainsaw. Generic Human players will
not be mutated into unrelated skill holders.

## Risks / Trade-offs

- **A skill may have additional once-per-drive or positional restrictions** → The common
  service delegates skill-specific eligibility to the skill rule before offering it.
- **Online clients could disagree about an available replacement** → The authoritative
  side validates the serialized declaration and broadcasts the accepted action.
- **Cancelling after movement could refund the Blitz incorrectly** → Reuse the existing
  activation commitment boundary and add cancellation scenarios before and after it.
