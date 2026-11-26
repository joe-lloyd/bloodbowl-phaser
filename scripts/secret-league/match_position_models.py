"""Join each Secret League stat-file position to a sprite model.

The stat files name teams and positions differently from the scraped roster
list that secretLeagueModels.json is keyed by. Teams join on their FUMBBL
page. Positions join on name, then singular name, then one name holding the
other, then a unique cost. Run from the repository root:

    python3 scripts/secret-league/match_position_models.py

It rewrites src/data/secretLeague/secretLeaguePositionModels.json and prints
every team and position it could not join.
"""

import json
import re
from pathlib import Path

DATA = Path("src/data")
OUT = DATA / "secretLeague/secretLeaguePositionModels.json"


def load(path):
    return json.loads((DATA / path).read_text())


def letters(name):
    return re.sub(r"[^a-z]", "", name.lower())


def singular_word(word):
    for plural, single in (("men", "man"), ("ies", "y"), ("s", "")):
        if word.endswith(plural):
            return word[: -len(plural)] + single
    return word


def singular(name):
    return "".join(singular_word(letters(word)) for word in name.split())


def same(a, b):
    return letters(a["name"]) == letters(b["name"])


def same_singular(a, b):
    return singular(a["name"]) == singular(b["name"])


def contains(a, b):
    x, y = singular(a["name"]), singular(b["name"])
    return x in y or y in x


def same_cost(a, b):
    return a["cost"] == b["cost"]


def match_positions(wanted, offered):
    found = {}
    for test in (same, same_singular, contains, same_cost):
        for position in wanted:
            if position["id"] in found:
                continue
            hits = [o for o in offered if test(position, o)]
            if len(hits) == 1:
                found[position["id"]] = hits[0]
                offered = [o for o in offered if o is not hits[0]]
    return found


def main():
    teams = load("secretLeague/secretLeagueTeamBlueprints.json")["teamBlueprints"]
    players = load("secretLeague/secretLeaguePlayerBlueprints.json")["playerBlueprints"]
    models = load("community/secretLeagueModels.json")
    by_page = {r["source"].lower(): r for r in load("community/secretLeague2025.json")}
    result = {}
    for team_id, team in teams.items():
        listed = by_page.get(team["sourceUrl"].lower())
        if listed is None or listed["name"] not in models:
            print(f"team not joined: {team['name']}")
            continue
        team_models = models[listed["name"]]
        offered = [
            {"name": p["name"], "cost": p["cost"], "model": team_models[p["name"]]}
            for p in listed["positions"]
            if p["name"] in team_models
        ]
        wanted = []
        for line in team["players"]:
            player_id = line["position"].split("/")[1]
            wanted.append({"id": player_id, **players[player_id]})
        found = match_positions(wanted, offered)
        for position in wanted:
            if position["id"] not in found:
                print(f"position not joined: {team['name']} / {position['name']}")
        result[team_id] = {
            "catalogueName": listed["name"],
            "models": {pid: hit["model"] for pid, hit in sorted(found.items())},
        }
    OUT.write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")


main()
