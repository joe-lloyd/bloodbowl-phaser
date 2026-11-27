"""Build and render the Deathbowl arena around its plus-shaped pitch.

    pnpm exec tsx scripts/sprites/venue_layouts.ts > layouts.json
    blender -b --factory-startup --python deathbowl.py -- OUT_DIR layouts.json

The plus does not fit venues.py, which paints a rectangle with a dugout on
each long side and a crowd at each end, so the arena has this script. It
borrows the rest: stadium.py's camera, light, materials, dugout and stands,
and venues.py's scene set-up and render, so players and the Phaser tinting
look the same as on every other venue.

layouts.json holds the arena from the game's own layout: the pitch squares,
each seat's own end zone, the lines (pitch edge, end zone lines, Lines of
Scrimmage and wide-zone lines, the four Lines of Scrimmage also closing the
7 by 7 centre) and the four dugouts, one 11 by 3 strip per seat in the
corner beside its own arm. The strips come from venueSidelines.ts, so the
render and the game read one definition, and a unit test checks meta.json
against it.

The mask pass paints each seat's kit in its own colour (MASKS, also written
to meta.json) so build_game_assets.py can split a north, east, south and
west layer for Phaser to tint. Each seat owns its dugout, its own end zone
and the quarter of the crowd round its corner.

The camera looks from the south-east corner, so tall seating would hide
whatever lies north or west of it. Only the north end and the crowds behind
West's and South's dugouts stand tall. The east, south and west ends keep a
few low rows: West's dugout runs out past the west end line, north of the
west end, and a tall west stand would hide it.
"""

import os
import random
import sys

from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
vn = {"__name__": "arena_helpers", "__file__": os.path.join(HERE, "venues.py")}
with open(os.path.join(HERE, "venues.py")) as fh:
    exec(fh.read(), vn)

st = vn["st"]
S = st["S"]
G = st["G"]
SEATS = ("north", "east", "south", "west")
MASKS = {"north": (1, 0, 0), "east": (0, 1, 0), "south": (0, 0, 1), "west": (1, 1, 1)}
SEAT_PARTS = {
    f"{part}_{seat}": (kind, (grey, grey, grey), seat)
    for seat in SEATS
    for part, kind, grey in (("zone", "toon", 0.22), ("seat", "toon", 0.3), ("fan", "toon", 0.36),
                             ("trim", "flat", 1.0), ("banner", "toon", 0.5))
}
TALL, LOW = 16, 3
NEAR = 21.9  # front of the low east and south stands, as far out as the stadium's near end


def turf(b, layout):
    zones = {tuple(sq): seat for seat, squares in layout["endZones"].items() for sq in squares}
    for x, y in layout["squares"]:
        seat = zones.get((x, y))
        part = f"zone_{seat}" if seat else ("turf_a" if (x + y) % 2 else "turf_b")
        b.box(part, G(x, y + 1, 0.0), G(x + 1, y, 0.02))


def lines(b, layout):
    w, z0, z1 = 0.12, 0.02, 0.03
    for x0, y0, x1, y1 in layout["lines"]:
        if x0 == x1:
            b.box("line", G(x0, y1, z0) - Vector((w / 2, 0, 0)), G(x0, y0, z1) + Vector((w / 2, 0, 0)))
        else:
            b.box("line", G(x0, y0, z0) - Vector((0, w / 2, 0)), G(x1, y0, z1) + Vector((0, w / 2, 0)))
    c = G(layout["cols"] / 2, layout["rows"] / 2, 0.03)
    b.box("line", c - Vector((0.35, 0.35, 0)), c + Vector((0.35, 0.35, 0.01)))


def strip_box(strip, margin):
    """The grid rectangle an 11 by 3 dugout strip covers, grown by `margin`."""
    (sx, sy), (ax, ay), (dx, dy) = strip["start"], strip["along"], strip["depth"]
    xs = (sx, sx + ax * 11 + dx * 3)
    ys = (sy, sy + ay * 11 + dy * 3)
    return min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin


def apron(b, layout):
    b.box("ground", (-200, -200, -0.3), (260, 200, -0.05))
    vn["gbox"](b, "apron", -1, -1, layout["cols"] + 1, layout["rows"] + 1, -0.05, 0.0)
    for strip in layout["strips"].values():
        x0, y0, x1, y1 = strip_box(strip, 0.5)
        vn["gbox"](b, "apron", x0, y0, x1, y1, -0.05, 0.0)


def dugouts(b, layout):
    for seat in SEATS:
        strip = layout["strips"][seat]
        along, depth = tuple(strip["along"]), tuple(strip["depth"])
        far = depth[0] < 0 or depth[1] < 0
        st["dugout"](b, seat, *strip["start"], along, depth, far=far)


def halves(low, high, split):
    """kit_of for a stand split at world coordinate `split`."""
    return lambda t: low if t < split else high


def crowd(b, rng, layout):
    """Stands behind each end zone and behind each dugout, split into the four seats' corners."""
    mid = layout["cols"] / 2 * S
    top = 0.6 + TALL * 0.48 + 1.8
    far = [
        # (x0, x1, front, out, kit_of): the north end, behind West's dugout, behind South's dugout
        (5 * S, 16 * S, S, (0, 1), halves("west", "north", mid)),
        (-7.6 * S, 5 * S, -0.5 * S, (0, 1), lambda t: "west"),
        (-28.6 * S, -16.5 * S, 0.45 * S, (-1, 0), lambda t: "south"),
    ]
    for x0, x1, front, out, kit_of in far:
        depth = st["stand"](b, rng, x0, x1, front, out, TALL, 0.6, kit_of)
        sgn = out[1] if out[0] == 0 else out[0]
        st["banners"](b, x0, x1, front + sgn * depth, out, top, kit_of)
    # the west end; the east end and behind North's dugout; the south end and behind East's dugout
    st["stand"](b, rng, -16 * S, -5.3 * S, -S, (-1, 0), LOW, 0.25, halves("south", "west", -mid), back=False)
    st["stand"](b, rng, -16 * S, 7.6 * S, NEAR * S, (1, 0), LOW, 0.25, halves("east", "north", -mid), back=False)
    st["stand"](b, rng, 5 * S, 28.6 * S, -NEAR * S, (0, -1), LOW, 0.25, halves("south", "east", mid), back=False)


def build(layout):
    rng = random.Random(21)
    b = st["Builder"]()
    apron(b, layout)
    turf(b, layout)
    lines(b, layout)
    dugouts(b, layout)
    crowd(b, rng, layout)
    b.finish()
    return b.dugouts


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    out, layouts_path = args[:2]
    st["MASK"].update(MASKS)
    vn["prepare"](SEAT_PARTS)
    layout = vn["load_layout"](layouts_path, "deathbowl")
    meta = vn["render"](layout, os.path.join(out, "deathbowl"), build, {"masks": MASKS})
    print("venue deathbowl", meta["sizes"])
