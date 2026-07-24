## ADDED Requirements

### Requirement: Throw Team-mate family traits are implemented, not inert

The Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, and Strong Arm traits SHALL be registered as implemented rules and SHALL each ship at least one seeded catalog configuration, so the coverage gate counts them as implemented rather than inert. The gate's implemented-set snapshot SHALL be updated to include these six traits.

#### Scenario: Throw Team-mate family counts as implemented
- **WHEN** the coverage gate enumerates registered rules
- **THEN** Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, and Strong Arm each have a catalog configuration and appear in the implemented set

#### Scenario: No inert configuration is left dangling
- **WHEN** the coverage gate checks for catalog entries against unregistered rules
- **THEN** none of the six Throw Team-mate family traits are flagged as inert-with-configs
