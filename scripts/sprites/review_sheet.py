"""Review sheet: every model of a team, cropped tight, at detail size.

    python3 scripts/sprites/review_sheet.py RENDERS_DIR TEAM OUT.png [--dirs se,sw] [--zoom 2]

Unlike team_sheet.py this drops the pitch square and crops each sprite to its
pixels, so a whole team fits one image that is big enough to judge shapes.
Each model shows once per facing, left to right, on one shared baseline.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
g = {"__file__": str(HERE / "team_sheet.py")}
exec((HERE / "team_sheet.py").read_text().split("def main")[0], g)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("renders", type=Path)
    ap.add_argument("team")
    ap.add_argument("out", type=Path)
    ap.add_argument("--dirs", default="se,sw")
    ap.add_argument("--zoom", type=int, default=2)
    a = ap.parse_args()
    d = g["load_data"]()
    k1, k2 = (g["rgb"](c) for c in d["KITS"][a.team])
    seen, cells = set(), []
    for pos, model in d["TEAMS"][a.team]:
        if model in seen or not (a.renders / model / "meta.json").exists():
            continue
        seen.add(model)
        anchor_y = json.loads((a.renders / model / "meta.json").read_text())["sizes"]["hi"]["anchor"][1]
        for di in a.dirs.split(","):
            stem = a.renders / model / "hi" / "idle" / f"{di}_0"
            im = g["outline"](g["tinted"](Image.open(f"{stem}_color.png").convert("RGBA"),
                                          Image.open(f"{stem}_mask.png").convert("RGBA"), k1, k2))
            box = im.getbbox()
            cells.append((pos if di == a.dirs.split(",")[0] else "", im.crop(box), anchor_y - box[1]))
    z = a.zoom
    top = max(feet for _, _, feet in cells)
    below = max(im.height - feet for _, im, feet in cells)
    height = int((top + below) * z) + 30
    width = sum(im.width * z + 14 for _, im, _ in cells) + 14
    sheet = Image.new("RGB", (width, height), (10, 8, 18))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=14)
    x = 14
    for label, im, feet in cells:
        big = im.resize((im.width * z, im.height * z), Image.NEAREST)
        sheet.paste(big, (x, int((top - feet) * z) + 4), big)
        if label:
            draw.text((x, height - 20), label, fill=k1, font=font)
        x += big.width + 14
    sheet.save(a.out)


if __name__ == "__main__":
    main()
