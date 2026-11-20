"""Regression checks for interrupted-study reporting (standard library only)."""
import json
import tempfile
import unittest
from pathlib import Path

from analyse import collect, summarize_cohort
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
            self.assertIn('no inducements, no persistence', page)
            self.assertIn('--out sim-results/catalogue-study --no-inducements\n', page)

    def test_refuses_to_merge_runs_with_and_without_petty_cash(self):
        with tempfile.TemporaryDirectory() as directory:
            runs = []
            for name, petty in (('calibration', True), ('hard', False)):
                run = Path(directory)/name
                run.mkdir()
                (run/'manifest.json').write_text(json.dumps(dict(sourceDigest='same', pettyCash=petty, jobs=[])))
                runs.append(run)
            with self.assertRaisesRegex(ValueError, 'with and without petty cash'):
                collect(runs, Path(directory)/'rules.json')

    def test_refuses_a_result_played_with_the_other_petty_cash_setting(self):
        job = dict(id='g1', seed=1, cohort='calibration', templates=['a', 'b'], coaches=['planner', 'heuristic'], pair='p1')
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)/'calibration'
            (run/'games').mkdir(parents=True)
            (run/'manifest.json').write_text(json.dumps(dict(sourceDigest='same', pettyCash=True, inventory=dict(teams=[]), jobs=[job])))
            (run/'games'/'g1.json').write_text(json.dumps(job | dict(inducements=False, observationVersion=2, skills=[], rolls=[], counters={})))
            with self.assertRaisesRegex(ValueError, 'Game does not match manifest: g1'):
                collect([run], Path(directory)/'rules.json')


if __name__ == '__main__':
    unittest.main()
