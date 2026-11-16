"""Aggregate authoritative match events; no inferred skill activations."""
import collections
import csv
import json
import random
from pathlib import Path


def clean(game):
    return game['completed'] and not any(f['kind'] != 'rejected-candidate' for f in game['findings'])


def grouped(rows, key):
    groups = collections.defaultdict(list)
    for row in rows:
        groups[key(row)].append(row)
    return groups


def interval(pairs):
    if not pairs:
        return [0, 0]
    rng = random.Random(74119)
    n = len(pairs)
    samples = sorted(sum(rng.choice(pairs) for _ in range(n)) / n for _ in range(2000))
    return [samples[49], samples[1949]]


def summarize(rows):
    n = len(rows)
    total = lambda key: sum(r.get(key, 0) for r in rows)
    mean = lambda key: total(key) / n if n else 0
    wins, losses = sum(r['td'] > r['against'] for r in rows), sum(r['td'] < r['against'] for r in rows)
    return dict(games=n, wins=wins, draws=n-wins-losses, losses=losses,
                win_rate=wins/n if n else 0, points=(wins+(n-wins-losses)/2)/n if n else 0,
                td_per_game=mean('td'), conceded_per_game=mean('against'), cas_per_game=mean('casualties'),
                blocks_per_game=mean('blocks'), completions_per_game=mean('completions'),
                turnovers_per_game=mean('turnovers'), turnover_rate=total('turnovers')/max(1,total('turns')),
                dodges_per_game=mean('dodges'), failed_dodges_per_game=mean('failedDodges'),
                rushes_per_game=mean('rushes'), failed_rushes_per_game=mean('failedRushes'),
                spp_per_game=mean('standard_spp'), target_spp=mean('target_spp'),
                blocks_declared=mean('block'), blitzes_declared=mean('blitz'), passes_declared=mean('pass'),
                handoffs_declared=mean('handoff'), fouls_declared=mean('foul'))


def write_csv(out, name, rows):
    if not rows:
        return
    keys = list(dict.fromkeys(k for row in rows for k in row))
    with (out / (name + '.csv')).open('w', newline='') as stream:
        writer = csv.DictWriter(stream, keys)
        writer.writeheader()
        writer.writerows(rows)


def collect(directories, rules_file):
    manifests = [json.loads((directory / 'manifest.json').read_text()) for directory in directories]
    if len({m['sourceDigest'] for m in manifests}) != 1:
        raise ValueError('Runs used different engine or study sources')
    manifest = manifests[0]
    templates = {t['id']: t for t in manifest['inventory']['teams']}
    requested = [job for m in manifests for job in m['jobs']]
    games = [json.loads(file.read_text()) for directory in directories for file in sorted((directory/'games').glob('*.json'))]
    if any(g.get('observationVersion') != 2 for g in games):
        raise ValueError('Replay and verify legacy observations before building the report')
    for game in games:
        if sum(s['count'] for s in game['skills']) != game['counters'].get('skillTriggered',0):
            raise ValueError('Skill event reconciliation failed: '+game['id'])
        if sum(r['attempts'] for r in game['rolls']) != game['counters'].get('diceRoll',0):
            raise ValueError('Dice event reconciliation failed: '+game['id'])
    if len({g['id'] for g in games}) != len(games):
        raise ValueError('Duplicate game IDs')
    expected = {j['id']: j for j in requested}
    for game in games:
        job = expected[game['id']]
        if any(game[k] != job[k] for k in ('seed','cohort','templates','coaches','pair')):
            raise ValueError('Game does not match manifest: ' + game['id'])
    team_games, contexts, roll_rows, match_rows, findings = [], [], [], [], []
    actions = collections.defaultdict(lambda: [0, 0])
    for game in games:
        valid = clean(game)
        match_rows.append(dict(id=game['id'], cohort=game['cohort'], seed=game['seed'], pair=game['pair'],
             home=game['templates'][0], away=game['templates'][1], home_coach=game['coaches'][0], away_coach=game['coaches'][1],
             home_td=game['score'][0], away_td=game['score'][1], home_cas=game['stats'][0]['casualties'],
             away_cas=game['stats'][1]['casualties'], completed=game['completed'], valid=valid,
             findings=len(game['findings']), commands=game['commands'], ms=game['ms']))
        for finding in game['findings']:
            findings.append(dict(game=game['id'], cohort=game['cohort'], **finding))
        for side in (0,1):
            template = templates[game['templates'][side]]
            standard = template['standard']
            values = standard['values']
            td = game['score'][side]
            stats = game['stats'][side]
            spp = td*values['touchdown'] + (stats['casualties']*values['casualty'] if values['casualty']>=values['touchdown'] else 0)
            team_games.append(dict(game=game['id'], cohort=game['cohort'], pair=game['pair'], seed=game['seed'], side=side,
                template=template['id'], name=template['name'], build=template['buildName'], roster=template['rosterName'],
                opponent=game['templates'][1-side], coach=game['coaches'][side], opponent_coach=game['coaches'][1-side],
                valid=valid, td=td, against=game['score'][1-side], standard_spp=spp, target_spp=standard['spp'],
                rerolls=template['rerolls'], team_value=template['teamValue'],
                **{k:v for k,v in stats.items() if k!='actions'}, **stats['actions']))
        for observation in game['skills']:
            side=observation['side']
            contexts.append(dict(game=game['id'],cohort=game['cohort'],seed=game['seed'],
                template=game['templates'][side],opponent=game['templates'][1-side],coach=game['coaches'][side],
                valid=valid,**observation))
        for roll in game['rolls']:
            side=roll['side']
            roll_rows.append(dict(game=game['id'],cohort=game['cohort'],seed=game['seed'],template=game['templates'][side],
                coach=game['coaches'][side],valid=valid,**roll))
        if valid:
            for action, offered in game['offered'].items(): actions[(game['cohort'],action)][0]+=offered
            for action, selected in game['selected'].items(): actions[(game['cohort'],action)][1]+=selected
    valid_team_games=[r for r in team_games if r['valid']]
    template_rows=[dict(cohort=k[0],coach=k[1],template=k[2],name=templates[k[2]]['name'],roster=templates[k[2]]['rosterName'],
        **summarize(rows)) for k,rows in sorted(grouped(valid_team_games,lambda r:(r['cohort'],r['coach'],r['template'])).items())]
    race_rows=[dict(cohort=k[0],coach=k[1],roster=k[2],**summarize(rows))
        for k,rows in sorted(grouped(valid_team_games,lambda r:(r['cohort'],r['coach'],r['roster'])).items())]
    cohorts=[]
    for (cohort,coach), rows in sorted(grouped(valid_team_games,lambda r:(r['cohort'],r['coach'])).items()):
        pair_values=[sum(1 if r['td']>r['against'] else .5 if r['td']==r['against'] else 0 for r in pair_rows)/len(pair_rows)
            for pair_rows in grouped(rows,lambda r:r['pair']).values() if len(pair_rows)==2]
        ci=interval(pair_values) if cohort!='league' else [None,None]
        race_macro=sum(summarize(group)['points'] for group in grouped(rows,lambda r:r['roster']).values())/len(grouped(rows,lambda r:r['roster']))
        template_macro=sum(summarize(group)['points'] for group in grouped(rows,lambda r:r['template']).values())/len(grouped(rows,lambda r:r['template']))
        cohorts.append(dict(cohort=cohort,coach=coach,race_macro_points=race_macro,template_macro_points=template_macro,**summarize(rows),points_low=ci[0],points_high=ci[1],paired_seeds=len(pair_values)))
    rules=json.loads(rules_file.read_text())
    skill_rows=[]
    for skill in manifest['inventory']['skills']:
        observations=[r for r in contexts if r['skill']==skill and r['valid']]
        league=[r for r in observations if r['cohort']=='league']
        holders={t['id']:sum(any(s['type']==skill for s in p['skills']) for p in t['players']) for t in templates.values()}
        exposure=[r for r in valid_team_games if holders[r['template']]]
        probes=[o for o in rules['outcomes'] if o['skill']==skill]
        skill_rows.append(dict(skill=skill,templates_with_skill=sum(v>0 for v in holders.values()),
            roster_team_games=len(exposure),holder_appearances=sum(holders[r['template']] for r in exposure),
            triggers=sum(r['count'] for r in observations),league_triggers=sum(r['count'] for r in league),
            matches_with_trigger=len({r['game'] for r in observations}),
            rule_outcomes=len(probes),passed_outcomes=sum(o['passed'] for o in probes),
            status='match trigger observed' if observations else 'no trigger event; scenario verified' if probes else 'outside match mechanics'))
    skill_by_coach=[]
    observed_groups=grouped([r for r in contexts if r['valid']],lambda r:(r['cohort'],r['coach'],r['skill']))
    for cohort,coach in sorted({(r['cohort'],r['coach']) for r in valid_team_games}):
        appearances=[r for r in valid_team_games if r['cohort']==cohort and r['coach']==coach]
        for skill in manifest['inventory']['skills']:
            observed=observed_groups.get((cohort,coach,skill),[])
            eligible={t['id'] for t in templates.values() if any(any(s['type']==skill for s in p['skills']) for p in t['players'])}
            skill_by_coach.append(dict(cohort=cohort,coach=coach,skill=skill,roster_team_games=sum(r['template'] in eligible for r in appearances),triggers=sum(r['count'] for r in observed),matches=len({r['game'] for r in observed})))
    other_rule_effects=[dict(rule=k[2],cohort=k[0],coach=k[1],triggers=sum(r['count'] for r in rows),matches=len({r['game'] for r in rows})) for k,rows in sorted(observed_groups.items()) if k[2] not in manifest['inventory']['skills']]
    effects=[]
    for key,rows in grouped([r for r in contexts if r['valid']],lambda r:(r['cohort'],r['skill'],r['action'],r['effect'])).items():
        effects.append(dict(cohort=key[0],skill=key[1],action=key[2],effect=key[3],triggers=sum(r['count'] for r in rows),
            matches=len({r['game'] for r in rows})))
    roll_summary=[]
    for key,rows in grouped([r for r in roll_rows if r['valid']],lambda r:(r['cohort'],r['coach'],r['roll'],r['action'],r['carrying'],r['adjacentHelpers']>0,r['adjacentThralls']>0)).items():
        roll_summary.append(dict(zip(('cohort','coach','roll','action','carrying','helper_adjacent','thrall_adjacent'),key))|
             {k:sum(r[k] for r in rows) for k in ('attempts','failures','turnoversInCommand')})
    action_rows=[dict(cohort=k[0],action=k[1],decision_points_offered=v[0],selections=v[1]) for k,v in sorted(actions.items())]
    special=[]
    for rule in manifest['inventory']['specialRules']:
        ids={t['id'] for t in templates.values() if rule in t['specialRules']}
        exposure=[r for r in valid_team_games if r['template'] in ids]
        triggered=sum(r['count'] for r in contexts if r['valid'] and r['skill']==rule)
        note='Roster/allegiance/inducement or post-match rule; exposure is not activation evidence.'
        if rule=="Brawlin' Brutes": note='Scoring standard evaluated as 2 × TD + 3 × SPP-eligible CAS; no additive SkillTriggered event.'
        if rule=='Team Captain': note='Template builder does not appoint a captain; test captain choice separately before claiming Pro usage.'
        if rule=='Swarming': note='Automatic setup effect; no SkillTriggered event. Verify placements and engine scenarios separately.'
        special.append(dict(rule=rule,templates=len(ids),team_games=len(exposure),named_trigger_events=triggered,note=note))
    matchups=[dict(template=k[0],opponent=k[1],**summarize(rows)) for k,rows in sorted(grouped([r for r in valid_team_games if r['cohort']=='league'],lambda r:(r['template'],r['opponent'])).items())]
    event_counts=collections.Counter()
    for game in games:
        for name,count in game['counters'].items():event_counts[(game['cohort'],name)]+=count
    event_rows=[dict(cohort=k[0],event=k[1],count=count) for k,count in sorted(event_counts.items())]
    datasets={'skill-by-coach':skill_by_coach,'other-rule-effects':other_rule_effects,'matchups':matchups,'events':event_rows,'cohorts':cohorts,'templates':template_rows,'rosters':race_rows,'skills':skill_rows,'skill-effects':effects,
        'rolls':roll_summary,'actions':action_rows,'special-rules':special,'games':match_rows,'team-games':team_games,
        'findings':findings,'rules':[dict(skill=o['skill'],config=o['config'],outcome=o['outcome'],passed=o['passed'],
            seed=o.get('seed'),commands=o.get('commands'),error=o.get('error','')) for o in rules['outcomes']]}
    totals=dict(requested=len(requested),recorded=len(games),valid_games=sum(clean(g) for g in games),
        completed=sum(g['completed'] for g in games),blocking_findings=sum(f['kind']!='rejected-candidate' for f in findings),
        warnings=sum(f['kind']=='rejected-candidate' for f in findings),templates=len(templates),
        rosters=len({t['rosterName'] for t in templates.values()}),commands=sum(g['commands'] for g in games),
        touchdowns=sum(sum(g['score']) for g in games),casualties=sum(sum(s['casualties'] for s in g['stats']) for g in games),
        skill_triggers=sum(r['count'] for r in contexts),skills_observed=sum(r['triggers']>0 for r in skill_rows),
        skills_league_observed=sum(r['league_triggers']>0 for r in skill_rows),skills_total=len(skill_rows),
        rule_outcomes=len(rules['outcomes']),rules_passed=sum(o['passed'] for o in rules['outcomes']))
    return dict(manifest=manifest,totals=totals,datasets=datasets,contexts=contexts,rules=rules,roll_rows=roll_rows)
