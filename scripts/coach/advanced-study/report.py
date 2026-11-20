"""Readable offline dashboard and raw tables; Python standard library only."""
import argparse
import collections
import csv
import json
import random
import shutil
import zipfile
from pathlib import Path


def csv_file(out, name, rows):
    keys = list(dict.fromkeys(key for row in rows for key in row))
    with (out/(name+'.csv')).open('w', newline='') as stream:
        writer = csv.DictWriter(stream, keys)
        if keys:
            writer.writeheader()
            writer.writerows(rows)


def confidence(values):
    if not values:
        return [None, None]
    rng = random.Random(61829)
    samples = sorted(sum(rng.choice(values) for _ in values)/len(values) for _ in range(2000))
    return [samples[49], samples[1949]]


THROWING = {'Lethal Flight', 'Bullseye', 'Strong Arm', 'Throw Team-mate', 'Right Stuff', 'Swoop', 'Kick Team-Mate', 'Always Hungry'}
FOULING = {'Dirty Player', 'Lone Fouler', 'Put the Boot In', 'Quick Foul', 'Sneaky Git', 'Pile Driver', 'Saboteur', 'Violent Innovator', 'Secret Weapon'}
SPECIAL = {'Hypnotic Gaze', 'Stab', 'Projectile Vomit', 'Breathe Fire', 'Bombardier', 'Chainsaw', 'Ball & Chain', 'Chomp'}
GATES = {'Really Stupid', 'Bone Head', 'Animal Savagery', 'Unchannelled Fury', 'Take Root', 'Loner'}
PASSIVE = {'Defensive', 'Jump Up', 'Sprint', 'Frenzy', 'Guard', 'Break Tackle'}
OVERRIDES = {
 'Lethal Flight': ('Throwing into a useful collision lane when the landing, possession and injury trade-off are acceptable.', 'A safe scoring throw or ball carrier should not be sacrificed simply to chase an injury.', 'throwingAndLanding'),
 'Big Hand': ('Recovering a loose ball in traffic or adverse conditions.', 'An uncontested pickup may offer little marginal benefit; check the actual roll target.', 'mutationBallHandling'),
 'Extra Arms': ('The designated retriever or receiver handles the ball.', 'Putting the skill on a player who never touches the ball wastes the opportunity.', 'mutationBallHandling'),
 'Two Heads': ('An agile carrier or receiver needs to leave marking.', 'A route with no dodge gains no benefit; do not add a dodge just to trigger the skill.', 'mutationMovement'),
 'Very Long Legs': ('A leap or interception is useful for the current board.', 'An ordinary safe walking route usually avoids the special action cost.', 'jumpAndInterception'),
 'Tentacles': ('A strong marker can restrain an opponent who needs to move.', 'Chasing an immobile low-value target may abandon a more important lane.', 'markingAndDenial'),
 'Prehensile Tail': ('Mark an opponent whose useful escape requires a dodge.', 'A player who can stand still and contribute may not care about the tail.', 'markingAndDenial'),
 'Disturbing Presence': ('Coverage overlaps the opponent’s intended throwing or catching lane.', 'Spreading away from the ball merely to create coverage may weaken the defense.', 'passingDefense'),
 'Claws': ('A useful block targets armour the rule can materially change.', 'Low-armour targets or a worse block may waste the advantage.', 'blockTargeting'),
 'Horns': ('The Blitz strength bonus improves the block or frees a route.', 'A normal Block does not get the Blitz-only bonus.', 'blockTargeting'),
 'Multiple Block': ('Two useful adjacent targets justify the special blocking choice.', 'A key carrier blitz or poor dice against both targets can make the ordinary action better.', 'multipleBlock'),
 'Bloodlust': ('Plan the Vampire endpoint together with an available, legal Thrall bite.', 'Avoid leaving a carrier without food or using a valuable carrier Thrall as fodder.', 'vampireFeeding'),
 'Hypnotic Gaze': ('Removing a key marker opens a valuable follow-up action.', 'A successful gaze with no useful follow-up can still waste an activation.', 'gazeAndFollowUp'),
 'Leader': ('Keep the source available while the reroll can matter.', 'Exposing the source for a low-value exchange can lose more than the action gains.', 'resourceAndSetup'),
 'Kick': ('Kick placement supports the intended defensive pressure.', 'Placement alone is insufficient if the team cannot exploit the receiving position.', 'kickoffPlans'),
 'Saboteur': ('A legal Secret Weapon carrier can make its removal matter.', 'Do not grant it to a player without the prerequisite or confuse a forced scenario with optimal weapon use.', 'foulAndWeapons'),
 'Decay': ('Assess injury and roster-lifecycle consequences in the applicable format.', 'The Sevens match study cannot estimate a casualty-roll mechanic it does not run.', 'lifecycleEvaluation'),
 'Insignificant': ('Validate the draft list and setup population where applicable.', 'It is a roster constraint, not a selectable match action.', 'draftValidation'),
}


def tactical_plan(skill, definition, configs):
    if skill in OVERRIDES:
        return OVERRIDES[skill]
    if skill in THROWING:
        return ('A throw or kick of a team-mate offers a useful scoring, positioning or collision line.', 'Use a normal ball plan when landing, turnover or friendly-injury risk outweighs the gain.', 'throwingAndLanding')
    if skill in FOULING:
        return ('A valuable vulnerable target justifies the foul, removal or weapon interaction.', 'Price ejection, lost activation and possession risk before taking a low-value hit.', 'foulAndWeapons')
    if skill in SPECIAL:
        return ('A legal special action improves the current target or opens the next action.', 'Compare with a normal block, movement or possession plan; more activations are not automatically better.', 'specialAttacks')
    if skill in GATES:
        return ('Choose support, action type and activation order before committing the player.', 'Do not risk a crucial carrier or activation without pricing the actual failure consequence.', 'activationReliability')
    category = definition['category']
    modules = {'Mutation':'mutationCapabilities', 'Passing':'passingAndReceiving', 'Devious':'deviousTactics', 'Strength':'blockAndMarking', 'Agility':'movementAndReactions', 'General':'coreTactics'}
    return ((configs[0]['name'] if configs else definition['description'])+'. Treat this as a tactical hypothesis to validate.',
            'Test the same board when the ability is irrelevant and when choosing it sacrifices possession or a better action.', modules.get(category, 'traitPolicies'))


def analyse(root, baseline, partial=False):
    manifest = json.loads((root/'manifest.json').read_text())
    variants = {v['id']: v for v in manifest['variants']}
    templates = {t['id']: t for t in manifest['inventory']['teams']}
    scheduled = {j['id']:j for j in manifest['jobs']}
    files = sorted((root/'games').glob('*.json'))
    games = [json.loads(file.read_text()) for file in files]
    if len({g['id'] for g in games}) != len(games): raise ValueError('Duplicate game IDs')
    if any(g['id'] not in scheduled for g in games): raise ValueError('Unscheduled results')
    if not partial and len(games)!=len(scheduled): raise ValueError('Missing scheduled games')
    for game in games:
        job=scheduled[game['id']]
        if any(game.get(k)!=job.get(k) for k in ('pair','seed','templates','variantIds','comparison','inducements')): raise ValueError('Schedule mismatch: '+game['id'])
        if not game.get('verifiedHash') or game.get('observationVersion')!=2: raise ValueError('Unverified game: '+game['id'])
        if sum(r['count'] for r in game['skills'])!=game['counters'].get('skillTriggered',0): raise ValueError('Skill reconciliation: '+game['id'])
        if sum(r['attempts'] for r in game['rolls'])!=game['counters'].get('diceRoll',0): raise ValueError('Roll reconciliation: '+game['id'])
    probes_file=root/'probes/probes.json'
    if not partial and not probes_file.exists(): raise ValueError('Missing probe results')
    probes=json.loads(probes_file.read_text()) if probes_file.exists() else dict(rows=[],selections=[],seeds=0)
    expected_probes=sum(len(e['configs']) for e in manifest['scenarios'])*probes['seeds']
    if not partial and len(probes['rows'])!=expected_probes: raise ValueError('Missing probe rows')
    skill_contexts=[];roll_contexts=[];event_rows=[];game_rows=[]
    team_games=[]; trigger=collections.Counter(); added_trigger=collections.Counter(); exposure=collections.Counter(); findings=[]
    for game in games:
        valid=game['completed'] and not any(f['kind']!='rejected-candidate' for f in game['findings'])
        findings.extend(dict(game=game['id'],**f) for f in game['findings'])
        game_rows.append(dict(game=game['id'],comparison=game['comparison'],pair=game['pair'],seed=game['seed'],completed=game['completed'],valid=valid,commands=game['commands'],milliseconds=game['ms'],verified_hash=game['verifiedHash'],home_variant=game['variantIds'][0],away_variant=game['variantIds'][1],home_td=game['score'][0],away_td=game['score'][1]))
        skill_contexts.extend(dict(game=game['id'],comparison=game['comparison'],seed=game['seed'],valid=valid,**r) for r in game['skills'])
        roll_contexts.extend(dict(game=game['id'],comparison=game['comparison'],seed=game['seed'],valid=valid,**r) for r in game['rolls'])
        event_rows.extend(dict(game=game['id'],comparison=game['comparison'],valid=valid,event=k,count=v) for k,v in game['counters'].items())
        for side,variant_id in enumerate(game['variantIds']):
            v=variants[variant_id]; t=templates[v['template']]
            stats=game['stats'][side]; score=game['score'][side]; against=game['score'][1-side]
            team_games.append(dict(game=game['id'],pair=game['pair'],seed=game['seed'],comparison=game['comparison'],side=side,
                variant=variant_id,template=v['template'],roster=t['rosterName'],arm=v['arm'],replicate=v['replicate'],valid=valid,
                td=score,against=against,points=1 if score>against else .5 if score==against else 0,
                casualties=stats['casualties'],turnovers=stats['turnovers'],turns=stats['turns'],team_value=v['teamValue'],spp_spent=v['sppSpent']) | {k:v for k,v in stats.items() if k!='actions'} | {f'action_{k}':v for k,v in stats.get('actions',{}).items()})
            if valid:
                owned={s['type'] for p in t['players'] for s in p['skills']}|{a['skill'] for a in v['allocations']}
                exposure.update(owned)
        if valid:
            for obs in game['skills']:
                trigger[obs['skill']]+=obs['count']
                v=variants[game['variantIds'][obs['side']]]
                if any(a['skill']==obs['skill'] and obs['playerId']==f"team{obs['side']+1}-player-{a['player']+1}" for a in v['allocations']): added_trigger[obs['skill']]+=obs['count']
    comparisons=[]
    for comparison in sorted({j['comparison'] for j in manifest['jobs']}):
        arm=comparison.split('-vs-')[0]
        rows=[r for r in team_games if r['valid'] and r['comparison']==comparison and r['arm']==arm]
        pairs=collections.defaultdict(list)
        for row in rows:pairs[row['pair']].append(row['points'])
        unmatched=sum(len(v) for v in pairs.values() if len(v)!=2)
        intervals=confidence([sum(v)/2 for v in pairs.values() if len(v)==2]) if not unmatched else [None,None]
        n=len(rows)
        comparisons.append(dict(comparison=comparison,arm=arm,games=n,wins=sum(r['td']>r['against'] for r in rows),draws=sum(r['td']==r['against'] for r in rows),losses=sum(r['td']<r['against'] for r in rows),
            points=sum(r['points'] for r in rows)/n if n else None,points_low=intervals[0],points_high=intervals[1],unmatched_games=unmatched,
            td_per_game=sum(r['td'] for r in rows)/n if n else None,cas_per_game=sum(r['casualties'] for r in rows)/n if n else None,
            turnover_rate=sum(r['turnovers'] for r in rows)/max(1,sum(r['turns'] for r in rows))))
    grouped_probes=collections.defaultdict(list)
    for row in probes['rows']:grouped_probes[row['config']].append(row)
    probe_summary=[]
    for entry in manifest['scenarios']:
        for config in entry['configs']:
            rows=grouped_probes[config['id']]; matched=[r for r in rows if r['comparable']]
            probe_summary.append(dict(skill=entry['skill'],config=config['id'],context=config['name'],description=config['description'],seeds=len(rows),comparable=len(matched),
                changed=sum(r['endpointChanged'] for r in matched),
                required_capability=sum(not r.get('error') and r['withSkill']['rejected']==0 and r['withoutSkill']['rejected']>0 for r in rows),
                errors=sum('error' in r for r in rows),script_refusals=sum(not r.get('error') and r['withSkill']['rejected']>0 for r in rows),
                announced_effects=sum(r.get('withSkill',{}).get('triggers',0) for r in rows)))
    baseline_skills={r['skill']:r for r in baseline['skills']}
    skills=[]
    for skill,definition in manifest['definitions'].items():
        b=baseline_skills[skill]
        configs=next((e['configs'] for e in manifest['scenarios'] if e['skill']==skill),[])
        contexts=[r for r in probe_summary if r['skill']==skill]
        use,avoid,module=tactical_plan(skill,definition,configs)
        if skill in ('Decay','Insignificant'):status='Outside match actions'
        elif skill in THROWING|FOULING|SPECIAL or definition['category']=='Passing':status='Tactical action coverage'
        elif skill in PASSIVE and not b['triggers']:status='Passive measurement'
        elif not b['templates_with_skill']:status='New advanced exposure' if definition['kind']=='skill' else 'Special-player fixture'
        elif b['triggers']<100:status='Sparse evidence'
        else:status='Context validation'
        added=[v for v in variants.values() if any(a['skill']==skill for a in v['allocations'])]
        skills.append(dict(skill=skill,category=definition['category'] if definition['kind']=='skill' else 'Trait',kind=definition['kind'],description=definition['description'],
            status=status,module=module,use_when=use,avoid_when=avoid,
            baseline_events=b['triggers'],baseline_templates=b['templates_with_skill'],advanced_variants=len(added),advanced_team_games=exposure[skill],advanced_events=trigger[skill],added_player_events=added_trigger[skill],
            controlled_pairs=sum(r['comparable'] for r in contexts),changed_endpoints=sum(r['changed'] for r in contexts),capability_losses=sum(r['required_capability'] for r in contexts),
            contexts='; '.join(c['name'] for c in configs),
            next_test=('Use native special-player fixtures; traits cannot be rolled as advancements.' if definition['kind']=='trait' and not b['templates_with_skill'] else
                       'Add beneficial, neutral and harmful boards; compare chosen targets and downstream possession, injury and scoring outcomes on sealed seeds.')))
    builds=[]
    for v in variants.values():
        if v['arm']=='base':continue
        t=templates[v['template']]
        builds.append(dict(id=v['id'],team=t['name'],roster=t['rosterName'],arm=v['arm'],replicate=v['replicate'],team_value=v['teamValue'],spp_spent=v['sppSpent'],
            upgrades=[dict(player=a['player']+1,position=t['players'][a['player']]['position'],skill=a['skill'],access=a['access']) for a in v['allocations']]))
    totals=dict(scheduled=len(scheduled),recorded=len(games),completed=sum(g['completed'] for g in games),valid=sum(r['valid'] for r in team_games)//2,
        verified=len(games),blocking_findings=sum(f['kind']!='rejected-candidate' for f in findings),warnings=sum(f['kind']=='rejected-candidate' for f in findings),
        touchdowns=sum(sum(g['score']) for g in games),casualties=sum(sum(s['casualties'] for s in g['stats']) for g in games),
        skill_events=sum(trigger.values()),observed_skills=sum(trigger[s]>0 for s in manifest['definitions']),advanced_variants=len(builds),
        learnable_skills=sum(d['kind']=='skill' for d in manifest['definitions'].values()),assigned_skills=len({a['skill'] for v in variants.values() for a in v['allocations']}),
        probe_pairs=len(probes['rows']),probe_errors=sum('error' in r for r in probes['rows']),comparable_probes=sum(r['comparable'] for r in probes['rows']),probe_configs=len(probe_summary),
        baseline_games=baseline['totals']['completed'])
    collision=next((r for r in probes['rows'] if r['skill']=='Lethal Flight' and r.get('comparable') and
        any(a['status']=='Injured' and b['status']=='KO' for a,b in zip(r['withSkill']['endpoint'][1]['players'],r['withoutSkill']['endpoint'][1]['players']))),None)
    lethal_example=('In the scripted Lethal Flight collision test, seed '+str(collision['seed'])+' left an opponent Injured with the skill and KO without it. This shows a contextual mechanical effect; it does not measure the value of choosing that throw in a match.') if collision else ''
    return dict(totals=totals,comparisons=comparisons,skills=skills,builds=builds,probes=probe_summary,selections=probes['selections'],lethal_example=lethal_example,
        team_games=team_games,skill_contexts=skill_contexts,roll_contexts=roll_contexts,events=event_rows,games=game_rows,findings=findings,baseline=baseline,source=dict(revision=manifest['revision'],digest=manifest['sourceDigest'],host=manifest['host']),partial=partial)


def build(root, baseline_file, out, partial=False):
    baseline=json.loads(baseline_file.read_text())
    study=analyse(root,baseline,partial)
    out.mkdir(parents=True,exist_ok=True)
    for name,key in [('skill-plan','skills'),('comparisons','comparisons'),('team-games','team_games'),('context-probes','probes'),('opening-diagnostics','selections'),('findings','findings'),('skill-contexts','skill_contexts'),('roll-contexts','roll_contexts'),('events','events'),('games','games')]:csv_file(out,name,study[key])
    flat_builds=[{k:v for k,v in b.items() if k!='upgrades'}|dict(player=a['player'],position=a['position'],skill=a['skill'],access=a['access']) for b in study['builds'] for a in b['upgrades']]
    csv_file(out,'advanced-builds',flat_builds)
    (out/'summary.json').write_text(json.dumps({k:v for k,v in study.items() if k not in ('team_games','baseline','builds','skill_contexts','roll_contexts','events','games')},indent=2))
    shutil.copy2(root/'manifest.json',out/'acquisition-manifest.json')
    shutil.copy2(baseline_file,out/'baseline-summary.json')
    if (baseline_file.parent/'study-data.zip').exists():shutil.copy2(baseline_file.parent/'study-data.zip',out/'baseline-data.zip')
    (out/'provenance.json').write_text(json.dumps(dict(run_directory=str(root.resolve()),baseline_summary=str(baseline_file.resolve()),
        full_traces=str((root/'traces').resolve()),traces_in_archive=False,host=study['source']['host'],source=study['source']),indent=2))
    if (root/'probes/probes.json').exists():shutil.copy2(root/'probes/probes.json',out/'raw-context-probes.json')
    if (root/'probes/probe-source.ts').exists():shutil.copy2(root/'probes/probe-source.ts',out/'probe-source.ts')
    if (root/'acquisition-source.tar.gz').exists():shutil.copy2(root/'acquisition-source.tar.gz',out/'acquisition-source.tar.gz')
    payload={k:v for k,v in study.items() if k not in ('team_games','findings','skill_contexts','roll_contexts','events','games')}
    data=json.dumps(payload,separators=(',',':'),ensure_ascii=False).replace('<',chr(92)+'u003c')
    page=(Path(__file__).parent/'dashboard.html').read_text().replace('{{DATA}}',data)
    (out/'index.html').write_text(page)
    roadmap=['# Skill coverage roadmap','', 'These are proposed AI experiments. Controlled scripts are mechanical evidence; skill usage and endpoint changes are not win-value estimates.','']
    for s in study['skills']:
        roadmap.extend(['## '+s['skill'],'',f"- Coverage: {s['status']}; module: {s['module']}.",'- Useful hypothesis: '+s['use_when'],'- Counterexample: '+s['avoid_when'],'- Next validation: '+s['next_test'],''])
    (out/'skill-plan.md').write_text('\n'.join(roadmap))
    with zipfile.ZipFile(out/'study-data.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(out.iterdir()):
            if file.is_file() and (file.suffix in ('.csv','.json','.html','.md') or file.name in ('baseline-data.zip','acquisition-source.tar.gz','probe-source.ts')):archive.write(file,file.name)
    print(json.dumps(dict(out=str(out),html_bytes=len(page.encode()),totals=study['totals'],comparisons=study['comparisons'])))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--baseline',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--allow-partial',action='store_true')
    args=parser.parse_args()
    build(args.run,args.baseline,args.out,args.allow_partial)
