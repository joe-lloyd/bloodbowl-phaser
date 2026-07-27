# e2e-scenario-testing

## ADDED Requirements

### Requirement: Scenario cases are organized per gameplay section
Scenario-case data SHALL be organized into modules named after the gameplay section they cover, mirroring the existing `__tests__/headless/*.test.ts` section naming, rather than filed into a single generic, non-section-aligned registry. New coverage for a section SHALL be added to that section's existing case module (creating one named after the section if none exists yet) so it is discoverable by anyone already working in that section's test file.

#### Scenario: New coverage lands in its section's module
- **WHEN** a contributor adds a new scenario case for an existing gameplay section (e.g. push-chain)
- **THEN** the case is added to that section's case module rather than a generic catch-all file

#### Scenario: Existing per-section tests are not displaced
- **WHEN** the scenario-case registry is reorganized by section
- **THEN** every existing `__tests__/headless/*.test.ts` file continues to run unchanged, and no existing test is deleted as part of the reorganization
