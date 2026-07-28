## Context

Brawler's Both Down re-roll previously lived in `BrawlerRule.onBlockDiceRolled`,
folded automatically by `BlockManager.rollBlockDice` right after the dice are
rolled and *before* `BlockDiceRolled` is emitted to the popup. It called
`ctx.decisions.request({ type: "reaction", ... })`, which the browser answers
with `ReactionDialog` — a separate yes/no popup — and the headless protocol
answers with a `reaction` pending decision (`use-reaction`). The coach was
asked to commit before ever seeing the roll.

`BlockManager` already has an established, different pattern for two other
block-dice re-rolls: Team Re-roll (`teamRerollBlock`) and Pro
(`proRerollBlockDie`). Both work by attaching availability flags
(`teamRerollAvailable`, `proAvailable`) onto `BlockRollData`/the `block-dice`
pending decision; the browser popup (`BlockDiceDialog`) renders a button per
available flag; clicking it calls back into `BlockManager`, which mutates the
pending roll in place and re-emits `BlockDiceRolled`. No second decision
channel, no popup-blocks-popup.

## Goals / Non-Goals

**Goals:**
- Move Brawler onto the exact same mechanism as Team Re-roll/Pro so the block
  popup is the only thing the coach ever sees mid-block.
- Preserve the rule itself exactly: Brawler may re-roll exactly one Both Down
  die, only when the attacker holds the skill, only once per block.
- Keep parity across every surface that already re-implements Team
  Re-roll/Pro: headless protocol, `IGameService`, `NetworkedGameService`
  (online), `PlayPhaseHandler`.
- Keep the existing seeded rule-catalog test (`brawler-rerolls-both-down`,
  committed seed 9) passing without hunting a new seed, if at all possible —
  the RNG draw order must not shift.

**Non-Goals:**
- Changing Hatred, which still uses the reacting-team `reaction` popup for its
  own (Player Down) re-roll. The two skills now diverge in mechanism; Hatred
  is out of scope here (a separate note/PR if it should move too).
- Changing the actual Brawler *rule* (which die, how many times, who may use
  it) — only which decision channel offers it.
- Introducing per-die reroll exclusivity finer than the existing block-wide
  mutual exclusion Team Re-roll/Pro already enforce.

## Decisions

**Mirror Pro exactly, including mutual exclusion, rather than inventing a
third pattern.** Team Re-roll rerolls all dice; Pro rerolls one die after a
3+ check; Brawler rerolls one specific die (whichever currently reads Both
Down) with no check. All three now sit behind availability flags on the same
`BlockRollData`/`block-dice` decision and lock each other out once any one is
spent — matching the existing comment in `BlockManager.proRerollBlockDie`
("Once attempted, no other re-roll source may be used on this block").
Brawler joining that lockout is a deliberate simplification: the rulebook's
"no double-reroll of a die" principle already makes Team Re-roll (rerolls
*all* dice) incompatible with a die Brawler already touched, and modeling
anything finer-grained (e.g. "Team Re-roll excludes just the Brawler-touched
die") would add real complexity for a corner case with no rules payoff.

**`BrawlerRule` becomes an inert marker (`{}`), like `ProRule`.** Pro's real
behavior does not live in a `SkillRule` hook either — it lives directly in
`BlockManager`, gated by `hasSkill`/`RerollArbiter` checks, with the
registration existing only so `SkillRegistry.has(BRAWLER)` still reports the
skill implemented for the coverage gate (`gate.test.ts`'s "exactly the
implemented set is registered" check). Brawler now follows the identical
shape rather than inventing a fourth way to mark a skill implemented.

**No skill-check roll for Brawler**, unlike Pro's 3+ gate. The 2025 rulebook
text for Brawler ("may re-roll a single Both Down result") has no roll-to-use
step, unlike Pro's explicit "must roll a D6: on a 3+". `brawlerRerollBlockDie`
therefore just performs the re-roll once eligibility is confirmed
(`hasSkill` + a die currently reading Both Down + not already spent this
block) — no `DiceController.rollSkillCheck` call.

**Availability is derived from live results, not cached at declare-time.**
`blockRerollAvailability(attacker, results)` now takes the current dice so
`brawlerAvailable` reflects whether a Both Down is *currently* showing —
correctly turning the button off after Team Re-roll/Pro/Brawler itself
changes the dice, and (in principle) on again if some future rule re-adds a
Both Down face, without any separate bookkeeping.

**Rule-catalog scenario drives the new command via `decisionPolicy.custom`,
not a hand-written script step.** The runner's decision loop
(`answerDecision`) answers whatever `pendingDecision` a step raises before
advancing to the next scripted command, so a fixed extra script entry cannot
be inserted "between" the roll and the result choice. `custom` intercepts the
`block-dice` decision, and when `brawlerAvailable` is true replies with
`brawler-reroll-block` instead of falling through to the default
`preferBlockResult` handling; once spent, `custom` returns `undefined` and the
default handling (pick the Both Down / whatever `preferBlockResult` names)
takes over as before.

**RNG order is preserved, so the committed seed survives unchanged.** The old
flow drew: block die → (reaction accept, no draw) → reroll die, all inside one
`block` command execution paused on decisions. The new flow draws: block die
(within `block`) → reroll die (within the separate `brawler-reroll-block`
command, issued as the very first decision reply). Because the reaction
question consumed no RNG in either version, the sequence and count of RNG
draws for a given seed is identical — only the command/decision-type boundary
around them moved. Confirmed by running `gate.test.ts` unchanged: committed
seed 9 still finds the `both-down-rerolled` outcome.

## Risks / Trade-offs

- [Risk] Extending the Team Re-roll/Pro mutual-exclusion group to include
  Brawler is a behavior choice, not something the rulebook states in those
  exact terms → Mitigation: it follows directly from "a reroll may not be
  rerolled" (reroll-decisions capability) applied block-wide, matches how this
  codebase already treats Team Re-roll vs. Pro, and a coach who wants Brawler
  specifically simply clicks it first (no functionality is lost — the coach
  still gets to use Brawler, Pro, or Team Re-roll on every block that offers
  more than one, just not two of them stacked).
- [Risk] `UI_TeamRerollBlock`/`UI_ProRerollBlockDie` are (pre-existing, out of
  scope here) not in `OnlineMatch`'s `UI_INTENT_EVENTS` exclusion set, so on
  the host they are both handled locally *and* broadcast raw to the guest →
  Mitigation: `UI_BrawlerRerollBlockDie` is added to the same un-excluded
  bucket for consistency with its siblings rather than silently diverging;
  fixing the underlying broadcast question (if it is even a real bug) is
  tracked separately, not bundled into this change.
- [Risk] The seeded scenario's RNG-order assumption could be wrong for other
  seeds/configs even though it held for the committed one → Mitigation:
  `gate.test.ts` (which searches a 200-seed window per outcome) and the full
  headless/coverage suite were run and pass; any future seed drift is caught
  the same way any other stale seed is — the outcome's `verify` assertion
  fails loudly rather than silently.

## Migration Plan

Pure code change, no data migration. Deploy as a normal PR; no feature flag —
the popup-vs-popup behavior was clearly a UX defect, not a variant to phase
in. Rollback is a plain revert if needed.

## Open Questions

- Should Hatred's Player Down re-roll move onto the same button pattern for
  consistency? Left out of scope per the user's request, which named Brawler
  specifically; worth a follow-up note if the same complaint comes in for
  Hatred.
