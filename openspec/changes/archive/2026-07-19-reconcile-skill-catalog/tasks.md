# Tasks: reconcile-skill-catalog

## 1. Book extraction

- [x] 1.1 `scripts/extract-rulebook-skills.py` (pypdf): parse the 2025 rulebook skill/trait chapters into `docs/rulebook/skills.json` (name, category, kind, active/passive, parameter form, rules text, page), with an overrides table for OCR noise. Kind is derived from SKILL TABLE membership (p.124) + description headers; the `*` marker means compulsory, not trait (Frenzy is a compulsory Skill). Alphabetical-order-constrained matching defeats substring collisions and column interleave.
- [x] 1.2 Hand-review the JSON against the book's skill list/index pages; overrides carry hand-transcribed text (flagged `abridged`) for the three column-interleave-damaged entries (Animal Savagery, Animosity, Leader) and a usage correction for Kick Team-Mate (declares a Special Action = Active per p.124). 72 skills + 36 traits = 108 entries. Notable corrections vs the old catalog: Sure Hands is General, Stand Firm is Strength, Fumblerooski/Timmm-ber!/Unchannelled Fury spellings, Sidestep, On the Ball, Pogo, Throw Team-mate; Safe Throw and Piling On do not exist in 2025.

## 2. Catalog rewrite

- [x] 2.1 Collapsed parameterized families to single `SkillType` entries (Loner, Bloodlust, Animosity, Dirty Player, Mighty Blow); `parameter` on skill instances; `getSkill(type, parameter?)` + `findSkill(skills, type)`; `hasSkill` unchanged.
- [x] 2.2 `SKILL_DEFINITIONS` is now GENERATED from `docs/rulebook/skills.json` (kind/usage/compulsory/page/text; description = first sentence) and throws at load on enum-vs-book divergence — the catalog matches the book by construction. Removed the unreferenced duplicate `src/data/refined-data-skills.ts`. Non-book entries removed outright (Portal Navigator/Passer, Wall Thrower, Running Pass, Swarming — zero roster references).
- [x] 2.3 `LEGACY_SKILL_NAMES` migration map (29 entries incl. null-mapped removals) + `migrateSkill`/`migrateSkills` applied in `TeamManager.loadTeams` (the single persisted-team load boundary; snapshots restore placement only, never skills). Dev throws on unknown names; production warns and drops.
- [x] 2.4 `RosterTemplates` regenerated through the map (Loner 4+ → Loner+"4+", Animosity variants → parameter, Dirty Player +2, Bloodlust 2+/3+, member renames); typecheck-clean.

## 3. Gate + verification

- [x] 3.1 `__tests__/unit/skill-catalog.test.ts`: book comparison gate (book→catalog, catalog→book, categories/kinds/usages match, registry total = 108, 8 implemented rules intact) + migration-map coverage of all 29 removed values + no legacy/current collisions.
- [x] 3.2 Round-trip: a pre-change saved-team fixture (Loner 4+, Throw Teammate, Fumbleoskie, Unchained Fury, Portal Navigator) loads with all skills intact as families+parameters (removed entry dropped with a warning); full suite green (435 tests); browser bundle builds.
