"""Build the game type picker's pitch cards from the shipped venue art.

    python3 scripts/sprites/venue_cards.py

For the stadium and every folder in public/venues, this tints the kit
layers (home and away, or the Deathbowl arena's four seats) the way
Stadium.ts does in the game, crops a 16:9 frame
around the pitch from meta.json, and writes card.webp next to the layers.
Rerun it whenever a venue is rendered again.
"""

import json
from pathlib import Path

from PIL import Image, ImageChops

REPO = Path(__file__).resolve().parents[2]
VENUES = [REPO / "public" / "stadium" / "bloodbowl"] + sorted(
    p for p in (REPO / "public" / "venues").iterdir() if (p / "meta.json").exists()
)
KITS = {
    "home": (178, 34, 34), "away": (40, 90, 170),
    "north": (178, 34, 34), "east": (40, 90, 170), "south": (214, 160, 40), "west": (60, 140, 70),
}
SIZE = (640, 360)
MARGIN = 0.1


def flattened(folder):
    out = Image.open(folder / "base.webp").convert("RGBA")
    for layer, colour in KITS.items():
        if not (folder / f"{layer}.webp").exists():
            continue
        kit = Image.open(folder / f"{layer}.webp").convert("RGBA")
        tinted = ImageChops.multiply(kit.convert("RGB"), Image.new("RGB", kit.size, colour))
        tinted.putalpha(kit.getchannel("A"))
        out = Image.alpha_composite(out, tinted)
    return out.convert("RGB")


def pitch_box(meta):
    lo = meta["sizes"]["lo"]
    (ox, oy), gx, gy = lo["origin"], lo["gx"], lo["gy"]
    corners = [
        (ox + x * gx[0] + y * gy[0], oy + x * gx[1] + y * gy[1])
        for x in (0, meta["cols"])
        for y in (0, meta["rows"])
    ]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    return min(xs), min(ys), max(xs), max(ys)


def frame(box, image_size):
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    width, height = width * (1 + 2 * MARGIN), height * (1 + 2 * MARGIN)
    aspect = SIZE[0] / SIZE[1]
    if width / height < aspect:
        width = height * aspect
    else:
        height = width / aspect
    cx, cy = (left + right) / 2, (top + bottom) / 2
    x0 = min(max(0, cx - width / 2), image_size[0] - width)
    y0 = min(max(0, cy - height / 2), image_size[1] - height)
    return int(x0), int(y0), int(x0 + width), int(y0 + height)


def card(folder):
    meta = json.loads((folder / "meta.json").read_text())
    image = flattened(folder)
    crop = image.crop(frame(pitch_box(meta), image.size))
    crop.resize(SIZE, Image.LANCZOS).save(folder / "card.webp", quality=82, method=6)
    return folder.relative_to(REPO)


if __name__ == "__main__":
    for folder in VENUES:
        print("card", card(folder))
