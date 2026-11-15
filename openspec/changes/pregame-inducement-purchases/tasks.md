# Tasks

## 1. Authoritative pregame state

- [x] 1.1 Persist readiness and purchases, enforce purchase/start ordering and commit inventory once; verify headless pregame and serialization regression tests.
- [x] 1.2 Add readiness command, owner gating and accepted purchase state to online/computer proxies; verify ownership and two-peer synchronization tests.

## 2. Pregame screens

- [x] 2.1 Connect shared ready and purchase controls before local and online coin tosses, with budget/error/draft feedback; verify component tests for ordering and confirmations.
- [x] 2.2 Ready and purchase for the computer coach without blocking player decisions; verify computer match regression tests.
- [x] 2.3 Document the ready → purchases → choices → coin toss sequence and compatibility behavior in the rules guide; verify docs check.

## 3. Integration

- [x] 3.1 Run focused tests, TypeScript/build, lint and OpenSpec validation; fix relevant failures.

## Workflow follow-up

- Open a ready PR, handle CodeRabbit findings and green CI, and merge under the repository policy.
