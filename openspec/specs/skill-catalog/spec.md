# skill-catalog

## Purpose

Defines the canonical catalog of Blood Bowl skills and traits: how catalog entries map to the 2025 rulebook, how parameterized skill families are represented, how legacy skill names migrate, and what public metadata and project-written hints each entry carries for display.

## Requirements

### Requirement: Catalog metadata covers the supported skill families

The public catalog SHALL contain one entry per supported skill and trait family,
with name, category, skill/trait kind, usage, compulsory flag and parameter form.
`SkillType` and the public catalog SHALL agree through compile-time checks. Tests
SHALL check the 108-family catalog, the 72-skill and 36-trait split, representative
metadata and registry coverage. Developers SHALL verify rules changes against
legally obtained reference material without committing the reference text.

#### Scenario: Missing catalog metadata is caught

- **WHEN** a supported skill family has no public catalog record
- **THEN** the TypeScript catalog completeness check fails

#### Scenario: Private books are absent

- **WHEN** a fresh checkout has no local book or extracted notes
- **THEN** the public catalog loads and its tests run without those files

### Requirement: Parameterized skills are one family with an instance parameter

Skill families the book parameterizes (Loner (X+), Mighty Blow (+X), Dirty Player (+X), Bloodlust (X+), Animosity (X), Hatred (X), …) SHALL be a single catalog entry; the concrete value SHALL live on the skill instance. Rule lookups SHALL resolve by family, and rules SHALL be able to read the instance parameter.

#### Scenario: One rule serves all Loner values

- **WHEN** players with Loner (3+) and Loner (5+) both exist
- **THEN** both resolve to the same catalog entry and (future) registered rule, each exposing its own threshold

### Requirement: Legacy skill names migrate losslessly

Every skill name removed or renamed by this change SHALL appear in a migration map, applied wherever skills are loaded (roster templates, saved teams, scenarios). A skill migrated this way SHALL preserve its effect (family + parameter). Unknown legacy names SHALL fail loudly in development builds.

#### Scenario: Saved team with old names loads intact

- **WHEN** a team saved before this change (containing "Loner 4+" and "Fumbleoskie") is loaded
- **THEN** its players carry Loner with parameter "4+" and Fumblerooski, with no skill dropped

#### Scenario: Removed enum values are covered

- **WHEN** the migration coverage test runs
- **THEN** every enum value deleted by this change is present in the migration map

### Requirement: Catalog carries original descriptions for display

Each catalog entry SHALL provide a short project-written hint. Public catalog
records SHALL NOT contain extracted book text. The hint SHALL describe the
skill's purpose without claiming to replace the complete tabletop rules.

#### Scenario: Description available to the UI

- **WHEN** a coach inspects a skill in the Team Builder
- **THEN** its project-written hint is available from the public catalog

### Requirement: Throw Team-mate family traits are implemented, not inert

The Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, and Strong Arm traits SHALL be registered as implemented rules and SHALL each ship at least one seeded catalog configuration, so the coverage gate counts them as implemented rather than inert. The gate's implemented-set snapshot SHALL be updated to include these six traits.

#### Scenario: Throw Team-mate family counts as implemented

- **WHEN** the coverage gate enumerates registered rules
- **THEN** Throw Team-mate, Kick Team-mate, Right Stuff, Always Hungry, Swoop, and Strong Arm each have a catalog configuration and appear in the implemented set

#### Scenario: No inert configuration is left dangling

- **WHEN** the coverage gate checks for catalog entries against unregistered rules
- **THEN** none of the six Throw Team-mate family traits are flagged as inert-with-configs
