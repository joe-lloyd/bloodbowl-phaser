import json,glob,sys
B=["Dwarf","Nurgle","Tomb Kings","Chaos Dwarf","Black Orc","Khorne","Chaos Chosen","Orc"]
for run in sys.argv[1:]:
  for pol in ["C","F"]:
    T=[{} for _ in range(8)]
    for f in glob.glob(run+"/pace-*-of-11.json"):
      for r,rows in json.load(open(f)).items():
        name,_,p=r.partition("|")
        if p!=pol or name not in B: continue
        for k,row in enumerate(rows):
          for a,v in (row or {}).items(): T[k][a]=T[k].get(a,0)+v
    g=lambda k,a: T[k].get(a,0)
    turns=sum(g(k,"turns") for k in range(1,7)); kept=sum(g(k,"kept") for k in range(1,7))
    sv=sum(g(k,"survived") for k in range(1,7)); st=sum(g(k,"stolen") for k in range(1,7))
    full=sum(g(k,"endFull") for k in range(1,7)); corners=sum(g(k,"endCorners") for k in range(1,7))
    gain=sum(g(k,"gained") for k in range(1,7)); sc=sum(g(k,"scored") for k in range(1,7)); lost=sum(g(k,"lost") for k in range(1,7))
    t6=T[6]
    print(f"{run.split('/')[-2]:12} {pol} turns {turns} score {100*sc/turns:.1f}% lostOwn {100*lost/turns:.1f}% gain/kept {gain/kept:.2f} corners {corners/kept:.2f} full {100*full/kept:.1f}% stolen {100*st/(sv+st):.1f}% t6reach {100*t6.get('inReach',0)/max(1,t6.get('turns',0)):.0f}%")
    t=T[0]
    print("   ", " | ".join(f"{tag} {100*t.get('x:'+tag,0)/(t.get('ok:'+tag,0)+t.get('x:'+tag,0)):.0f}% ({t.get('ok:'+tag,0)+t.get('x:'+tag,0)})" for tag in ["c0","c1","c2","c3","c4"] if t.get('ok:'+tag,0)+t.get('x:'+tag,0)))
