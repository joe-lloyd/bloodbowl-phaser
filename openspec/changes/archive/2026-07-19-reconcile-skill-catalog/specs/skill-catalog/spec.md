# skill-catalog

## ADDED Requirements

### Requirement: Catalog matches the 2025 rulebook
The skill catalog SHALL contain exactly one entry per skill and trait in the 2025 rulebook's skill tables, with the book's name, category, and skill/trait kind, verified by an automated comparison against a checked-in book-derived data file. Catalog entries with no book counterpart SHALL fail the comparison unless explicitly allowlisted.

#### Scenario: Book comparison gate
- **WHEN** the catalog gate test runs
- **THEN** every book skill is present with matching name, category, and kind, and every catalog entry traces to the book (or the allowlist), failing CI otherwise

#### Scenario: Drift is caught
- **WHEN** a catalog entry's name or category is edited away from the book
- **THEN** the gate test fails naming the divergent entry

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

### Requirement: Catalog carries book metadata for display
Each catalog entry SHALL record skill/trait kind, active/passive usage, and the book's rules text (with page reference), so UI surfaces can present rules faithfully.

#### Scenario: Rule text available to the UI
- **WHEN** the sandbox rule explorer shows a skill's details
- **THEN** the book's rules text and page reference are available from the catalog data
