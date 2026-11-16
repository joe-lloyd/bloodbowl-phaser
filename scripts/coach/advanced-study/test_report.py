"""Report integrity regressions independent of private result artifacts."""
import json
import contextlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from report import analyse, build


class ReportTests(unittest.TestCase):
    def fixture(self, root):
        (root/'games').mkdir()
        (root/'probes').mkdir()
        variants=[dict(id='focused',template='t',arm='focused',replicate=0,allocations=[dict(player=0,skill='Horns',access='primary')],teamValue=620000,sppSpent=6),
                  dict(id='base',template='t',arm='base',replicate=-1,allocations=[],teamValue=600000,sppSpent=0)]
        jobs=[]
        for index in range(3):
            sides=['focused','base'] if index!=1 else ['base','focused']
            job=dict(id=str(index),pair='pair' if index<2 else 'unmatched',seed=1 if index<2 else 2,templates=['t','t'],variantIds=sides,comparison='focused-vs-base')
            jobs.append(job)
            side=sides.index('focused')
            score=[0,0];score[side if index<2 else 1-side]=1
            stats=dict(casualties=0,turnovers=1,turns=12)
            game=dict(**job,commands=3,ms=1,completed=True,verifiedHash='verified',observationVersion=2,score=score,stats=[stats,stats],findings=[],
                counters=dict(skillTriggered=1),skills=[dict(side=side,playerId=f'team{side+1}-player-1',skill='Horns',count=1)],rolls=[])
            (root/'games'/f'{index}.json').write_text(json.dumps(game))
        manifest=dict(jobs=jobs,variants=variants,scenarios=[],definitions={'Horns':dict(kind='skill',category='Mutation',description='Blitz strength')},
            inventory=dict(teams=[dict(id='t',name='Test',rosterName='Test roster',players=[dict(position='Test player',skills=[])])]),revision='frozen',sourceDigest='digest',host='Daily Driver')
        (root/'manifest.json').write_text(json.dumps(manifest))
        (root/'probes/probes.json').write_text(json.dumps(dict(rows=[],selections=[],seeds=0)))
        return dict(skills=[dict(skill='Horns',triggers=0,templates_with_skill=0)],totals=dict(completed=1))

    def test_unmatched_valid_game_keeps_estimate_and_suppresses_interval(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);baseline=self.fixture(root)
            study=analyse(root,baseline)
            row=study['comparisons'][0]
            self.assertAlmostEqual(row['points'],2/3)
            self.assertEqual(row['unmatched_games'],1)
            self.assertIsNone(row['points_low'])
            self.assertIsNone(row['points_high'])
            self.assertEqual(study['skills'][0]['added_player_events'],3)

    def test_missing_games_require_provisional_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);baseline=self.fixture(root)
            (root/'games/2.json').unlink()
            with self.assertRaisesRegex(ValueError,'Missing scheduled'):
                analyse(root,baseline)
            self.assertEqual(analyse(root,baseline,partial=True)['totals']['recorded'],2)

    def test_skill_counts_must_reconcile(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);baseline=self.fixture(root)
            file=root/'games/0.json';game=json.loads(file.read_text())
            game['counters']['skillTriggered']=2;file.write_text(json.dumps(game))
            with self.assertRaisesRegex(ValueError,'Skill reconciliation'):
                analyse(root,baseline)

    def test_build_publishes_csvs_and_safe_embedded_data_without_recursive_zip(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);baseline=self.fixture(root)
            manifest=root/'manifest.json';data=json.loads(manifest.read_text())
            injected="</script><script>alert('injected')</script>"
            data['definitions']['Horns']['description']=injected
            manifest.write_text(json.dumps(data))
            baseline_file=root/'baseline.json';baseline_file.write_text(json.dumps(baseline))
            out=root/'dashboard'
            with contextlib.redirect_stdout(io.StringIO()):
                build(root,baseline_file,out)
            page=(out/'index.html').read_text()
            self.assertNotIn('{{DATA}}',page)
            self.assertNotIn(injected,page)
            self.assertIn(injected.replace('<',r'\u003c'),page)
            self.assertTrue((out/'team-games.csv').is_file())
            self.assertEqual(json.loads((out/'summary.json').read_text())['totals']['recorded'],3)
            with zipfile.ZipFile(out/'study-data.zip') as archive:
                self.assertIsNone(archive.testzip())
                self.assertIn('index.html',archive.namelist())
                self.assertIn('team-games.csv',archive.namelist())
                self.assertNotIn('study-data.zip',archive.namelist())


if __name__=='__main__':
    unittest.main()
