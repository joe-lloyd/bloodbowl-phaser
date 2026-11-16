"""Regression checks for balanced estimates and published evidence."""
import contextlib
import copy
import io
import json
import re
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

from report import analyse, build, load_games, roster_estimates


class ReportTest(unittest.TestCase):
    def fixture(self, root):
        jobs, games = [], []
        for pair in ("a", "b"):
            for leg in range(4):
                side = 0 if leg in (0, 3) else 1
                ids = ["v1", "v2"] if leg % 2 == 0 else ["v2", "v1"]
                job = {"id": f"{pair}-{leg}", "pair": pair, "leg": leg, "seed": ord(pair),
                       "candidateSide": side, "variantIds": ids, "templates": ids,
                       "development": "base"}
                score = [0, 0]
                if pair == "a":
                    score[side] = 1
                games.append({**job, "completed": True, "observationVersion": 2,
                              "verifiedHash": "replayed", "findings": [], "score": score,
                              "stats": [{"casualties": 2, "turnovers": 1}] * 2,
                              "skills": [], "rolls": [], "counters": {},
                              "policyDecisions": {"candidate": {}, "frozen": {}},
                              "policyMilliseconds": {"candidate": 1, "frozen": 1}})
                jobs.append(job)
        manifest = {"format": "bb7-policy-study-v1", "jobs": jobs,
                    "inventory": {"teams": [{"id": v, "rosterName": "Bash <team>"} for v in ("v1", "v2")], "skills": ["Block"]},
                    "objectives": {"Bash <team>": {"touchdown": 2, "casualty": 3}},
                    "sourceDigest": "candidate", "baselineDigest": "frozen", "baselineRevision": "old",
                    "revision": "new", "host": "Daily Driver", "smoke": False}
        (root / "games").mkdir()
        (root / "manifest.json").write_text(json.dumps(manifest))
        for g in games:
            (root / "games" / (g["id"] + ".json")).write_text(json.dumps(g))
        return manifest, games

    def test_receiving_balance_and_equal_roster_interval(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            manifest, games = self.fixture(root)
            manifest["blockSize"] = 8
            for job, game in zip(manifest["jobs"], games):
                job["receivingSide"] = game["receivingSide"] = 0
                game["initialReceivingSide"] = 0
            for job in list(manifest["jobs"]):
                extra = copy.deepcopy(job)
                extra.update(id=job["pair"] + "-" + str(job["leg"] + 4), leg=job["leg"] + 4, receivingSide=1)
                game = copy.deepcopy(next(g for g in games if g["id"] == job["id"]))
                game.update(extra, initialReceivingSide=1)
                manifest["jobs"].append(extra)
                games.append(game)
            (root / "manifest.json").write_text(json.dumps(manifest))
            for game in games:
                (root / "games" / (game["id"] + ".json")).write_text(json.dumps(game))
            _, _, blocks, excluded = load_games(root)
            self.assertEqual(excluded, [])
            self.assertEqual([len(b) for b in blocks], [8, 8])
            result = roster_estimates(blocks, {v: {"rosterName": "One roster"} for v in ("v1", "v2")})
            self.assertEqual(result["points"], .75)
            self.assertEqual(result["ci"], [.5, 1.0])
            games[0]["initialReceivingSide"] = 1
            (root / "games" / (games[0]["id"] + ".json")).write_text(json.dumps(games[0]))
            with self.assertRaisesRegex(ValueError, "Engine first receiver differs"):
                load_games(root)

    def test_point_estimate_and_interval_exclude_the_same_incomplete_block(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            self.fixture(root)
            (root / "games/a-3.json").unlink()
            manifest, games, blocks, excluded = load_games(root)
            summary, rows, _, _ = analyse(manifest, games, blocks, excluded)
            self.assertEqual(summary["comparisons"]["overall"]["points"], .5)
            self.assertEqual(summary["comparisons"]["overall"]["ci"], [.5, .5])
            self.assertEqual(summary["included"], 4)
            self.assertEqual(excluded, ["a"])
            self.assertEqual(len(rows), 8)
            with self.assertRaisesRegex(ValueError, "incomplete"):
                build(root, root / "report")

    def test_rejects_schedule_and_telemetry_corruption(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            _, games = self.fixture(root)
            for field, value in (("seed", 0), ("verifiedHash", ""), ("counters", {"skillTriggered": 1})):
                bad = copy.deepcopy(games[0])
                bad[field] = value
                path = root / "games/a-0.json"
                path.write_text(json.dumps(bad))
                with self.assertRaises(ValueError):
                    load_games(root)
                path.write_text(json.dumps(games[0]))

    def test_rebuild_excludes_stale_archives_and_unrelated_files(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            self.fixture(root)
            out = root / "report"
            source = root / "candidate-source.tar.gz"
            source.write_bytes(b"acquisition A")
            with contextlib.redirect_stdout(io.StringIO()):
                build(root, out)
                source.unlink()
                (out / "notes.txt").write_text("keep me")
                build(root, out)
            self.assertFalse((out / source.name).exists())
            self.assertEqual((out / "notes.txt").read_text(), "keep me")
            with zipfile.ZipFile(out / "policy-study-data.zip") as archive:
                self.assertNotIn(source.name, archive.namelist())
                self.assertNotIn("notes.txt", archive.namelist())
                self.assertEqual(json.loads(archive.read("provenance.json"))["source_archives"], {})

    def test_zip_matches_report_and_bash_weights_are_preserved(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            self.fixture(root)
            with contextlib.redirect_stdout(io.StringIO()):
                summary = build(root, root / "report")
            self.assertEqual(summary["totals"]["candidate"]["spp_objective"], 56)
            self.assertEqual(summary["comparisons"]["overall"]["points"], .75)
            with zipfile.ZipFile(root / "report/policy-study-data.zip") as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.read("summary.json"), (root / "report/summary.json").read_bytes())
                self.assertEqual(archive.read("index.html"), (root / "report/index.html").read_bytes())
            page = (root / "report/index.html").read_text()
            self.assertNotIn("__STUDY_DATA__", page)
            self.assertIn("Bash \\u003cteam>", page)
            # Catch syntax failures before publishing a dashboard with empty tables.
            for script in re.findall(r"<script>(.*?)</script>", page, re.S):
                subprocess.run(["node", "--check"], input=script, text=True,
                               capture_output=True, check=True)


if __name__ == "__main__":
    unittest.main()
