"""Poses and the generic animations.

A pose is a dict. Biped skeleton keys (degrees):
  lean, twist, look, nod, jaw
  legs = {"l": (swing forward, spread, knee bend), "r": ...}
  arms = {"l": (swing forward, spread, elbow bend[, forearm spread]), "r": ...}
  feet = {"l": toe-down angle, "r": ...}      hands = "relaxed" | "fist" | "open"
  hand_modes = {"r": "fist"}                   (per-hand override)
Whole-figure keys, handled by the renderer for every body plan:
  pitch  degrees, + tips the figure onto its back      roll   degrees, tips it onto its side
  hop    metres off the ground                         shift  metres forward
  squash vertical scale (1 = normal)
Costume keys read by the biped builder: flare (coat skirts 0..1), cape (0..1), wings (1 = spread),
_action (True streams ponytails / braids), layout (dict merged into the model's layout for this frame).

Animations are functions (model, frame index, frame count) -> pose. The loops (idle, run, cheer) are made
of periodic terms so the last frame flows into the first. "s" in the game's facing names is rotation 0.
"""
import math, copy

ANIMS = {"idle": 8, "run": 8, "fall": 8, "cheer": 8, "block": 8, "pass": 8}
LOOPS = ("idle", "run", "cheer")

def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)

def mix(a, b, t):
    """Blend two poses; numbers and tuples are interpolated, anything else switches at the half-way point."""
    out = {}
    for k in set(a) | set(b):
        x, y = a.get(k), b.get(k)
        if x is None or y is None:
            v = x if y is None else y
            if _num(v):
                v = v * ((1 - t) if y is None else t)      # a missing number counts as 0
            out[k] = v
        elif _num(x) and _num(y):
            out[k] = x + (y - x) * t
        elif isinstance(x, dict) and isinstance(y, dict):
            out[k] = mix(x, y, t)
        elif isinstance(x, tuple) and isinstance(y, tuple):
            n = max(len(x), len(y))
            fx = x + tuple(x[1] * 0.6 for _ in range(n - len(x)))      # default forearm spread
            fy = y + tuple(y[1] * 0.6 for _ in range(n - len(y)))
            out[k] = tuple(p + (q - p) * t for p, q in zip(fx, fy))
        else:
            out[k] = x if t < 0.5 else y
    return out

def keyframes(keys, i):
    """keys: [(frame, pose), ...] sorted by frame; returns the pose at frame i (linear in between)."""
    if i <= keys[0][0]:
        return copy.deepcopy(keys[0][1])
    for (f0, p0), (f1, p1) in zip(keys, keys[1:]):
        if i <= f1:
            return mix(p0, p1, (i - f0) / float(f1 - f0))
    return copy.deepcopy(keys[-1][1])

def wave(ph):
    """Handy periodic terms for a loop phase in [0, 1): s1, c1, s2 and a two-state breath (0 or 1)."""
    a = 2 * math.pi * ph
    s1 = math.sin(a)
    return dict(a=a, s1=s1, c1=math.cos(a), s2=math.sin(2 * a), up=max(0.0, s1), dn=max(0.0, -s1),
                breath=1.0 if s1 > 0 else 0.0)

# ----------------------------------------------------------------- biped
def biped_idle(m, i, n):
    w = wave(i / n)
    p = copy.deepcopy(m.stance)
    arms = dict(p["arms"])
    for s in ("l", "r"):                       # two-state breathing: most pixels stay still
        a = arms[s]
        arms[s] = (a[0], a[1] + 3 * w["breath"]) + tuple(a[2:])
    p["arms"] = arms
    out = m.idle(i / n, p, w)
    return out if out is not None else p

def biped_run(m, i, n):
    w = wave(i / n)
    s1, c1 = w["s1"], w["c1"]
    st, sw = m.stride, m.arm_swing
    base = m.stance
    sp = base["legs"]["l"][1] * 0.5
    asp = min(base["arms"]["l"][1], 18)
    return dict(lean=m.run_lean + base.get("lean", 0) * 0.5, twist=7 * s1, nod=-6,
                legs={"l": (st * s1, sp, 14 + 55 * max(0, c1)), "r": (-st * s1, sp, 14 + 55 * max(0, -c1))},
                feet={"l": 35 * max(0, -s1), "r": 35 * max(0, s1)},
                arms={"l": (-sw * s1, asp, 78), "r": (sw * s1, asp, 78)}, hands="fist",
                flare=0.5, cape=0.6, _action=True)

def biped_cheer(m, i, n):
    w = wave(i / n)
    base = m.stance
    sp = base["legs"]["l"][1]
    return dict(lean=-4, hop=m.jump * w["up"], nod=8, jaw=28, wings=1 if w["up"] > 0.3 else 0,
                legs={"l": (4, sp, 6 + 18 * w["dn"]), "r": (-4, sp, 6 + 18 * w["dn"])},
                arms={"l": (158, 26, 14 + 20 * w["s2"]), "r": (158, 26, 14 - 20 * w["s2"])}, hands="fist",
                flare=0.15 + 0.25 * w["up"], cape=0.1 + 0.3 * w["up"])

def biped_fall(m, i, n):
    b = copy.deepcopy(m.stance)
    sp = b["legs"]["l"][1]
    k = [(0, dict(b, lean=b.get("lean", 0) - 8, nod=-12)),
         (2, dict(lean=0, pitch=30, nod=-10, legs={"l": (22, sp, 22), "r": (-10, sp, 12)},
                  arms={"l": (60, 50, 25), "r": (70, 55, 20)}, hands="open", flare=0.3, cape=0.3)),
         (4, dict(lean=0, pitch=80, hop=0.05, legs={"l": (26, sp + 2, 30), "r": (8, sp + 2, 22)},
                  arms={"l": (100, 60, 12), "r": (105, 62, 10)}, hands="open", flare=0.3, cape=0.2)),
         (5, dict(lean=0, pitch=90, hop=0.0, legs={"l": (14, sp + 4, 16), "r": (2, sp + 4, 10)},
                  arms={"l": (108, 66, 10), "r": (108, 66, 10)}, hands="open")),
         (6, dict(lean=0, pitch=90, hop=0.025, legs={"l": (10, sp + 4, 12), "r": (0, sp + 4, 8)},
                  arms={"l": (104, 68, 8), "r": (104, 68, 8)}, hands="relaxed")),
         (7, dict(lean=0, pitch=90, hop=0.0, legs={"l": (8, sp + 4, 10), "r": (-2, sp + 4, 6)},
                  arms={"l": (100, 68, 8), "r": (100, 68, 8)}, hands="relaxed"))]
    return keyframes(k, i * 7.0 / (n - 1))

def biped_block(m, i, n):
    b = copy.deepcopy(m.stance)
    sp = max(b["legs"]["l"][1], 12)
    wind = dict(lean=-4, legs={"l": (-6, sp, 14), "r": (10, sp, 18)}, arms={"l": (15, 24, 100), "r": (15, 24, 100)},
                hands="open")
    shove = dict(lean=30, shift=0.14, nod=-14, legs={"l": (-22, sp, 12), "r": (44, sp, 58)}, feet={"l": 25},
                 arms={"l": (80, 14, 26), "r": (80, 14, 26)}, hands="open", flare=0.35, cape=0.4)
    return keyframes([(0, b), (1, wind), (3, shove), (4, shove), (7, b)], i * 7.0 / (n - 1))

def biped_pass(m, i, n):
    """Empty-handed throw: wind-up, release, follow-through. Nothing is held."""
    b = copy.deepcopy(m.stance)
    wind = dict(lean=-8, twist=34, look=-20, legs={"l": (32, 8, 14), "r": (-22, 8, 20)}, feet={"r": 20},
                arms={"l": (82, 4, 8), "r": (-25, 78, 200, 14)}, hands="open", cape=0.2)
    release = dict(lean=14, twist=-26, legs={"l": (26, 8, 26), "r": (-30, 8, 14)}, feet={"r": 35},
                   arms={"l": (-24, 22, 45), "r": (118, 18, 6, 4)}, hands="open", flare=0.3, cape=0.45)
    follow = dict(lean=20, twist=-34, legs={"l": (22, 8, 30), "r": (-26, 8, 18)}, feet={"r": 30},
                  arms={"l": (-30, 24, 50), "r": (62, 6, 24, -24)}, hands="open", flare=0.2, cape=0.3)
    return keyframes([(0, b), (2, wind), (3, wind), (4, release), (5, follow), (7, b)], i * 7.0 / (n - 1))

BIPED = {"idle": biped_idle, "run": biped_run, "cheer": biped_cheer, "fall": biped_fall, "block": biped_block,
         "pass": biped_pass}
