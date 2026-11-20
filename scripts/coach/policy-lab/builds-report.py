import json, sys, math, collections, glob, os

folder = sys.argv[1]
rows = []
for path in sorted(glob.glob(os.path.join(folder, "*.jsonl"))):
    for line in open(path):
        line = line.strip()
        if line:
            rows.append(json.loads(line))

by = collections.defaultdict(list)
for r in rows:
    by[(r["build"], r["mode"])].append(r)

def pts(r):
    return 1.0 if r["for"] > r["against"] else 0.5 if r["for"] == r["against"] else 0.0

builds = sorted({r["build"] for r in rows})
modes = ["none", "petty", "chef"]
print("| Build | TV | " + " | ".join(f"{m} points" for m in modes) + " | scores (none) | TD for/against (none) |")
print("|---|---:|" + "---:|" * len(modes) + "---:|---|")
for b in builds:
    cells = []
    tv = None
    for m in modes:
        g = by.get((b, m), [])
        if not g:
            cells.append("-")
            continue
        p = sum(pts(r) for r in g) / len(g)
        se = math.sqrt(sum((pts(r) - p) ** 2 for r in g) / len(g) / len(g))
        cells.append(f"{p*100:.1f} ±{1.96*se*100:.1f} (n={len(g)})")
        r0 = g[0]
        tv = r0["tv"][r0["side"]]
    g = by.get((b, "none"), [])
    sc = sum(1 for r in g if r["for"] > 0) / max(1, len(g))
    tf = sum(r["for"] for r in g) / max(1, len(g))
    ta = sum(r["against"] for r in g) / max(1, len(g))
    print(f"| {b} | {tv} | " + " | ".join(cells) + f" | {sc*100:.1f}% | {tf:.2f} / {ta:.2f} |")

print()
for m in ["petty", "chef"]:
    for b in builds:
        g = by.get((b, m), [])
        c = collections.Counter()
        for r in g:
            c[",".join(sorted(r["bought"])) or "nothing"] += 1
        top = ", ".join(f"{k} {v}" for k, v in c.most_common(3))
        print(f"{m} {b}: {top}")

paired = collections.defaultdict(dict)
for r in rows:
    paired[(r["build"], r["opponent"], r["seed"])][r["mode"]] = pts(r)
print()
for b in builds:
    for m in ["petty", "chef"]:
        d = [v[m] - v["none"] for k, v in paired.items() if k[0] == b and m in v and "none" in v]
        if d:
            mean = sum(d) / len(d)
            se = math.sqrt(sum((x - mean) ** 2 for x in d) / len(d) / len(d))
            print(f"paired {b} {m}-none: {mean*100:+.1f} ±{1.96*se*100:.1f} (n={len(d)})")
