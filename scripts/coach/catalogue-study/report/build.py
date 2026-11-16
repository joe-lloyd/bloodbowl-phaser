"""Build a standalone, offline HTML workbook and CSV bundle from study runs."""
import argparse
import base64
import gzip
import html
import json
import shutil
import zipfile
from pathlib import Path
from analyse import collect, write_csv

ESC=html.escape
FMT=lambda value: f'{value:,}'
PCT=lambda value: f'{value*100:.1f}%'


def table(headers, rows):
    if any(len(row)!=len(headers) for row in rows):
        raise ValueError('Table header and row widths differ')
    return '<div class="scroll"><table><thead><tr>'+''.join('<th scope="col">'+ESC(str(h))+'</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+ESC(str(v))+'</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table></div>'


def paragraph(text):
    return '<p>'+ESC(text)+'</p>'


def recommendation(title, evidence, change, validation):
    return '<details open><summary>'+ESC(title)+'</summary>'+paragraph('Evidence: '+evidence)+paragraph('Suggested change: '+change)+paragraph('Validation: '+validation)+'</details>'


def chart(cohorts):
    chosen=[r for r in cohorts if (r['cohort'],r['coach']) in [('calibration','planner'),('hard','hard'),('legend','legend')]]
    labels={'calibration':'Planner vs heuristic','hard':'Hard vs planner','legend':'Legend vs planner'}
    parts=['<svg viewBox="0 0 680 210" role="img" aria-label="Points share and paired 95 percent intervals by coach comparison"><title>Points share by coach comparison</title>']
    left,right=210,630
    for tick in (0,.25,.5,.75,1):
        x=left+(right-left)*tick
        parts.append(f'<line class="gridline" x1="{x}" x2="{x}" y1="14" y2="174"/><text text-anchor="middle" x="{x}" y="197">{PCT(tick)}</text>')
    for i,row in enumerate(chosen):
        y=32+i*56
        x=left+(right-left)*row['points']
        low,high=[left+(right-left)*row[k] for k in ('points_low','points_high')]
        parts.extend([f'<text x="0" y="{y+6}">{labels[row["cohort"]]}</text>',
            f'<rect class="bar" x="{left}" y="{y-11}" width="{x-left}" height="22" opacity=".55"/>',
            f'<line class="whisker" x1="{low}" x2="{high}" y1="{y}" y2="{y}"/>',
            f'<line class="whisker" x1="{low}" x2="{low}" y1="{y-6}" y2="{y+6}"/>',
            f'<line class="whisker" x1="{high}" x2="{high}" y1="{y-6}" y2="{y+6}"/>',
            f'<text x="{min(640,x+8)}" y="{y+5}">{PCT(row["points"])}</text>'])
    return ''.join(parts)+'</svg>'


def build(study, out, audit, supplementary, source_files, partial=False):
    out.mkdir(parents=True, exist_ok=True)
    totals=study['totals'];d=study['datasets'];manifest=study['manifest'];inventory=manifest['inventory']
    if not partial and totals['recorded']!=totals['requested']:
        raise ValueError('The report requires every scheduled game')
    league=[r for r in d['templates'] if r['cohort']=='league']
    vampire=[r for r in league if r['roster']=='Vampire']
    calibration=next(r for r in d['cohorts'] if r['cohort']=='calibration' and r['coach']=='planner')
    actions={r['action']:r for r in d['actions'] if r['cohort']=='league'}
    omitted=sorted({r['action'] for r in audit.get('omittedDeclarations',[])})
    negative=[]
    for skill in ('Really Stupid','Animal Savagery','Unchannelled Fury','Bloodlust','Bone Head','Take Root'):
        rolls=[r for r in d['rolls'] if r['cohort']=='league' and r['roll']==skill]
        bins=(('helper adjacent',lambda r:r['helper_adjacent']),('no helper adjacent',lambda r:not r['helper_adjacent'])) if skill=='Really Stupid' else (
             ('Block / Blitz',lambda r:r['action'] in ('block','blitz')),('other actions',lambda r:r['action'] not in ('block','blitz')))
        for context,predicate in bins:
            rows=[r for r in rolls if predicate(r)]
            attempts=sum(r['attempts'] for r in rows);failed=sum(r['failures'] for r in rows)
            if attempts:negative.append(dict(skill=skill,context=context,rolls=attempts,failed=failed,failure_rate=failed/attempts))
    d['negative-traits']=negative
    effects=[r for r in study['contexts'] if r['valid'] and r['cohort']=='league' and r['skill']=='Bloodlust']
    unfed=sum(r['count'] for r in effects if 'bit nobody' in r['effect'])
    fed=sum(r['count'] for r in effects if ' bites ' in r['effect'])
    carrying_unfed=sum(r['count'] for r in effects if 'bit nobody' in r['effect'] and r['carrying'])
    late_unfed=sum(r['count'] for r in effects if 'bit nobody' in r['effect'] and r['half']==2 and r['turn']>=5)
    action_blind=[(key,actions.get(key,{}).get('decision_points_offered',0),actions.get(key,{}).get('selections',0)) for key in ('declare:foul','jump','declare:stab','declare:vomit','declare:blitz:stab','declare:blitz:vomit','declare:ballAndChain','declare:pass')]
    d['blind-spots']=[dict(action=key,decision_points_offered=offered,selections=selected) for key,offered,selected in action_blind]
    standards=[r for r in d['rosters'] if r['cohort']=='calibration' and r['coach']=='planner']
    templates={t['id']:t for t in inventory['teams']}
    for row in standards:
        template=next(t for t in templates.values() if t['rosterName']==row['roster'])
        row['brutes']="Brawlin' Brutes" in template['specialRules']
        row['coverage']=min(1,row['spp_per_game']/row['target_spp'])
        row['meets']=row['spp_per_game']>=row['target_spp']
    macro=sum(r['coverage'] for r in standards)/max(1,len(standards))
    d['standards']=standards
    for name,rows in d.items():write_csv(out,name,rows)
    write_csv(out,'skill-contexts',study['contexts'])
    write_csv(out,'roll-contexts',study['roll_rows'])
    observations=[r for r in d['skills'] if r['triggers']]
    n_native=sum(r['templates_with_skill']>0 for r in d['skills'])
    low_skill=sorted([r for r in observations if r['triggers']<100],key=lambda r:r['triggers'])
    rare=', '.join(f"{r['skill']} ({r['triggers']})" for r in low_skill[:8])
    summary=dict(totals=totals,source=dict(revision=manifest['revision'],sourceDigest=manifest['sourceDigest'],host=manifest['host'],
        created=manifest['created'],ruleset=manifest['ruleset']),cohorts=d['cohorts'],skills=d['skills'],
        vampireFindings=dict(unfedTurnovers=unfed,fed=fed,carryingAtCommandEntry=carrying_unfed,lateSecondHalf=late_unfed),
        negativeTraits=negative,standardsShareMacro=macro,excluded=inventory['excluded'],
        candidateAudit=audit,supplementaryTests={k:supplementary.get(k) for k in ('numTotalTests','numPassedTests','numFailedTests','success')})
    (out/'summary.json').write_text(json.dumps(summary,indent=2))
    embedded={name:rows for name,rows in d.items() if name not in ('team-games','matchups')}
    payload={name:dict(columns=list(dict.fromkeys(k for row in rows for k in row)),rows=[]) for name,rows in embedded.items()}
    for name,rows in embedded.items():payload[name]['rows']=[[row.get(k) for k in payload[name]['columns']] for row in rows]
    examples=[]
    predicates=[('Unfed Vampire carrier',lambda r:r['skill']=='Bloodlust' and 'bit nobody' in r['effect'] and r['carrying']),('Late-half unfed Vampire',lambda r:r['skill']=='Bloodlust' and 'bit nobody' in r['effect'] and r['half']==2 and r['turn']>=5),('Animal Savagery teammate hit',lambda r:r['skill']=='Animal Savagery' and 'lashes out' in r['effect']),('Rare Give and Go',lambda r:r['skill']=='Give and Go'),('Safe Pair of Hands',lambda r:r['skill']=='Safe Pair of Hands')]
    for label,predicate in predicates:
        sample=next((r for r in study['contexts'] if r['valid'] and predicate(r)),None)
        if sample: examples.append(dict(context=label,game=sample['game'],seed=sample['seed'],command_index=sample['firstStep'],effect=sample['effect']))
    write_csv(out,'examples',examples)
    compressed=base64.b64encode(gzip.compress(json.dumps(payload,separators=(',',':')).encode())).decode()
    source_base='https://github.com/joe-lloyd/bloodbowl-phaser/blob/'+manifest['revision']+'/'
    def link(path,label):return '<a href="'+source_base+path+'">'+ESC(label)+'</a>'
    hard=next((r for r in d['cohorts'] if r['cohort']=='hard' and r['coach']=='hard'),None)
    hard_planner=next((r for r in d['cohorts'] if r['cohort']=='hard' and r['coach']=='planner'),None)
    tier_story=paragraph(f"Hard scored {hard['td_per_game']:.3f} touchdowns per game versus the planner’s {hard_planner['td_per_game']:.3f}, while causing {hard['cas_per_game']:.3f} versus {hard_planner['cas_per_game']:.3f} casualties. Its turnover rate was higher ({PCT(hard['turnover_rate'])} versus {PCT(hard_planner['turnover_rate'])}). This measured tradeoff supports judging scoring and possession outcomes alongside safety; fewer turnovers alone would favor the losing policy here.") if hard and hard_planner else ''
    tokens={
     'subtitle':f"{'PROVISIONAL · ' if partial else ''}{totals['recorded']:,} matches · {totals['templates']} legal templates · {totals['rosters']} rosters · Daily Driver · {ESC(manifest['revision'][:12])}",
     'overview':f"{FMT(totals['completed'])} matches reached full time, producing {FMT(totals['touchdowns'])} touchdowns, {FMT(totals['casualties'])} SPP-eligible casualties, and {FMT(totals['commands'])} recorded commands. Blocking findings: {FMT(totals['blocking_findings'])}; rejected candidates: {FMT(totals['warnings'])}. This is an evaluation of frozen scripted policies; playing matches does not itself update their algorithms.",
     'chart':chart(d['cohorts']),
     'cohort_table':table(['Cohort / coach','Games*','W / D / L','Points share','TD / game','CAS / game','Turnovers / turn','Race-macro points'],[
         [r['cohort']+' / '+r['coach'],FMT(r['games']),f"{r['wins']} / {r['draws']} / {r['losses']}",PCT(r['points']),f"{r['td_per_game']:.3f}",f"{r['cas_per_game']:.3f}",PCT(r['turnover_rate']),PCT(r['race_macro_points'])] for r in d['cohorts']])+paragraph('* League rows count both teams: 12,960 team-games from 6,480 matches. Other rows count one appearance per coach per match. The league aggregate is necessarily 50% points share; it measures roster behavior, not improvement.'),
     'findings': tier_story+'<div class="alert">'+paragraph(f"The main bottleneck is action coverage. In the full league, the planner chose no fouls, jumps, stabs, vomit replacements, or Ball & Chain actions. It declared only {actions.get('declare:pass',{}).get('selections',0)} passes. More self-play cannot optimize actions the policy cannot represent.")+'</div>'+table(['Action','Decision points offering it','Selections'],action_blind)+paragraph('Counts of offers are repeated decision points, not independent tactical opportunities. The separate candidate audit found engine-legal declarations absent from simulator candidates: '+', '.join(omitted)+'. Code inspection also shows that planner intents and lookahead shortlists omit special-attack planning.')+paragraph(f"Against the old heuristic, the planner won {calibration['wins']}, drew {calibration['draws']}, and lost {calibration['losses']} of {calibration['games']} games ({PCT(calibration['win_rate'])} wins). The previous generic-lineup benchmark was 1,029 / 157 / 14 over 1,200 games. Its extra rerolls and free inducements make those percentages unsuitable for a direct regression claim."),
     'examples':table(['Context','Match','Command index','Effect'],[[r['context'],r['game'],r['command_index'],r['effect']] for r in examples])+paragraph('Each match has a saved initial state and compressed command trace. The command index is zero-based and locates the announced effect in that trace; replay verifies the final state hash.'),
     'vampires':paragraph(f"Vampire league games produced {FMT(unfed)} explicit Bloodlust ‘bit nobody’ turnover events and {FMT(fed)} bites. Of the unfed events, {FMT(carrying_unfed)} involved a carrier at command entry and {FMT(late_unfed)} occurred in the last two turns of the second half. The four Vampire builds each played 160 games; the table shows why pooling them would hide weaknesses."),
     'vampire_table':table(['Build','W / D / L','Points share','TD / game','Turnovers / turn'],[[r['name'],f"{r['wins']} / {r['draws']} / {r['losses']}",PCT(r['points']),f"{r['td_per_game']:.3f}",PCT(r['turnover_rate'])] for r in sorted(vampire,key=lambda r:-r['points'])]),
     'negative_intro':'Unreliable activations are especially costly when support is absent or the declared action loses its activation bonus. The roll-level contrasts below identify contexts to reproduce in controlled planning puzzles.',
     'negative_table':table(['Trait','Context','D6 rolls','Failed rolls','Failure rate'],[[r['skill'],r['context'],FMT(r['rolls']),FMT(r['failed']),PCT(r['failure_rate'])] for r in negative]),
     'coverage':f"All {totals['skills_total']} skill and trait names have a row in the spreadsheet. {n_native} appear on the legal starting templates; {totals['skills_observed']} produced a SkillTriggered event across the matches ({totals['skills_league_observed']} in the planner league). The {totals['rule_outcomes']} named controlled outcomes passed {totals['rules_passed']} checks, covering all 106 registered in-match rules.",
     'coverage_table':table(['Evidence','Count'],[['Skill / trait names',totals['skills_total']],['On legal starting templates',n_native],['With a match trigger event',totals['skills_observed']],['With a planner-league trigger event',totals['skills_league_observed']],['Controlled rule outcomes passed',f"{totals['rules_passed']} / {totals['rule_outcomes']}"]]),
     'coverage_limits':f"Zero trigger events means no announced effect was observed; it does not establish that a passive skill was unused. Frenzy, free Jump Up standing, and Sprint allowances lack a general SkillTriggered event, for example. Controlled scenarios prove engine behavior, not good AI selection. Decay’s casualty-roll mechanic is outside Sevens; Insignificant is a draft-list constraint. Special team rules have their own table with exposure and scope rather than invented usage counts. Veteran and other non-catalogue effects are retained in a separate dataset. Rare announced effects include {rare}.",
     'supplementary':f"An additional {supplementary.get('numPassedTests',0)} of {supplementary.get('numTotalTests',0)} headless/unit checks passed on Daily Driver, including drafting, Insignificant, captain selection, allegiance, Swarming, inducements and the skill registry gate. These checks are separate from match statistics. The actual template audit found {sum(not t['appointed'] for t in audit.get('captains',[]))} captain-eligible templates with no captain appointed.",
     'standards':f"The existing adjusted objective is preserved. For Brawlin’ Brutes, standard SPP = 2 × touchdowns + 3 × SPP-eligible casualties. Other rosters count 3 × touchdowns toward this benchmark. Each race retains its existing target. Against the heuristic, the macro average of capped target shares is {macro:.3f}; {sum(r['meets'] for r in standards)} of {len(standards)} rosters meet their target. These are historical targets against the heuristic, not pass/fail requirements against equally strong planners. Fresh 600k templates use their own reroll banks, so this measures a tougher resource profile than the old generic benchmark.",
     'standards_table':table(['Brawlin’ Brutes roster','TD / game','CAS / game','SPP / game','Target SPP'],[[r['roster'],f"{r['td_per_game']:.3f}",f"{r['cas_per_game']:.3f}",f"{r['spp_per_game']:.3f}",f"{r['target_spp']:.3f}"] for r in standards if r['brutes']]),
     'recommendations': ''.join([
       recommendation('1. Expand candidates and planning intents before tuning weights',f"Engine-legal actions omitted from the candidate seam: {', '.join(omitted)}. Special attacks and jumps offered to the planner were never selected in the league.", 'Add legal target and movement enumeration for gaze, punts, throws, multiple blocks and secure-ball actions. Add focused tactical generators for special attacks, jumps, weapons and fouls. Let Hard and Legend evaluate those same intents.', 'For each action, add an advantageous puzzle, a harmful puzzle, and an irrelevant-control puzzle. Require correct target selection and a measurable downstream benefit, then compare against the frozen generation on new seeds.'),
       recommendation('2. Make Vampire feeding and opposing support denial explicit',f"{FMT(unfed)} unfed-turnover events in the league; Vampire build points shares range from {PCT(min(r['points'] for r in vampire))} to {PCT(max(r['points'] for r in vampire))}. Hypnotic Gaze is excluded from simulator declarations.", 'Score legal carrier endpoints by Thrall reach and bite legality; move support first when required; reserve non-carrier Thralls. Choose bite victims by lost activation value and injury exposure. Separate the optional downgrade-to-Move answer from the bite-consent answer. Against Vampires, test denying Thrall access and exploiting unsated carriers.', 'Use fresh paired boards for supported/unsupported carriers, prone Thralls, multiple bite targets, no-feed scoring lines, and gaze-opened cages. Compare own-team feeding and enemy-support denial separately before composing them.'),
       recommendation('3. Price activation gates and support before choosing who acts', 'The negative-trait table separates supported from unsupported Really Stupid rolls and attack from non-attack activations. Current route probabilities do not account for these activation gates.', 'Compose activation reliability with route reliability, while pricing the actual failure consequence: lost activation, lost tackle zones, injured teammate, or turnover. Schedule safe support before risky activations and avoid exposing a friendly carrier to Animal Savagery.', 'Ablate the gate-probability model, activation ordering, and support placement separately. Track final failed activations, carrier losses, and own-team injuries, not only failed D6 rolls.'),
       recommendation('4. Treat kickoff decisions and captain selection as policy gaps', 'The league skips every offered interactive kickoff-event step. The catalogue builder appoints no captain on captain-eligible templates.', 'Add event-specific kickoff movement and targeting policies. Use the application’s legal captain-selection seam when preparing computer teams, and evaluate its free Pro and reroll-saving effects independently.', 'Hold roster recipes fixed during the policy comparison; report captain appointment as a separate team-preparation experiment rather than silently changing the baseline.'),
       recommendation('5. Use a frozen opponent pool and sealed confirmation seeds', 'Hard and Legend share the planner’s action vocabulary. The old heuristic loses most games and cannot discriminate improvements reliably.', 'Use the current generation, a retained older generation, deterministic Hard/Legend, and targeted exploiters as opponents. Keep race-macro and template-macro metrics alongside the overall score. Reuse discovery seeds within candidate comparisons, then confirm on sealed seeds and unseen pairings.', 'Promote only after complete mirrored pairs and clean engine checks. Bootstrap pairs rather than individual games. Require no material regressions for weak rosters, Vampire feeding, bash-standard SPP and action coverage. Do not optimize a single skill-usage count or casualty total at the expense of winning.')]),
     'method': paragraph('Schedule: 6,480 planner-versus-planner games, one home and one away game for every unordered pair of 81 legal recipes; 972 planner-versus-heuristic games; 162 Hard-versus-planner and 162 Legend-versus-planner games. In cross-coach comparisons, each seed fixes both templates and then swaps the coaches. Every template appears on both physical sides equally across the cyclic schedule. Hard and Legend use their full deterministic 8- and 16-sample search budgets without wall-clock deadlines. Interactive opponents have time caps, so these results are full-budget policy comparisons rather than UI latency-equivalent difficulty ratings. No API model calls were used.')+paragraph('Construction: createComputerTeamFromTemplate, default GW 2025 Sevens profile, fresh 600k starting recipes, native rerolls and veteran, no added skills, no free simulation inducements, no persistence or team development between games. Matches begin in the simulator’s standard SETUP state and use its default weather state; varied weather and optional inducement/lifecycle behavior are covered by separate rule checks, not representative natural-match sampling. One bundled recipe is unavailable in this ruleset: '+ '; '.join(t['id']+' — '+t['reason'] for t in inventory['excluded']))+paragraph('Counting: only authoritative game events are measured, excluding lookahead clones. Read-only query responses reuse the preceding event log and are ignored. Legacy observations were rebuilt by replaying saved commands, verifying each final state hash before replacing their counts. Every trace includes the actual initial MatchSave, preserving custom recipes and unequal rerolls; generic simulation recordings alone cannot reproduce these teams. A SkillTriggered event is an announced effect, not a unique activation, roll, or skill owner. Completions follow the engine counter, which includes caught handoffs. Casualty totals count SPP-eligible casualties; all other injury and death events remain in traces/aggregate event counters.')+paragraph('Validity and uncertainty: unfinished or blocking-finding games are excluded from performance rates and retained in the findings and raw tables. No games are silently omitted from the manifest. Bootstrap intervals use 2,000 deterministic resamples of complete mirrored seed pairs; matched seeds reduce variance but different policies consume dice differently. Per-template league rankings are descriptive for this frozen policy and fixed schedule, not intrinsic tabletop roster strength. Rare skill counts and correlations do not establish the best or worst tactic; paired context experiments are required. The empirical opponent-pool literature motivates the training design by analogy, not as evidence that this scripted AI has learned.')+paragraph('Frozen engine revision: '+manifest['revision']+'. Acquisition source SHA-256: '+manifest['sourceDigest']+'. Host: '+manifest['host']+'. Node: '+manifest['node']+'.')+'<pre><code>pnpm exec tsx scripts/coach/catalogue-study.ts --workers 10 --out sim-results/catalogue-study\npnpm exec tsx scripts/coach/catalogue-study/rules.ts sim-results/catalogue-rules\npnpm exec tsx scripts/coach/catalogue-study/audit.ts sim-results/candidate-audit.json\n# Replay a saved match and verify its final hash:\npnpm exec tsx scripts/coach/catalogue-study/replay.ts &lt;trace.json.gz&gt;\n# Rebuild an offline report from one or several cohort directories:\npython3 scripts/coach/catalogue-study/report/build.py --runs &lt;run-dir&gt; --rules &lt;rules.json&gt; \\\n  --audit &lt;candidate-audit.json&gt; --supplementary &lt;supplementary-tests.json&gt; --out &lt;report-dir&gt;</code></pre>',
     'sources':'<ul><li>'+link('docs/SIMULATION.md','Prior 1,200-game evaluation and benchmark design')+'</li><li>'+link('src/competition/computerTeamTemplates.ts','Application template builder')+' and '+link('src/data/computerTeamCatalogue.ts','Bonehead recipe catalogue with original episode timestamps')+'</li><li>'+link('src/simulation/candidates.ts#L56','Supported simulator declarations')+'; '+link('src/simulation/ai/activations.ts','Planner intents and activation generators')+'; '+link('src/simulation/ai/search.ts','Search budgets and shortlist')+'</li><li>'+link('src/simulation/standards.ts','Historical roster standards')+' and '+link('src/game/progression/MatchStats.ts','Brawlin’ Brutes scoring values')+'</li><li>'+link('src/data/ruleScenarios/index.ts','Registered rule scenarios')+' and '+link('__tests__/headless/rules/gate.test.ts','Deliberate Sevens exclusions')+'</li><li><a href="https://deepmind.google/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/">DeepMind: AlphaStar league training</a> — a population of opponents and exploiters addresses weaknesses that a single self-play opponent can miss. Applying that principle to this scripted policy is a proposed design, not a measured training result.</li><li><a href="https://www.ijcai.org/proceedings/2024/0017.pdf">IJCAI 2024: A Meta-Game Evaluation Framework for Deep Multiagent Reinforcement Learning</a> — motivates evaluating strategic relationships across a pool of policies rather than relying on a single opponent score.</li></ul>',
     'payload':compressed,
     'descriptions':json.dumps({'skill-by-coach':'Announced effects split by coach and cohort, with roster exposure. Zero rows are retained for all 108 skills and traits.','other-rule-effects':'Named engine effects outside the 108 skill/trait catalogue, including Veteran rerolls.','matchups':'Two league games per directed template matchup: home and away. A tiny sample describes what happened, not a reliable matchup probability.','events':'Authoritative event totals by cohort, including injury, death, kickoff, and reroll events. Casualty cause counters are shown separately.','skills':'All 108 names. Triggers count announced engine effects; roster exposure does not mean the skill was used. Zero events can also indicate missing passive-skill telemetry.','cohorts':'League counts both teams; other cohorts count one appearance per coach per match. Points intervals use complete mirrored seed pairs.','templates':'Rates by exact template, coach and cohort. League templates have 160 games each.','rosters':'Roster aggregates are template-weighted. The standards dataset supplies the race-macro summary.','rolls':'D6 attempts and failures include rerolls. turnoversInCommand is co-occurrence within a command, not causal attribution.','actions':'Repeated decision points offering an action and selected commands, across both sides of each cohort.','skill-effects':'Announced effects normalized to stable player IDs, grouped by skill, action and cohort.','special-rules':'Exposure and explicit scope. Team-rule availability is not an activation count.','team-games':'One row per team per scheduled game, including the original valid/invalid flag. Completions include handoffs.','games':'Every recorded match, including completion status, findings, seed, exact recipes and coaches.','negative-traits':'Planner league only. Failed roll counts include rerolls; these are descriptive context comparisons.','rules':'Scripted outcome verification, distinct from natural-match use.','findings':'All recorded harness findings, including nonblocking refusals.','standards':'Planner against heuristic only. Existing targets and the Brawlin’ Brutes casualty formula are preserved.','blind-spots':'Planner-league actions with little or no selection despite appearing at decision points.'}),
     'names':json.dumps({'skill-by-coach':'Skills by coach and cohort','other-rule-effects':'Veteran and other rule effects','matchups':'Every template matchup','events':'All event totals','cohorts':'Coach comparisons','templates':'Template results','rosters':'Roster results','skills':'All skills and traits','skill-effects':'Skill effects by action','rolls':'Rolls by tactical context','actions':'Action coverage','special-rules':'Team special rules','games':'Every match','team-games':'Every team-game','findings':'Harness findings','rules':'Controlled rule outcomes','negative-traits':'Negative-trait contexts','standards':'Adjusted roster targets','blind-spots':'Action blind spots'})}
    page=(Path(__file__).parent/'page.html').read_text()
    for key,value in tokens.items():page=page.replace('{{'+key+'}}',str(value))
    if '{{' in page:raise ValueError('Unresolved report placeholders')
    (out/'index.html').write_text(page)
    for source,name in zip(source_files,('rule-outcomes.json','candidate-audit.json','supplementary-tests.json')):
        if source.resolve()!=(out/name).resolve():shutil.copy2(source,out/name)
    with zipfile.ZipFile(out/'study-data.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(out.iterdir()):
            if file.is_file() and file.suffix in ('.csv','.json','.html'):archive.write(file,file.name)
    print(json.dumps(dict(report=str(out/'index.html'),htmlBytes=len(page),totals=totals,vampires=summary['vampireFindings'],zipBytes=(out/'study-data.zip').stat().st_size)))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--runs',nargs='+',required=True,type=Path)
    parser.add_argument('--rules',required=True,type=Path)
    parser.add_argument('--audit',required=True,type=Path)
    parser.add_argument('--supplementary',required=True,type=Path)
    parser.add_argument('--out',required=True,type=Path)
    parser.add_argument('--allow-partial',action='store_true')
    args=parser.parse_args()
    study=collect(args.runs,args.rules)
    build(study,args.out,json.loads(args.audit.read_text()),json.loads(args.supplementary.read_text()),(args.rules,args.audit,args.supplementary),args.allow_partial)
