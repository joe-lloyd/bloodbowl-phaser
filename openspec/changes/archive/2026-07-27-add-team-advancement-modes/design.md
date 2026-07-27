## Context

Team progression is currently treated as a match-level boolean, but Sevens supports
three materially different roster lifecycles. Matched Play assigns a competition-defined
skill package before play, Advanced League uses standard SPP, and Skill Selection awards
one random skill after each game before applying the Draft. A team's mode must therefore
be durable and compatible with the competition that accepts it.

## Goals / Non-Goals

**Goals:**

- Make advancement mode a required, immutable team-creation choice.
- Implement Matched Play packages, Advanced League SPP, and Sevens Skill Selection.
- Apply standard value increases and exact Sevens Draft compensation.
- Let competitions publish advancement mode, draft budget, and roster constraints.
- Explain compatibility before entry and enforce it authoritatively.

**Non-Goals:**

- Hard-code one universal Matched Play tier package; event profiles supply it.
- Permit converting an experienced team between advancement modes.
- Replace the existing standard skill-access and random-skill tables.

## Decisions

### Store advancement mode on the team

`matched-play`, `advanced-league`, or `sevens-skill-selection` is selected before the
team is finalized and becomes immutable once any roster construction or competition
entry depends on it. Older teams migrate to Advanced League when they contain SPP or
advancement history; otherwise they require explicit confirmation before competitive
entry.

### Give competitions a versioned roster rule profile

A profile contains the required advancement mode, team draft budget, eligible rosters,
Matched Play skill package (when applicable), and other compatibility flags. Both UI and
repository commands call the same validator and return structured refusal reasons.

### Reuse skill legality and value calculations

Matched Play and Skill Selection create advancement records with provenance but use the
existing category access, duplicate filtering, random two-roll choice, and value
increase services. Only Advanced League mutates SPP.

### Model Skill Selection and the Draft as durable post-match decisions

The eligible participant set is frozen from match records. The coach chooses either:
one eligible participant chosen by the coach receives a random Primary two-roll choice,
or one eligible participant is randomly selected and receives a random Secondary
two-roll choice. After DEAD removal, a D6 is rolled for every player with added skills;
on a result less than or equal to their number of added skills, they leave and the team
receives gold equal to the total value increase from those skills.

### Defer incomplete development to Team Management

Post-match records awards and creates pending mode-specific development work. Coaches
complete choices from Manage Team, allowing the results screen to remain escapable while
preserving required progression.

## Risks / Trade-offs

- **Existing teams do not declare a mode** → Migrate only unambiguous SPP teams
  automatically and block competition entry with a clear choice for ambiguous drafts.
- **Event tier packages change over time** → Snapshot the profile version with the
  competition and team entry.
- **A drafted player may be referenced by history** → Remove them from the active roster
  but retain immutable career, match, and Draft records.
- **Deferred decisions could be bypassed by starting another match** → Competition and
  match eligibility checks expose and enforce pending team-development work.

## Migration Plan

Add mode and advancement provenance with safe persistence defaults. Existing SPP-bearing
teams become Advanced League. Existing competitions retain a legacy profile until edited
or migrated; new competitions must select a complete profile.
