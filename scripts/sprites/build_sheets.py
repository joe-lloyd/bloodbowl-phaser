"""Turn Blender colour and mask frames into Phaser spritesheets.

    python3 scripts/sprites/build_sheets.py RENDERS_DIR OUT_DIR

For each size and animation it writes three sheets with one row per
direction and one column per frame:

    <anim>_base.png   the figure with a 1px dark outline
    <anim>_kit1.png   primary kit pixels only, greyscale, for setTint()
    <anim>_kit2.png   secondary kit pixels only, greyscale, for setTint()

and preview_<anim>.png, a composite in two sample team colours.
"""

import json
import sys
from pathlib import Path

from PIL import Image

OUTLINE = (24, 18, 22, 255)
PREVIEW_KITS = [((178, 34, 40), (230, 200, 70)), ((40, 80, 170), (235, 235, 235))]


def outline(img):
    """Add a 1px outline outside the silhouette, 4-connected."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3]:
                    dst[x, y] = OUTLINE
                    break
    return out


def split(color, mask):
    """Return (base, kit1, kit2) layers for one frame."""
    w, h = color.size
    c, m = color.load(), mask.load()
    kit1 = Image.new("RGBA", (w, h))
    kit2 = Image.new("RGBA", (w, h))
    k1, k2 = kit1.load(), kit2.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = c[x, y]
            if not a:
                continue
            mr, mg, _, _ = m[x, y]
            if mr > 127:
                k1[x, y] = (r, g, b, 255)
            elif mg > 127:
                k2[x, y] = (r, g, b, 255)
    return outline(color), kit1, kit2


def tint(layer, rgb):
    """What Phaser's setTint does: multiply the pixel by the tint colour."""
    px = layer.load()
    out = layer.copy()
    o = out.load()
    for y in range(layer.height):
        for x in range(layer.width):
            r, g, b, a = px[x, y]
            if a:
                o[x, y] = (r * rgb[0] // 255, g * rgb[1] // 255, b * rgb[2] // 255, a)
    return out


def main(renders, out):
    meta = json.loads((renders / "meta.json").read_text())
    dirs = meta["directions"]
    for size_name, info in meta["sizes"].items():
        px = info["frame"]
        for anim, n in meta["animations"].items():
            if not (renders / size_name / anim).exists():
                continue
            sheets = [Image.new("RGBA", (px * n, px * len(dirs))) for _ in range(3)]
            for row, d in enumerate(dirs):
                for f in range(n):
                    stem = renders / size_name / anim / f"{d}_{f}"
                    layers = split(
                        Image.open(f"{stem}_color.png").convert("RGBA"),
                        Image.open(f"{stem}_mask.png").convert("RGBA"),
                    )
                    for sheet, layer in zip(sheets, layers):
                        sheet.paste(layer, (f * px, row * px))
            dest = out / size_name
            dest.mkdir(parents=True, exist_ok=True)
            for sheet, part in zip(sheets, ("base", "kit1", "kit2")):
                sheet.save(dest / f"{anim}_{part}.png")
            for i, (p1, p2) in enumerate(PREVIEW_KITS):
                preview = sheets[0].copy()
                preview.alpha_composite(tint(sheets[1], p1))
                preview.alpha_composite(tint(sheets[2], p2))
                preview.save(dest / f"preview_{anim}_team{i}.png")
    (out / "meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
