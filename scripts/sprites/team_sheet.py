"""Contact sheet of one team: each model standing on a pitch square, to scale.

    python3 scripts/sprites/team_sheet.py RENDERS_DIR TEAM OUT.png [--dir se] [--zoom 3] [--size lo|hi]

RENDERS_DIR holds one folder per model, straight from render_models.py. The
square is drawn at SQUARE_M from team_models.py, so sizes compare honestly.
Kits are tinted with the team's colours the same way Phaser's setTint does.
"""

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent


def load_data():
    """team_models.py needs SKIN; read it through model_kit's table."""
    g = {}
    exec((HERE / "model_kit.py").read_text().split("SIDES =")[0], g)
    exec((HERE / "team_models.py").read_text(), g)
    return g


def rgb(c):
    return ((c >> 16) & 255, (c >> 8) & 255, c & 255)


def tinted(color, mask, kit1, kit2):
    """Composite one frame: base with kit pixels multiplied by the team colour."""
    out = color.copy()
    px, m = out.load(), mask.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            mr, mg = m[x, y][0], m[x, y][1]
            tint = kit1 if mr > 127 else kit2 if mg > 127 else None
            if tint:
                px[x, y] = (r * tint[0] // 255, g * tint[1] // 255, b * tint[2] // 255, a)
    return out


def outline(img, color=(24, 18, 22, 255)):
    src = img.load()
    out = img.copy()
    dst = out.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            if any(0 <= nx < w and 0 <= ny < h and src[nx, ny][3] for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                dst[x, y] = color
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("renders", type=Path)
    ap.add_argument("team")
    ap.add_argument("out", type=Path)
    ap.add_argument("--dir", default="se")
    ap.add_argument("--frame", type=int, default=0)
    ap.add_argument("--zoom", type=int, default=3)
    ap.add_argument("--size", default="lo", choices=("lo", "hi"))
    a = ap.parse_args()
    d = load_data()
    kit1, kit2 = (rgb(c) for c in d["KITS"][a.team])
    z = a.zoom
    ppu = 25 if a.size == "lo" else 50  # pixels per metre
    tile_w = d["SQUARE_M"] * math.sqrt(2) * ppu
    cells = []
    for pos, model in d["TEAMS"][a.team]:
        meta = json.loads((a.renders / model / "meta.json").read_text())["sizes"][a.size]
        stem = a.renders / model / a.size / "idle" / f"{a.dir}_{a.frame}"
        img = outline(tinted(Image.open(f"{stem}_color.png").convert("RGBA"),
                             Image.open(f"{stem}_mask.png").convert("RGBA"), kit1, kit2))
        cells.append((pos, img, meta["anchor"]))
    cw = int(max(tile_w, max(i.width for _, i, _ in cells)) * z) + 16
    top = max(anc[1] for _, _, anc in cells)
    bottom = max(i.height - anc[1] for _, i, anc in cells)
    ch = int((top + max(bottom, tile_w / 4)) * z) + 40
    sheet = Image.new("RGB", (cw * len(cells), ch), (10, 8, 18))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=15)
    for i, (pos, img, (ax, ay)) in enumerate(cells):
        cx, cy = i * cw + cw / 2, top * z + 8
        hw, hh = tile_w * z / 2, tile_w * z / 4
        draw.polygon([(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)], fill=(20, 16, 32), outline=(120, 40, 100))
        big = img.resize((img.width * z, img.height * z), Image.NEAREST)
        sheet.paste(big, (int(cx - ax * z), int(cy - ay * z)), big)
        draw.text((cx, ch - 22), pos, fill=kit1, font=font, anchor="mm")
    sheet.save(a.out)


if __name__ == "__main__":
    main()
