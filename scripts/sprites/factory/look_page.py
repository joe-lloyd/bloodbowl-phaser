"""Build the team looks review page from look sheets.

    python3 look_page.py OUT SHEETS [SHEETS ...]

Each SHEETS folder is the sheet/ folder a `render.py --sheet` run writes: <model>.json plus <model>/<n>.png.
OUT gets index.html and a copy of every sheet. Teams come from reference/rosters.json, so a model shared by
several teams shows under each; a team shows once any of its models has a sheet. Row labels come from each
sheet's json."""
import glob
import html
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ZOOM = 2

STYLE = """
:root { color-scheme: dark; --bg: #111317; --card: #1a1d23; --line: #2a2f38; --text: #e6e8eb; --muted: #9aa3ad; --accent: #e0b25a; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; }
header { position: sticky; top: 0; background: var(--bg); border-bottom: 1px solid var(--line); padding: 10px 16px; z-index: 1; }
header h1 { font-size: 17px; margin: 0 0 6px; }
nav { display: flex; flex-wrap: wrap; gap: 6px; }
nav a { color: var(--muted); text-decoration: none; font-size: 12px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 12px; }
nav a:hover { color: var(--text); border-color: var(--accent); }
main { padding: 8px 16px 40px; }
section { margin-top: 24px; }
section h2 { font-size: 16px; margin: 0 0 8px; color: var(--accent); }
.positions { display: flex; flex-wrap: wrap; gap: 10px; }
.pos { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; max-width: 100%; }
.pos h3 { font-size: 13px; margin: 0 0 6px; }
.row { display: flex; align-items: center; gap: 10px; }
.row span { font-size: 12px; color: var(--muted); width: 130px; flex: none; }
.row img { image-rendering: pixelated; display: block; max-width: 100%; height: auto; }
p.note { color: var(--muted); margin: 4px 0 0; font-size: 13px; }
"""


def load(folders):
    sheets = {}
    for folder in folders:
        for path in glob.glob(os.path.join(folder, "*.json")):
            info = json.load(open(path))
            sheets[info["model"]] = (folder, info)
    return sheets


def card(model, position, info, out_rel):
    w, h = info["cell"]
    width, height = w * len(info["poses"]) * ZOOM // info["density"], h * ZOOM // info["density"]
    rows = "".join('<div class="row"><span>%s</span><img src="%s/%d.png" width="%d" height="%d" alt="%s"></div>'
                   % (html.escape(label), out_rel, n, width, height, html.escape(label))
                   for n, label in enumerate(info["rows"]))
    return '<div class="pos"><h3>%s <small style="color:var(--muted)">%s</small></h3>%s</div>' % (
        html.escape(position), html.escape(model), rows)


def main(out, folders):
    rosters = json.load(open(os.path.join(HERE, "reference", "rosters.json")))
    sheets = load(folders)
    os.makedirs(os.path.join(out, "sheets"), exist_ok=True)
    for model, (folder, _) in sheets.items():
        dest = os.path.join(out, "sheets", model)
        shutil.rmtree(dest, ignore_errors=True)
        shutil.copytree(os.path.join(folder, model), dest)
    sections, nav = [], []
    for team, players in sorted(rosters["teams"].items()):
        cards = [card(p["model"], p["position"], sheets[p["model"]][1], "sheets/" + p["model"])
                 for p in players if p["model"] in sheets]
        if not cards:
            continue
        anchor = team.lower().replace(" ", "-")
        nav.append('<a href="#%s">%s</a>' % (anchor, html.escape(team)))
        sections.append('<section id="%s"><h2>%s</h2><div class="positions">%s</div></section>'
                        % (anchor, html.escape(team), "".join(cards)))
    page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" '
            'content="width=device-width,initial-scale=1"><title>Team looks</title><style>%s</style></head><body>'
            '<header><h1>Team looks</h1><nav>%s</nav><p class="note">Each position: every body in its own look, '
            'then each other option value on the first body. Poses: idle facing the camera, run side-on, idle '
            'from behind. 2x pixel density, shown at game zoom.</p></header><main>%s</main></body></html>'
            % (STYLE, "".join(nav), "".join(sections)))
    with open(os.path.join(out, "index.html"), "w") as fh:
        fh.write(page)
    print("PAGE %d teams, %d models -> %s" % (len(sections), len(sheets), out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
