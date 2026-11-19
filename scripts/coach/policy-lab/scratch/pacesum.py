import json,glob,sys
tot={}
for f in glob.glob(sys.argv[1]+"/pace-*-of-11.json"):
  for r,rows in json.load(open(f)).items():
    T=tot.setdefault(r,[{} for _ in range(8)])
    for k,row in enumerate(rows):
      if not row: continue
      for a,v in row.items(): T[k][a]=T[k][a]+v if a in T[k] else v
want=sys.argv[2].split(",") if len(sys.argv)>2 else sorted(tot)
for r in want:
  print(r)
  for k in range(1,7):
    t=tot[r][k]; n=t.get("turns",0)
    if not n: continue
    g=lambda a: t.get(a,0)
    print(f"  t{k} n{n:4} toGo {g('toGo')/n:5.1f} reach {100*g('inReach')/n:3.0f}% team {100*g('teamReach')/n:3.0f}% score {100*g('scored')/n:3.0f}% lost {100*g('lost')/n:3.0f}% gain {g('gained')/max(1,g('kept')):.2f} ahead {g('ahead')/n:.1f} free {g('freeAhead')/n:.1f} theirs {g('theirStanding')/n:.1f} ours {g('ourStanding')/n:.1f} marked {100*g('marked')/n:3.0f}% handed {100*g('newCarrier')/max(1,g('kept')):3.0f}%")
print("after our turn ends holding the ball (by that turn):")
for r in want:
  print(r)
  for k in range(1,6):
    t=tot[r][k]; g=lambda a: t.get(a,0); kept=g('kept')
    if not kept: continue
    sv=g('survived'); st=g('stolen')
    print(f"  t{k} kept {kept:4} corners {g('endCorners')/kept:.2f} full {100*g('endFull')/kept:3.0f}% endMarked {100*g('endMarked')/kept:3.0f}% | next: survived {sv} stolen {100*st/max(1,sv+st):3.0f}% pushedBack {g('pushedBack')/max(1,sv):.2f}")
print("steal rate by end-of-turn cage: corners, m = carrier marked; r = opponents in reach")
for r in want:
  t=tot[r][0]
  tags=sorted({k.split(":")[1] for k in t})
  out=[]
  for tag in tags:
    ok=t.get("ok:"+tag,0); x=t.get("x:"+tag,0)
    if ok+x>=15: out.append(f"{tag} {100*x/(ok+x):3.0f}% ({ok+x})")
  print(f"{r:12}", " | ".join(out))
