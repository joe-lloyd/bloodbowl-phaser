"""Atlases, layers, review sheets and the merged manifest, in the game's current format.

Per model: sprites/<model>/{base,kit1,kit2}.png + .json (frames "anim/facing/index", trimmed, with
spriteSourceSize and sourceSize) and meta.json (frame, anchor, animations, ppu) for the manifest.
  base  the whole figure with its outline; kit areas are neutral grey here
  kit1  only the primary-kit pixels, as a grey ramp the game multiplies with the team's primary colour
  kit2  the same for the secondary colour
"""
import bpy, os, json
import numpy as np
from . import palette

GREEN = (0.36, 0.42, 0.33)
PPU = 25                    # value the game's manifest uses today; kept for compatibility
MAX_W = 2048

def _hex_rgb(h):
    return [int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]

def layers(idx, pal):
    """Index array -> (base, kit1, kit2) float RGBA arrays."""
    cols = np.array([_hex_rgb(h) for h in pal] + [[0, 0, 0]], dtype=np.float32)
    h, w = idx.shape
    solid = idx >= 0
    base = np.zeros((h, w, 4), np.float32)
    base[..., :3] = cols[idx]
    base[..., 3] = solid
    out = [base]
    for kit in ("kit1", "kit2"):
        lay = np.zeros((h, w, 4), np.float32)
        for hexc, g in zip(palette.KIT_MARKERS[kit], palette.KIT_GREYS):
            if hexc in pal:
                m = idx == pal.index(hexc)
                lay[m] = (g, g, g, 1)
                base[m, :3] = g
        out.append(lay)
    base[~solid] = 0
    return out

def tinted(lays, colours):
    """What the game shows: base, then each kit layer multiplied by its team colour."""
    out = lays[0].copy()
    for lay, hexc in zip(lays[1:], colours):
        m = lay[..., 3] > 0
        out[m, :3] = lay[m, :3] * np.array(_hex_rgb(hexc), dtype=np.float32)
    return out

def save_png(a, path):
    h, w = a.shape[:2]
    im = bpy.data.images.new("o", w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(a[::-1], dtype=np.float32).ravel())
    # save through the scene's image settings so PNG compression can be set (plain Image.save cannot)
    st = bpy.context.scene.render.image_settings
    old = (st.file_format, st.color_mode, st.compression)
    st.file_format, st.color_mode, st.compression = "PNG", "RGBA", 100
    try:
        im.save_render(path, scene=bpy.context.scene)
    finally:
        st.file_format, st.color_mode, st.compression = old
    bpy.data.images.remove(im)

def load_png(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1].copy()

def choose_frame(boxes, canvas_anchor, today_frame, pad):
    """Smallest square frame (today's size, or larger in steps of 32) that holds every frame's pixels.
    Returns (frame, anchor in the frame, offset of the frame window inside the canvas, clipped?)."""
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    frame = today_frame
    while True:
        anchor = (frame // 2, int(round(frame * 0.605)))
        ox, oy = canvas_anchor[0] - anchor[0], canvas_anchor[1] - anchor[1]
        fits = x0 >= ox and y0 >= oy and x1 <= ox + frame and y1 <= oy + frame
        if fits or frame >= today_frame + 2 * pad:
            return frame, anchor, (ox, oy), not fits
        frame += 32

def pack(out_dir, key, frames, pal, canvas_anchor, today_frame, pad, anims):
    """frames: {"anim/facing/i": index array on the render canvas}. Writes the three atlases and meta.json."""
    boxes = {}
    for name, idx in frames.items():
        ys, xs = np.nonzero(idx >= 0)
        boxes[name] = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(ys) else (canvas_anchor[0], canvas_anchor[1] - 1, canvas_anchor[0] + 1, canvas_anchor[1])
    frame, anchor, (ox, oy), clipped = choose_frame(list(boxes.values()), canvas_anchor, today_frame, pad)
    names = sorted(frames)
    rects, x, y, rowh, width = {}, 0, 0, 0, 0
    for n in names:
        bx0, by0, bx1, by1 = boxes[n]
        bx0, by0 = max(bx0, ox), max(by0, oy)
        bx1, by1 = min(bx1, ox + frame), min(by1, oy + frame)
        w, h = max(bx1 - bx0, 1), max(by1 - by0, 1)
        if x + w > MAX_W:
            x, y, rowh = 0, y + rowh + 1, 0
        rects[n] = (x, y, w, h, bx0, by0)
        x += w + 1
        rowh = max(rowh, h)
        width = max(width, x)
    height = y + rowh
    sheets = [np.zeros((height, width, 4), np.float32) for _ in range(3)]
    meta_frames = {}
    for n in names:
        x, y, w, h, bx0, by0 = rects[n]
        lays = layers(frames[n][by0:by0 + h, bx0:bx0 + w], pal)
        for sh, lay in zip(sheets, lays):
            sh[y:y + h, x:x + w] = lay
        meta_frames[n] = {"frame": {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}, "rotated": False, "trimmed": True,
                          "spriteSourceSize": {"x": int(bx0 - ox), "y": int(by0 - oy), "w": int(w), "h": int(h)},
                          "sourceSize": {"w": int(frame), "h": int(frame)}}
    d = os.path.join(out_dir, "sprites", key)
    os.makedirs(d, exist_ok=True)
    for lname, sh in zip(("base", "kit1", "kit2"), sheets):
        save_png(sh, os.path.join(d, lname + ".png"))
        with open(os.path.join(d, lname + ".json"), "w") as fh:
            json.dump({"frames": meta_frames, "meta": {"image": lname + ".png", "scale": "1"}}, fh)
    meta = {"anchor": [float(anchor[0]), float(anchor[1])], "animations": anims, "frame": int(frame), "ppu": PPU,
            "clipped": bool(clipped)}
    with open(os.path.join(d, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    return meta

# ----------------------------------------------------------------- review sheets
FONT = {
    "A": "010101111101101", "B": "110101110101110", "C": "011100100100011", "D": "110101101101110", "E": "111100110100111",
    "F": "111100110100100", "G": "011100101101011", "H": "101101111101101", "I": "111010010010111", "J": "001001001101010",
    "K": "101101110101101", "L": "100100100100111", "M": "101111111101101", "N": "110101101101101", "O": "010101101101010",
    "P": "110101110100100", "Q": "010101101110011", "R": "110101110101101", "S": "011100010001110", "T": "111010010010010",
    "U": "101101101101111", "V": "101101101101010", "W": "101101111111101", "X": "101101010101101", "Y": "101101010010010",
    "Z": "111001010100111", "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
    "4": "101101111001001", "5": "111100110001110", "6": "011100110101010", "7": "111001010010010", "8": "010101010101010",
    "9": "010101011001110", " ": "000000000000000", "_": "000000000000111", "-": "000000111000000", "/": "001001010100100",
}

def text(img, x, y, s, scale=2, colour=(0.95, 0.95, 0.9)):
    """Draw upper-case text with a 3x5 pixel font."""
    for ch in s.upper():
        g = FONT.get(ch, FONT[" "])
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == "1":
                    yy, xx = y + r * scale, x + c * scale
                    if 0 <= yy and yy + scale <= img.shape[0] and 0 <= xx and xx + scale <= img.shape[1]:
                        img[yy:yy + scale, xx:xx + scale, :3] = colour
                        img[yy:yy + scale, xx:xx + scale, 3] = 1
        x += 4 * scale

def on_green(rgba, scale=3):
    out = np.empty(rgba.shape, np.float32)
    out[..., :3] = GREEN
    out[..., 3] = 1
    al = rgba[..., 3:4]
    out[..., :3] = rgba[..., :3] * al + out[..., :3] * (1 - al)
    return out.repeat(scale, 0).repeat(scale, 1)

def model_sheet(out_dir, key, frames, pal, colours, anims, facings):
    """Rows: each animation in the se facing; last row: the facings of idle frame 0. 3x on pitch green."""
    allb = [np.nonzero(v >= 0) for v in frames.values()]
    ys = np.concatenate([b[0] for b in allb]); xs = np.concatenate([b[1] for b in allb])
    y0, y1, x0, x1 = ys.min() - 1, ys.max() + 2, xs.min() - 1, xs.max() + 2
    ch, cw = y1 - y0, x1 - x0
    rows = [[("%s/se/%d" % (a, i)) for i in range(n)] for a, n in anims.items() if ("%s/se/0" % a) in frames]
    rows.append(["idle/%s/0" % f for f in facings if ("idle/%s/0" % f) in frames])
    ncol = max(len(r) for r in rows)
    sheet = np.zeros((ch * len(rows), cw * ncol, 4), np.float32)
    for r, row in enumerate(rows):
        for c, name in enumerate(row):
            if name in frames:
                sheet[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = tinted(layers(frames[name][y0:y1, x0:x1], pal), colours)
    img = on_green(sheet)
    labels = [a for a, n in anims.items() if ("%s/se/0" % a) in frames] + ["facings"]
    for r, lab in enumerate(labels):
        text(img, 2, r * ch * 3 + 2, lab)
    os.makedirs(os.path.join(out_dir, "sheets"), exist_ok=True)
    save_png(img, os.path.join(out_dir, "sheets", key + ".png"))

def read_frame(out_dir, key, name, colours):
    """One frame from a finished atlas, tinted, on its untrimmed frame."""
    d = os.path.join(out_dir, "sprites", key)
    meta = json.load(open(os.path.join(d, "base.json")))["frames"][name]
    f, s, src = meta["frame"], meta["spriteSourceSize"], meta["sourceSize"]
    lays = []
    for lname in ("base", "kit1", "kit2"):
        sheet = load_png(os.path.join(d, lname + ".png"))
        full = np.zeros((src["h"], src["w"], 4), np.float32)
        full[s["y"]:s["y"] + s["h"], s["x"]:s["x"] + s["w"]] = sheet[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
        lays.append(full)
    return tinted(lays, colours), json.load(open(os.path.join(d, "meta.json")))

def safe_name(team):
    return "".join(c if c.isalnum() else "_" for c in team)

def team_sheet(out_dir, team, positions, colours):
    """Idle se lineup of a team's positions, feet on one line, with position names. Skips missing models."""
    cells = []
    for pos, key in positions:
        if not os.path.exists(os.path.join(out_dir, "sprites", key, "meta.json")):
            continue
        img, meta = read_frame(out_dir, key, "idle/se/0", colours)
        ys, xs = np.nonzero(img[..., 3] > 0)
        ay = int(meta["anchor"][1])
        cells.append((pos, key, img[:, xs.min() - 2:xs.max() + 3], ay - ys.min() + 2, img.shape[0] - ay))
    if not cells:
        return False
    up = max(c[3] for c in cells)
    down = max(8, max(min(c[4], 14) for c in cells))
    widths = [max(c[2].shape[1], (len(c[0]) * 8 + 6) // 3 + 1) for c in cells]
    sheet = np.zeros((up + down, sum(widths), 4), np.float32)
    x = 0
    for (pos, key, img, a_up, a_dn), w in zip(cells, widths):
        ay = img.shape[0] - a_dn
        src = img[max(ay - up, 0):min(ay + down, img.shape[0])]
        top = up - (ay - max(ay - up, 0))
        ox = x + (w - img.shape[1]) // 2
        sheet[top:top + src.shape[0], ox:ox + img.shape[1]] = src
        x += w
    img = on_green(sheet)
    band = np.empty((16, img.shape[1], 4), np.float32); band[..., :3] = [g * 0.7 for g in GREEN]; band[..., 3] = 1
    img = np.concatenate([img, band], axis=0)
    x = 0
    for (pos, key, _, _, _), w in zip(cells, widths):
        text(img, x * 3 + 3, img.shape[0] - 13, pos)
        x += w
    os.makedirs(os.path.join(out_dir, "sheets"), exist_ok=True)
    save_png(img, os.path.join(out_dir, "sheets", "team_%s.png" % safe_name(team)))
    return True

def write_manifest(out_dir, rosters, facings):
    """Merge every finished model's meta.json into manifest.json in the game's format."""
    models = {}
    sdir = os.path.join(out_dir, "sprites")
    for key in sorted(os.listdir(sdir)) if os.path.isdir(sdir) else []:
        mp = os.path.join(sdir, key, "meta.json")
        if os.path.exists(mp):
            m = json.load(open(mp))
            models[key] = {"anchor": m["anchor"], "animations": m["animations"], "frame": m["frame"], "ppu": m["ppu"]}
    positions = {team: {p["position"]: p["model"] for p in plist} for team, plist in rosters["teams"].items()}
    with open(os.path.join(out_dir, "manifest.json"), "w") as fh:
        json.dump({"directions": facings, "models": models, "positions": positions}, fh, indent=1, sort_keys=True)
    missing = sorted({m for t in positions.values() for m in t.values()} - set(models))
    return len(models), missing
