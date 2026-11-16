"""Offline, block-balanced policy comparison. Python standard library only."""
import argparse
import collections
import csv
import hashlib
import io
import json
import random
import statistics
import zipfile
from pathlib import Path


def load_games(root):
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest["format"] != "bb7-policy-study-v1":
        raise ValueError("Unsupported study format")
    jobs = {j["id"]: j for j in manifest["jobs"]}
    if len(jobs) != len(manifest["jobs"]):
        raise ValueError("Duplicate scheduled IDs")
    games = {}
    for path in sorted((root / "games").glob("*.json")):
        g = json.loads(path.read_text())
        if g["id"] not in jobs or g["id"] in games:
            raise ValueError("Unexpected or duplicate game: " + g["id"])
        job = jobs[g["id"]]
        if any(g.get(k) != v for k, v in job.items()):
            raise ValueError("Schedule differs: " + g["id"])
        if path.stem != g["id"] or g.get("observationVersion") != 2:
            raise ValueError("Invalid result identity or observation version")
        if not g.get("verifiedHash"):
            raise ValueError("Missing replay verification: " + g["id"])
        if sum(s["count"] for s in g["skills"]) != g["counters"].get("skillTriggered", 0):
            raise ValueError("Skill telemetry does not reconcile: " + g["id"])
        if sum(s["attempts"] for s in g["rolls"]) != g["counters"].get("diceRoll", 0):
            raise ValueError("Roll telemetry does not reconcile: " + g["id"])
        games[g["id"]] = g
    blocks = collections.defaultdict(list)
    for job in jobs.values():
        blocks[job["pair"]].append(job)
    included, excluded = [], []
    for name, block in blocks.items():
        block.sort(key=lambda j: j["leg"])
        size = manifest.get("blockSize", 4)
        if size not in (4, 8) or len(block) != size or [j["leg"] for j in block] != list(range(size)):
            raise ValueError("Invalid balanced block: " + name)
        first = block[0]
        for leg, j in enumerate(block):
            sides = first["variantIds"] if leg % 2 == 0 else list(reversed(first["variantIds"]))
            if (j["seed"] != first["seed"] or j["variantIds"] != sides
                    or j["candidateSide"] != (0 if leg % 4 in (0, 3) else 1)
                    or j["development"] != first["development"]):
                raise ValueError("Unbalanced block: " + name)
            if size == 8 and j.get("receivingSide") != (0 if leg < 4 else 1):
                raise ValueError("Unbalanced first receiver: " + name)
        results = [games.get(j["id"]) for j in block]
        if size == 8 and any(g and g.get("initialReceivingSide") != j["receivingSide"]
                             for g, j in zip(results, block)):
            raise ValueError("Engine first receiver differs: " + name)
        if all(g and g["completed"] and not g["findings"] for g in results):
            included.append(results)
        else:
            excluded.append(name)
    return manifest, games, included, excluded


def points(g):
    a, b = g["candidateSide"], 1 - g["candidateSide"]
    return 1 if g["score"][a] > g["score"][b] else .5 if g["score"][a] == g["score"][b] else 0


def interval(values):
    if not values:
        return None
    rng = random.Random(714)
    boot = sorted(statistics.fmean(rng.choices(values, k=len(values))) for _ in range(2000))
    return [boot[49], boot[1949]]


def comparison(blocks):
    values = [statistics.fmean(points(g) for g in block) for block in blocks]
    games = [g for b in blocks for g in b]
    return {
        "games": len(games), "blocks": len(blocks),
        "points": statistics.fmean(values) if values else None,
        "ci": interval(values),
        "wins": sum(points(g) == 1 for g in games),
        "draws": sum(points(g) == .5 for g in games),
        "losses": sum(points(g) == 0 for g in games),
    }


def roster_estimates(blocks, templates):
    """Resample whole balanced blocks, then give each represented roster equal weight."""
    clusters = []
    for block in blocks:
        totals = collections.defaultdict(lambda: [0, 0])
        for g in block:
            roster = templates[g["templates"][g["candidateSide"]]]["rosterName"]
            totals[roster][0] += points(g)
            totals[roster][1] += 1
        clusters.append(dict(totals))
    if not clusters:
        return {"points": None, "ci": None}
    def estimate(sample):
        totals = collections.defaultdict(lambda: [0, 0])
        for cluster in sample:
            for name, (score, count) in cluster.items():
                totals[name][0] += score
                totals[name][1] += count
        return statistics.fmean(score / count for score, count in totals.values())
    rng = random.Random(715)
    boot = sorted(estimate(rng.choices(clusters, k=len(clusters))) for _ in range(2000))
    return {"points": estimate(clusters), "ci": [boot[49], boot[1949]],
            "rosters": len(set(name for c in clusters for name in c)), "blocks": len(clusters)}


def analyse(manifest, all_games, blocks, excluded):
    games = [g for b in blocks for g in b]
    templates = {t["id"]: t for t in manifest["inventory"]["teams"]}
    rows, skills, rolls = [], [], []
    for g in games:
        for side in (0, 1):
            policy = "candidate" if side == g["candidateSide"] else "frozen"
            roster = templates[g["templates"][side]]["rosterName"]
            td, cas = g["score"][side], g["stats"][side]["casualties"]
            objective = manifest["objectives"][roster]
            result = points(g) if policy == "candidate" else 1 - points(g)
            rows.append({
                "game": g["id"], "block": g["pair"], "policy": policy,
                "roster": roster, "template": g["templates"][side],
                "variant": g["variantIds"][side], "development": g["development"],
                "seed": g["seed"], "side": side, "points": result,
                "touchdowns": td, "casualties": cas,
                "spp_objective": td * objective["touchdown"] + cas * objective["casualty"],
                "td_weight": objective["touchdown"], "cas_weight": objective["casualty"],
                "turnovers": g["stats"][side]["turnovers"],
                "decision_ms": g["policyMilliseconds"][policy],
                "deaths": g.get("playerLosses", [{}, {}])[side].get("deaths", 0),
                "miss_next_game": g.get("playerLosses", [{}, {}])[side].get("missNextGame", 0),
            })
        for source, target in ((g["skills"], skills), (g["rolls"], rolls)):
            for s in source:
                policy = "candidate" if s["side"] == g["candidateSide"] else "frozen"
                target.append({"game": g["id"], "block": g["pair"], "policy": policy, **s})
    roster_rows = []
    for name in sorted(set(r["roster"] for r in rows)):
        own = [r for r in rows if r["roster"] == name and r["policy"] == "candidate"]
        old = [r for r in rows if r["roster"] == name and r["policy"] == "frozen"]
        roster_rows.append({
            "roster": name, "games_per_policy": len(own),
            "points": statistics.fmean(r["points"] for r in own),
            "frozen_points": statistics.fmean(r["points"] for r in old),
            "points_delta": statistics.fmean(r["points"] for r in own) - statistics.fmean(r["points"] for r in old),
            **{key + "_delta": statistics.fmean(r[key] for r in own) - statistics.fmean(r[key] for r in old)
               for key in ("touchdowns", "casualties", "turnovers", "spp_objective")},
        })
    totals = {}
    actions = {p: collections.Counter() for p in ("candidate", "frozen")}
    for policy in actions:
        own = [r for r in rows if r["policy"] == policy]
        totals[policy] = {key: sum(r[key] for r in own) for key in
                          ("touchdowns", "casualties", "turnovers", "spp_objective", "decision_ms", "deaths", "miss_next_game")}
        for g in games:
            actions[policy].update(g["policyDecisions"][policy])
    skill_rows = []
    for name in manifest["inventory"]["skills"]:
        own = [s for s in skills if s["skill"] == name]
        skill_rows.append({"skill": name, **{
            p: sum(s["count"] for s in own if s["policy"] == p)
            for p in actions
        }, "contexts": len(own)})
    comparisons = {"overall": comparison(blocks)}
    for arm in ("base", "focused", "random"):
        comparisons[arm] = comparison([b for b in blocks if b[0]["development"] == arm])
    methods = {v["id"]: v.get("buildMethod", v["arm"]) for v in manifest.get("variants", [])}
    build_methods = {method: comparison([b for b in blocks if methods.get(b[0]["variantIds"][0]) == method])
                     for method in sorted(set(methods.values()))}
    loss_delta = {}
    for key in ("deaths", "missNextGame"):
        values = [statistics.fmean(
            g.get("playerLosses", [{}, {}])[g["candidateSide"]].get(key, 0)
            - g.get("playerLosses", [{}, {}])[1 - g["candidateSide"]].get(key, 0)
            for g in block) for block in blocks]
        loss_delta[key] = {"per_game": statistics.fmean(values) if values else None, "ci": interval(values)}
    return {
        "scheduled": len(manifest["jobs"]), "saved": len(all_games),
        "included": len(games), "excluded_blocks": excluded,
        "engine_findings": sum(len(g["findings"]) for g in all_games.values()),
        "comparisons": comparisons, "totals": totals, "actions": actions,
        "build_methods": build_methods, "equal_roster": roster_estimates(blocks, templates),
        "player_loss_delta": loss_delta,
        "opportunities": {kind: sum(g.get("opportunities", {}).get(kind, {}).get("pass", 0) for g in games)
                          for kind in ("legal", "proposed")},
        "accepted_candidate_passes": sum(g["counters"].get("accepted:" + str(g["candidateSide"]) + ":pass", 0) for g in games),
        "rosters": roster_rows, "skills": skill_rows,
        "macro_points": statistics.fmean(r["points"] for r in roster_rows) if roster_rows else None,
        "macro_points_delta": statistics.fmean(r["points_delta"] for r in roster_rows) if roster_rows else None,
    }, rows, skills, rolls


def csv_text(rows):
    out = io.StringIO(newline="")
    if rows:
        writer = csv.DictWriter(out, list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return out.getvalue()


def build(root, out, skill_plan=None):
    manifest, games, blocks, excluded = load_games(root)
    if len(games) != len(manifest["jobs"]):
        raise ValueError("Study is incomplete; report requires the complete acquisition")
    summary, rows, skills, rolls = analyse(manifest, games, blocks, excluded)
    if not rows:
        raise ValueError("No complete, finding-free balanced blocks")
    plans = []
    if skill_plan:
        with skill_plan.open() as source:
            plans = list(csv.DictReader(source))
    summary["skill_plan"] = plans
    summary["feeding"] = {
        policy: {
            "unfed_events": sum(s["count"] for s in skills if s["policy"] == policy
                                and s["skill"] == "Bloodlust" and "bit nobody" in s["effect"]),
            "bite_events": sum(s["count"] for s in skills if s["policy"] == policy
                               and s["skill"] == "Bloodlust" and " bites " in s["effect"]),
            "bloodlust_rolls": sum(r["attempts"] for r in rolls if r["policy"] == policy
                                   and r["roll"] == "Bloodlust"),
            "bloodlust_failures": sum(r["failures"] for r in rolls if r["policy"] == policy
                                      and r["roll"] == "Bloodlust"),
        } for policy in ("candidate", "frozen")
    }
    out.mkdir(parents=True, exist_ok=True)
    files = {
        "summary.json": json.dumps(summary, indent=2),
        "manifest.json": json.dumps(manifest, indent=2),
        "team-games.csv": csv_text(rows),
        "rosters.csv": csv_text(summary["rosters"]),
        "skill-usage.csv": csv_text(summary["skills"]),
        "skill-contexts.csv": csv_text(skills),
        "roll-contexts.csv": csv_text(rolls),
        "skill-plan.csv": csv_text(plans),
        "decision-receipts.json": json.dumps([
            {"game": g["id"], "seed": g["seed"], "candidateSide": g["candidateSide"], **receipt}
            for g in games.values() for receipt in g.get("receipts", [])], indent=2),
        "selected-commands.csv": csv_text([
            {"command": key, **{p: summary["actions"][p].get(key, 0) for p in ("candidate", "frozen")}}
            for key in sorted(set(summary["actions"]["candidate"]) | set(summary["actions"]["frozen"]))
        ]),
        "games.csv": csv_text([
            {"id": g["id"], "block": g["pair"], "candidate_side": g["candidateSide"],
             "seed": g["seed"], "completed": g["completed"],
             "findings": json.dumps(g["findings"]), "verified_hash": g["verifiedHash"],
             "included": g["pair"] not in excluded}
            for g in games.values()
        ]),
    }
    optional_files = []
    for name in ("candidate-source.tar.gz", "frozen-source.tar.gz", "smoke-summary.json", "development-summary.json"):
        if (root / name).exists():
            (out / name).write_bytes((root / name).read_bytes())
            optional_files.append(name)
        else:
            (out / name).unlink(missing_ok=True)
    provenance = {
        "candidate_source_digest": manifest["sourceDigest"],
        "frozen_source_digest": manifest["baselineDigest"],
        "baseline_revision": manifest["baselineRevision"],
        "candidate_revision": manifest["revision"], "host": manifest["host"],
        "report_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "template_sha256": hashlib.sha256(Path(__file__).with_name("dashboard.html").read_bytes()).hexdigest(),
        "results_sha256": hashlib.sha256(b"".join(
            p.name.encode() + p.read_bytes() for p in sorted((root / "games").glob("*.json"))
        )).hexdigest(),
        "source_archives": {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                            for name in ("candidate-source.tar.gz", "frozen-source.tar.gz")
                            if (root / name).exists()},
        "traces": str(root / "traces"),
        "limitations": [
            "One frozen opponent per acquisition: " + manifest.get("opponent", "planner") + ". Broader independent opponents remain follow-up tests.",
            "A team-level policy comparison cannot identify individual skill win value.",
            "Skill events include passive and reaction effects; zero events do not prove a rule is missing.",
            "Roll contexts describe command-entry position, not necessarily the eventual feeding endpoint.",
            "Raw traces remain beside acquisition games and are not included in the data ZIP.",
            "Archived decision code shares the candidate engine and legal command list.",
            "Results describe the archived candidate source digest, not later planner revisions.",
        ],
    }
    files["provenance.json"] = json.dumps(provenance, indent=2)
    for name, text in files.items():
        (out / name).write_text(text)
    embedded = json.dumps({"summary": summary, "manifest": {
        "smoke": manifest["smoke"], "host": manifest["host"], "blockSize": manifest.get("blockSize", 4),
        "sourceDigest": manifest["sourceDigest"], "baselineRevision": manifest["baselineRevision"],
    }, "limitations": provenance["limitations"]}).replace("<", "\\u003c")
    page = Path(__file__).with_name("dashboard.html").read_text().replace("__STUDY_DATA__", embedded)
    (out / "index.html").write_text(page)
    with zipfile.ZipFile(out / "policy-study-data.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for name in sorted([*files, *optional_files, "index.html"]):
            archive.write(out / name, name)
    print(json.dumps({"out": str(out), **summary["comparisons"]["overall"],
                      "findings": summary["engine_findings"], "excluded_blocks": len(excluded)}))
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--skill-plan", type=Path)
    args = parser.parse_args()
    build(args.run, args.out, args.skill_plan)
