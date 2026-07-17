# Tasks: reconcile-skill-catalog

## 1. Book extraction

- [ ] 1.1 `scripts/extract-rulebook-skills.py` (pypdf): parse the 2025 rulebook skill/trait chapters into `docs/rulebook/skills.json` (name, category, kind, active/passive, parameter form, rules text, page), with an overrides table for OCR noise.
- [ ] 1.2 Hand-review the JSON against the book's skill list/index pages (p.124, p.201-203); commit both script and data.

## 2. Catalog rewrite

- [ ] 2.1 Collapse parameterized families to single `SkillType` entries; add `parameter` to skill instances; `getSkill(skills, type)` helper; `hasSkill` unchanged for callers.
- [ ] 2.2 Correct names/categories per the book; add `kind` + `usage` + book text/page to `SKILL_DEFINITIONS`.
- [ ] 2.3 `LEGACY_SKILL_NAMES` migration map covering every removed/renamed value; apply at team deserialization and scenario load (dev: throw on unknown; prod: warn-and-drop).
- [ ] 2.4 Regenerate `RosterTemplates` skill references through the map; existing roster/team tests green.

## 3. Gate + verification

- [ ] 3.1 `__tests__/unit/skill-catalog.test.ts`: book comparison gate (book→catalog, catalog→book/allowlist, registry total reconciles) + migration-map coverage of deleted enum values.
- [ ] 3.2 Round-trip check: a team saved with pre-change names (fixture) loads with all skills intact; full suite green (the 8 implemented rules' names already match the book — confirm via gate).
