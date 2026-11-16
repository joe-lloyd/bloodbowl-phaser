"""Regression checks for interrupted-study reporting (standard library only)."""
import json
import tempfile
import unittest
from pathlib import Path

from analyse import summarize_cohort
from build import build, chart


class ReportTests(unittest.TestCase):
    def row(self, pair, won):
        return dict(pair=pair, roster='Human', template='human', td=int(won), against=int(not won))

    def test_unmatched_games_keep_the_estimate_but_suppress_the_interval(self):
        rows = [self.row('paired', True), self.row('paired', True), self.row('pending', False)]
        result = summarize_cohort('hard', 'hard', rows)
        self.assertEqual(result['games'], 3)
        self.assertAlmostEqual(result['points'], 2/3)
        self.assertEqual(result['paired_seeds'], 1)
        self.assertEqual(result['unmatched_games'], 1)
        self.assertIsNone(result['points_low'])
        self.assertIsNone(result['points_high'])
        self.assertNotIn('class="whisker"', chart([result]))

    def test_complete_pairs_use_the_same_games_for_estimate_and_interval(self):
        result = summarize_cohort('hard', 'hard', [self.row('paired', True), self.row('paired', False)])
        self.assertEqual(result['points'], .5)
        self.assertEqual((result['points_low'], result['points_high']), (.5, .5))
        self.assertEqual(result['unmatched_games'], 0)
        self.assertIn('class="whisker"', chart([result]))

    def test_provisional_report_before_calibration_or_vampires_finish(self):
        keys = ('recorded completed touchdowns casualties commands blocking_findings warnings '
                'skills_total skills_observed skills_league_observed rule_outcomes rules_passed').split()
        study = dict(totals=dict.fromkeys(keys, 0) | dict(requested=7776, templates=81, rosters=30),
            manifest=dict(inventory=dict(teams=[], excluded=[]), revision='frozen', sourceDigest='digest',
                host='test', created='now', ruleset='gw', node='24'),
            datasets={name: [] for name in ('templates cohorts actions rolls rosters skills').split()},
            contexts=[], roll_rows=[])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root/'source.json'
            source.write_text(json.dumps({}))
            build(study, root/'out', {}, {}, (source, source, source), partial=True)
            page = (root/'out/index.html').read_text()
            self.assertIn('PROVISIONAL', page)
            self.assertIn('Calibration results are not available', page)
            self.assertIn('target attainment has not been assessed', page)
            self.assertNotIn('{{', page)


if __name__ == '__main__':
    unittest.main()
