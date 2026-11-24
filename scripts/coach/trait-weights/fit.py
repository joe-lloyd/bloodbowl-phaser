"""Read collect.ts output: do weights or setups depend on the teams playing?"""

import glob
import json
import sys

import numpy as np

TRAITS = ["pace", "strength", "agility", "armour", "hitting", "handling"]
LABELS = [f"{side} {t}" for side in ("own", "opposing") for t in TRAITS]


def load(pattern):
    return [json.loads(line) for f in glob.glob(pattern) for line in open(f) if line.endswith("\n")]


def residual(traits, results):
    base = np.c_[np.ones(len(results)), traits, traits**2]
    return results - base @ np.linalg.lstsq(base, results, rcond=None)[0]


def slope(x, y):
    size = x @ x
    return (x @ y) / size, (x @ y) / np.sqrt(size) / y.std()


def weights(games, names):
    noise, traits, points = [], [], []
    for g in games:
        result = np.sign(g["score"][0] - g["score"][1]) / 2
        for side in (0, 1):
            points.append(result if side == 0 else -result)
            noise.append(np.array(g["noise"][side]) * g["sign"])
            traits.append(g["traits"][side])
    noise, traits = np.array(noise), np.array(traits)
    left = residual(traits, np.array(points))
    rows = sorted(((*slope(noise[:, k], left), n) for k, n in enumerate(names)), key=lambda r: -abs(r[1]))
    print("Points per unit shift, largest first")
    for b, z, name in rows[:8]:
        print(f"  {name:18} {b:+.4f}  z {z:+.1f}")
    zs = [slope(noise[:, k] * traits[:, t], left)[1] for k in range(len(names)) for t in range(len(LABELS))]
    print(f"Weight by trait: mean squared z {np.mean(np.square(zs)):.2f} over {len(zs)} (1 is chance)")


def setups(games):
    for kicking in (True, False):
        rows = [(d["formation"], g["traits"][d["side"]], d["result"]) for g in games for d in g["drives"] if d["kicking"] == kicking]
        names = np.array([r[0] for r in rows])
        traits = np.array([r[1] for r in rows])
        left = residual(traits, np.array([r[2] for r in rows], float))
        print("Kicking" if kicking else "Receiving", len(rows), "drives, touchdowns per drive")
        for name in sorted(set(names)):
            pick = left[names == name]
            print(f"  {name:45} {pick.mean():+.4f} +-{pick.std() / len(pick) ** 0.5:.4f}")


if __name__ == "__main__":
    found = load(sys.argv[1])
    print(len(found), "games")
    weights(found, json.load(open(sys.argv[2])))
    setups(found)
