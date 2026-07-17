# Design: reconcile-skill-catalog

## Context

`src/types/Skills.ts` is an 820-line hand-maintained catalog (string enum `SkillType` + `SKILL_DEFINITIONS`). Its values are persisted: roster templates embed them, saved teams serialize them, and the `SkillRegistry` (add-skill-rules-system) keys rules by them. The 2025 rulebook PDF in `docs/pdfs/` has an extractable text layer — the Wrestle/Stand Firm implementations were verified from it with a small pypdf script. The book distinguishes **Skills** (six categories: General, Agility, Passing, Strength, Mutation, Devious) from **Traits**, marks each ACTIVE/PASSIVE, and parameterizes some as e.g. "Loner (X+)", "Mighty Blow (+X)".

## Goals / Non-Goals

**Goals:**

- Catalog matches the book — names, categories, skill/trait kind — enforced by a CI gate against a book-derived data file.
- One `SkillType` per skill family; parameters live on the instance.
- No saved team, roster, or scenario silently loses a skill in migration.

**Non-Goals:**

- Implementing any rule behavior (batches in `implement-all-skill-rules`).
- Star-player special rules and team special rules (not in the skill tables).
- Redesigning the team builder UI beyond displaying corrected names/parameters.

## Decisions

### 1. Book data as a checked-in generated file, not a runtime dependency

`scripts/extract-rulebook-skills.py` (pypdf, same approach already proven) parses the skill/trait chapters into `docs/rulebook/skills.json`. The file is committed and reviewed by hand once — extraction quirks (hyphenation, OCR noise like "SKiIl") are corrected in a small overrides table inside the script so re-extraction stays reproducible. The gate test reads the JSON; the PDF is never touched at test time. Alternative — comparing directly against the PDF in tests — rejected: slow, noisy, and non-reviewable.

### 2. Parameterized skills: family enum + instance parameter

`SkillType.LONER = "Loner"` (one entry); `Skill` instances gain `parameter?: string | number` ("4+", "+2", a race for Animosity/Hatred). `hasSkill` keeps its signature; a new `getSkill(skills, type)` exposes the parameter for rules that need it. Rationale: the registry maps one rule per family (a Loner rule reads its X from the instance) — the alternative of per-variant enum entries would force N registrations of the same rule and keeps the current category inconsistencies possible.

### 3. Single migration map, applied at every load boundary

`LEGACY_SKILL_NAMES: Record<string, {type: SkillType; parameter?}>` covering every removed/renamed enum value ("Loner 4+" → Loner + "4+", "Fumbleoskie" → "Fumblerooski", all Animosity variants…). Applied in: roster template definitions (rewritten directly), team deserialization (localStorage/Firestore snapshots), and scenario loading. Unknown legacy names throw in dev / warn-and-drop in production. A test asserts every enum value deleted in this change appears in the map.

### 4. Kind and usage metadata

`SKILL_DEFINITIONS` entries gain `kind: "skill" | "trait"` and `usage: "active" | "passive"` from the book. The sandbox rule explorer and team builder can then group/filter honestly (traits are not pickable at advancement). Descriptions become the book's rules text; where abridged, the full text stays available via the JSON (keyed by page) for the explorer's detail view.

### 5. Gate test shape

Three assertions: (a) every `skills.json` entry has exactly one catalog entry with matching name, category, kind; (b) every catalog entry maps to a book entry (no inventions); (c) coverage totals reconcile (`SkillRegistry.coverage().total === catalog size`). Deliberate divergence (e.g. a house-rule skill someday) would need an explicit allowlist entry — same conscious-update pattern as the inert-skills snapshot.

## Risks / Trade-offs

- [PDF extraction is noisy (ligatures, column bleed)] → hand-reviewed once with an overrides table; the committed JSON is the artifact of record, the script exists for provenance and re-runs.
- [Collapsing enum entries breaks persisted teams] → migration map at every load boundary + a test enumerating removed values; dev builds throw on unknown names so gaps surface immediately.
- [RosterTemplates churn is large and error-prone] → rewritten mechanically via the same map (script or codemod), then the book gate + existing roster tests verify the result.
- [The 8 implemented rules' SkillType references] → their names already match the book; the gate confirms.

## Migration Plan

1. Extraction script + reviewed `skills.json` (no code behavior change).
2. Catalog rewrite + migration map + load-boundary application, roster templates regenerated.
3. Gate test on; full suite green; a saved pre-change team verified to load with all skills intact.

## Open Questions

- Do Star Player-only traits that appear in rosters we ship (e.g. from `RosterTemplates`) belong in the catalog or a separate star-trait list? (Default: include in catalog flagged `kind: trait` if any roster references them; otherwise defer.)
- Whether production should warn-and-drop or hard-fail on unknown legacy skill names (default: warn-and-drop, dev throws).
