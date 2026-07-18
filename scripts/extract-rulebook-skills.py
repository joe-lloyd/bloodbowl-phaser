"""Extract the 2025 rulebook's skills & traits into docs/rulebook/skills.json.

The curated lists below are the reviewed data (skill-table membership from
the rulebook's SKILL TABLE, traits = every other description header). The
script grounds each entry in the PDF: it must find the entry's description
header (NAME [\(param\)] [*] (ACTIVE|PASSIVE)) in the skills chapter, and it
captures usage, the compulsory asterisk, the page, and the rules text. Any
curated entry it cannot find - or any header found that is not curated -
fails the run, so the JSON can never silently drift from the book.

Usage:  python scripts/extract-rulebook-skills.py
"""

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

PDF = Path("docs/pdfs/Blood Bowl (2025) Rulebook 3rd Season (with text).pdf")
OUT = Path("docs/rulebook/skills.json")

# pypdf page index -> printed page label (index label 127 = pypdf 130)
PAGE_LABEL_OFFSET = -3
CHAPTER = range(126, 142)  # pypdf pages holding the descriptions

# SKILL TABLE (printed p.124): 6 categories x 12 skills, alphabetical per
# column. Everything with a description header that is NOT here is a trait.
SKILL_TABLE = {
    "Agility": [
        "Catch", "Defensive", "Diving Catch", "Diving Tackle", "Dodge",
        "Hit and Run", "Jump Up", "Leap", "Safe Pair of Hands", "Sidestep",
        "Sprint", "Sure Feet",
    ],
    "Devious": [
        "Dirty Player", "Eye Gouge", "Fumblerooski", "Lethal Flight",
        "Lone Fouler", "Pile Driver", "Put the Boot In", "Quick Foul",
        "Saboteur", "Shadowing", "Sneaky Git", "Violent Innovator",
    ],
    "General": [
        "Block", "Dauntless", "Fend", "Frenzy", "Kick", "Pro",
        "Steady Footing", "Strip Ball", "Sure Hands", "Tackle", "Taunt",
        "Wrestle",
    ],
    "Mutation": [
        "Big Hand", "Claws", "Disturbing Presence", "Extra Arms",
        "Foul Appearance", "Horns", "Iron Hard Skin", "Monstrous Mouth",
        "Prehensile Tail", "Tentacles", "Two Heads", "Very Long Legs",
    ],
    "Passing": [
        "Accurate", "Cannoneer", "Cloud Burster", "Dump-Off", "Give and Go",
        "Hail Mary Pass", "Leader", "Nerves of Steel", "On the Ball", "Pass",
        "Punt", "Safe Pass",
    ],
    "Strength": [
        "Arm Bar", "Brawler", "Break Tackle", "Bullseye", "Grab", "Guard",
        "Juggernaut", "Mighty Blow", "Multiple Block", "Stand Firm",
        "Strong Arm", "Thick Skull",
    ],
}

TRAITS = [
    "Always Hungry", "Animal Savagery", "Animosity", "Ball & Chain",
    "Bloodlust", "Bombardier", "Bone Head", "Breathe Fire", "Chainsaw",
    "Decay", "Drunkard", "Hatred", "Hypnotic Gaze", "Insignificant",
    "Kick Team-Mate", "Loner", "My Ball", "No Ball", "Pick-Me-Up",
    "Plague Ridden", "Pogo", "Projectile Vomit", "Really Stupid",
    "Regeneration", "Right Stuff", "Secret Weapon", "Stab", "Stunty",
    "Swoop", "Take Root", "Throw Team-mate", "Timmm-ber!", "Titchy",
    "Trickster", "Unchannelled Fury", "Unsteady",
]

# Families the book parameterizes; the form appears in the header/uses.
PARAM_FORMS = {
    "Animosity": "X",
    "Bloodlust": "X+",
    "Hatred": "X",
    "Loner": "X+",
}

# Extraction-noise overrides for headers the text layer mangles beyond the
# generic pattern. Each may pin usage/compulsory when the marker is lost,
# and may supply hand-transcribed text where two-column interleave corrupts
# the captured body (such text is flagged abridged when the page's layout
# ate part of it). All values hand-reviewed against the printed page.
OVERRIDES = {
    # "P NIMAL SAVAG ERY ... PASSIVE" - broken word + detached marker;
    # body text interleaves with the Arm Bar column
    "Animal Savagery": {
        "pattern": r"NIMAL\s*SAVAG\s*ERY",
        "usage": "passive",
        "compulsory": True,
        "abridged": True,
        "text": (
            "Whenever this player is activated, after declaring their "
            "action they must roll a D6. They may apply a +2 modifier to "
            "the roll if they have declared a Block Action or a Blitz "
            "Action. On a 4+, the player may perform the declared action "
            "as normal. On a 1-3, this player lashes out at one of their "
            "team-mates. Choose one Standing team-mate adjacent to this "
            "player; the chosen player is immediately Knocked Down. This "
            "will not cause a Turnover unless [...]"
        ),
    },
    # Body text starts with the Accurate column's remnants
    "Animosity": {
        "pattern": None,  # generic pattern works; only the text is replaced
        "text": (
            "Whenever this player attempts to perform a Pass Action or a "
            "Hand-off Action to a team-mate with the same Keyword as the "
            "one shown in brackets, roll a D6. On a 1, the player refuses "
            "to perform the action and their activation immediately ends. "
            "Some players may have the Animosity (all) Trait, in which "
            "case they will apply this rule to all of their team-mates, "
            "regardless of the Keywords they have."
        ),
    },
    # "(PASSIVE). PRESENCE*|Ae|ee|PASSIVE)" - name half lost
    "Disturbing Presence": {
        "pattern": r"PRESENCE\*[\s\S]{0,14}?PASSIVE\)",
        "usage": "passive",
        "compulsory": True,
    },
    # Text layer says (PASSIVE), but the entry declares a Special Action,
    # which the book defines as an Active use (p.124); the marker was
    # misattributed from a neighbouring column
    "Kick Team-Mate": {"pattern": None, "usage": "active"},
    # Header entirely absent; the entry starts at its body text with the
    # opening words eaten by layout junk
    "Leader": {
        "pattern": r"Skill on the pitch at the start of a half",
        "usage": "passive",
        "compulsory": False,
        "abridged": True,
        "text": (
            "[...] Skill on the pitch at the start of a half may gain a "
            "single extra Team Re-roll - this is called a Leader Re-roll. "
            "A team can only use a Leader Re-roll if they have a player "
            "with the Leader Skill on the pitch, and if all players with "
            "this Skill are removed from play, either as a result of a "
            "Casualty or by being Sent-off, before the Leader Re-roll is "
            "used then it is lost. A Leader Re-roll follows all of the "
            "usual rules for standard Team Re-rolls, with the exception "
            "that it cannot be lost as a result of a Halfling Master Chef."
        ),
    },
    # "MONSTROUS MOUTHWhen this player..." - marker lost (declares a
    # Special Action, so active)
    "Monstrous Mouth": {
        "pattern": r"MONSTROUS\s*MOUTH",
        "usage": "active",
        "compulsory": False,
    },
    # "TWO" separated from "HEADS" by layout noise
    "Two Heads": {"pattern": r"HEADS\s*\(ACTIVE\)", "usage": "active"},
}


def header_pattern(name: str) -> re.Pattern:
    words = [re.escape(w.upper()) for w in name.split(" ")]
    body = r"[\s\S]{0,3}".join(words)  # tolerate line-break noise
    param = r"(?:\s*\([^)]{1,4}\))?"  # e.g. (X), (X+)
    junk = r"(\*)?[^()A-Za-z]{0,4}"  # stray glyphs before the marker
    # Closing paren is sometimes lost from the text layer
    return re.compile(
        body + param + junk + r"\((ACTIVE|PASSIVE)\)?", re.IGNORECASE
    )


def main() -> int:
    reader = PdfReader(str(PDF))
    # Concatenate the chapter with page markers so match offsets map to pages
    marker = "@PAGE:%d@"
    joined = "".join(
        (marker % i) + (reader.pages[i].extract_text() or "") for i in CHAPTER
    )

    def page_at(offset: int) -> int:
        last = 126
        for m in re.finditer("@PAGE:(\\d+)@", joined):
            if m.start() > offset:
                break
            last = int(m.group(1))
        return last

    curated = [
        {"name": n, "kind": "skill", "category": cat}
        for cat, names in SKILL_TABLE.items()
        for n in names
    ] + [{"name": n, "kind": "trait", "category": None} for n in TRAITS]

    # The chapter is alphabetical, so each header appears near-after the
    # previous entry's - this both disambiguates substring collisions
    # ("Pass" inside "Safe Pass") and rejects prose false-positives. The
    # two-column layout interleaves stream order within a page, so the
    # search window backtracks ~two pages.
    curated.sort(key=lambda e: e["name"].upper())
    BACKTRACK = 5500

    found = []
    misses = []
    pos = 0
    for entry in curated:
        override = OVERRIDES.get(entry["name"])
        pattern = (
            re.compile(override["pattern"])
            if override and override.get("pattern")
            else header_pattern(entry["name"])
        )
        match = pattern.search(joined, max(0, pos - BACKTRACK))
        if not match:
            misses.append(entry["name"])
            continue
        raw_usage = next(
            (g for g in match.groups() or [] if g in ("ACTIVE", "PASSIVE")),
            None,
        )
        usage = (override or {}).get(
            "usage", raw_usage.lower() if raw_usage else None
        )
        if usage is None:
            misses.append(f"{entry['name']} (usage marker lost)")
            continue
        compulsory = (override or {}).get(
            "compulsory", "*" in (match.group(0) or "")
        )
        found.append(
            {**entry, "usage": usage, "compulsory": compulsory,
             "start": match.start(), "end": match.end()}
        )
        pos = max(pos, match.end())

    if misses:
        print("MISSING headers for curated entries:", ", ".join(misses))
        return 1

    # Rules text: from each header to the next header (document order)
    found.sort(key=lambda e: e["start"])
    entries = []
    for i, e in enumerate(found):
        override = OVERRIDES.get(e["name"], {})
        if override.get("text"):
            text = override["text"]
        else:
            end = (
                found[i + 1]["start"] if i + 1 < len(found) else e["end"] + 2500
            )
            text = joined[e["end"] : end]
            text = re.sub("@PAGE:\\d+@", " ", text)
            text = re.sub(r"\s+", " ", text).strip()
        pdf_page = page_at(e["start"])
        entries.append(
            {
                "name": e["name"],
                "kind": e["kind"],
                "category": e["category"],
                "usage": e["usage"],
                "compulsory": e["compulsory"],
                "parameterForm": PARAM_FORMS.get(e["name"]),
                "page": pdf_page + PAGE_LABEL_OFFSET,
                "pdfPage": pdf_page,
                "abridged": bool(override.get("abridged")) or None,
                "text": text,
            }
        )

    entries.sort(key=lambda e: e["name"].lower())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": PDF.name,
                "pageLabelOffset": PAGE_LABEL_OFFSET,
                "skills": sum(1 for e in entries if e["kind"] == "skill"),
                "traits": sum(1 for e in entries if e["kind"] == "trait"),
                "entries": entries,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT} ({len(entries)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
