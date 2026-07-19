# Proposal: reconcile-skill-catalog

## Why

The 126-entry skill catalog in `src/types/Skills.ts` diverges from the Blood Bowl 2025 rulebook it claims to represent: misspelled names ("Fumbleoskie" vs the book's "Fumblerooski", "Timmm Ber", "Unchained Fury" vs "Unchannelled Fury"), parameterized skills exploded into separate entries with inconsistent placement (Loner 3+/5+ in General but Loner 4+ in Passing, seven Animosity variants, two Mighty Blow entries), skills and traits mixed without distinction, and one-line paraphrase descriptions. Every upcoming rule implementation and every "covered by the book" test will be keyed by this catalog — building 118 rules on a wrong list bakes the errors into rules, tests, rosters, and saved teams.

## What Changes

- **Extract the book's skill tables**: a checked-in `docs/rulebook/skills.json` generated from the 2025 rulebook PDF (name, category, skill vs trait, ACTIVE/PASSIVE, parameter form, full rules text, page number), with the extraction script kept in-repo for re-runs.
- **Correct the catalog against it**: fix names and categories, add `kind: skill | trait` per the book's distinction.
- **BREAKING — collapse parameterized variants**: one `SkillType` per family (Loner, Animosity, Mighty Blow, Dirty Player, Bloodlust, Hatred…) with a `parameter` on the skill instance, replacing the split enum entries. Roster templates, saved teams, and scenario data migrate via an old-name → new-name+parameter map.
- **Book-fidelity gate**: a test comparing the catalog to `skills.json` (every book skill present with matching name/category/kind; every catalog entry traceable to the book) so future drift fails CI.
- **Official descriptions**: catalog descriptions become the book's rules text (or a faithful abridgement flagged as such), since the sandbox rule explorer will display them.

## Capabilities

### New Capabilities

- `skill-catalog`: The catalog's fidelity contract — book-matching names/categories/kinds, parameterized skill model, migration of legacy names, and the book-comparison gate.

### Modified Capabilities

<!-- none — skill-rules requirements are unchanged; the registry keys simply follow the corrected SkillType values -->

## Impact

- **Modified code**: `src/types/Skills.ts` (enum + definitions + `hasSkill` gains parameter awareness), `src/data/RosterTemplates.ts` (every roster referencing renamed/collapsed skills), `SkillRegistry` keys, team persistence load path (migration map for stored teams), TeamBuilder skill display.
- **New files**: `docs/rulebook/skills.json`, `scripts/extract-rulebook-skills.py` (pypdf), `__tests__/unit/skill-catalog.test.ts` (book gate + migration map coverage).
- **Data migration**: saved teams and roster templates carrying old skill strings load through the rename map; unknown legacy names fail loudly in dev.
- **Coordination**: should land **before** mass catalog authoring in `add-rule-scenario-catalog`'s successor batches (`implement-all-skill-rules`), so configurations are authored against final names. The 8 implemented rules keep working — their SkillType names (Block, Dodge, Tackle, Sure Hands, Catch, Pass, Wrestle, Stand Firm) match the book already.
