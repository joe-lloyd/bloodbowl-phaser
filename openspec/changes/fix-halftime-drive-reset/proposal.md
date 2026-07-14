# Proposal: fix-halftime-drive-reset

## Why

The game breaks at halftime: the engine now swaps the kicking team and resets turn counts, but players are never sent back to their dugouts, KO recovery is never rolled (`recoverKO()` only flips sub-phases), and `SetupManager`'s placement bookkeeping persists from the previous drive — so the second-half setup starts from a corrupted board instead of a clean dugout state. The same incomplete sequence runs after every touchdown, so all drive transitions are affected, not just halftime.

## What Changes

- Implement the full **end-of-drive sequence** (per the Blood Bowl 2025 rulebook, `docs/pdfs/`), running after a touchdown and at halftime:
  1. Clear the pitch: every player returns to the dugout (Reserves), clearing `gridPosition` and resetting `SetupManager` placement state; stunned players recover to Reserves like the rest.
  2. Roll **KO recovery** for each knocked-out player (D6, success returns them to Reserves; failure keeps them in the KO box) with results emitted as events.
  3. Injured/dead players stay out for the match.
  4. Ball is removed from the pitch until the next kickoff.
- Run **setup without a coin flip** for every drive after the first: after a touchdown the scoring team kicks; at halftime the team that kicked the first half receives (kicking team swaps, like association football). Coin flip happens exactly once, before the first drive.
- Both browser UI and headless protocol drive the same sequence: the UI returns sprites to dugouts and shows KO recovery results; headless surfaces the same via events and continues to accept setup commands.
- **BREAKING** (internal): `GameService.recoverKO()`/`startEndDriveSequence()` become a real operation chain instead of no-op sub-phase flips.

## Capabilities

### New Capabilities

- `drive-reset`: The end-of-drive sequence — pitch clearing, KO recovery rolls, dugout state, kicking-team determination per drive (scorer kicks; halves swap), and re-entry into setup/kickoff without a coin flip.

### Modified Capabilities

<!-- none in openspec/specs yet; add-headless-engine is still unarchived. Its headless-engine spec's "Full game playable headless" requirement is exercised harder by this change but its text does not change. -->

## Impact

- **Modified code**: `GameService` (end-drive sequence), `TurnManager` (halftime hand-off), `SetupManager` (placement state reset, dugout return), `BallManager` (ball cleared between drives); possibly a new `EndDriveOperation` in `src/game/operations/`.
- **UI**: dugout refresh + KO recovery display on the existing event flow; `SetupPhaseHandler` must not re-run the coin flip on later drives.
- **Headless**: full-match bot in `__tests__/headless/fullGame.test.ts` gets stricter assertions (players actually re-placed from dugouts each drive).
- **Tests**: new drive-reset suite; existing 325 tests must stay green.
