# Documentation

Start with [how to play](PLAYING.md) or [run the game locally](DEVELOPMENT.md).
The [project README](../README.md) shows the game and its main features.

## Players

| Guide                       | What it covers                                         |
| --------------------------- | ------------------------------------------------------ |
| [Playing](PLAYING.md)       | Teams, local matches, controls and online entry points |
| [Project status](STATUS.md) | Known gaps and the checks behind feature claims        |

## Contributors

| Guide                                                      | What it covers                                           |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| [Development](DEVELOPMENT.md)                              | Installation, builds, Firebase and private references    |
| [Architecture](technical/architecture.md)                  | React, Phaser, the headless engine, saves and networking |
| [Testing](technical/testing-guide.md)                      | Choosing and running the appropriate checks              |
| [E2E scenarios](E2E_TESTING.md)                            | Shared cases, browser tests, baselines and diagnostics   |
| [Simulations](SIMULATION.md)                               | Automated matches, findings and deterministic replay     |
| [Development fixtures](technical/development-seed-data.md) | Seed ownership, validation and cleanup                   |
| [Visual design](design/visual-design.md)                   | HUD components, sprites, stadiums and camera behaviour   |
| [Art pipeline](../scripts/sprites/README.md)               | Building and rendering the game art                      |
| [Utility scripts](../scripts/README.md)                    | Capture, performance and test tooling                    |

## Rules implementation

These are project implementation notes and audits, not copies of the official books.

- [Sevens implementation checklist](SEVENS_RULES.md)
- [Rules review from October 2026](RULES_REVIEW.md)
- [2026 roster updates and sources](ROSTER_UPDATES_2026.md)
- [Current specifications](../openspec/specs/)
- [Unfinished online lockstep work](../openspec/changes/online-lockstep-play/tasks.md)

Archived change proposals and the obsolete task backlog are available in Git
history. Keep current guides here and implementation requirements in OpenSpec;
avoid maintaining a second copy of source types or an old task list as a manual.
