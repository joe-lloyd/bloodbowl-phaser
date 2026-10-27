"""Generate character concept sketches with ComfyUI on Jellybingus.

    ssh -f -N -L 18188:192.168.2.9:8188 jellybingus
    python3 scripts/sprites/concepts.py OUT_DIR [--seeds 2] [--only orc,goblin]

Every character is drawn in every style, once per seed. Images land in
OUT_DIR/<style>/<character>_<seed>.png. Pixel-style images also get a
true-pixel copy, shrunk 8x with nearest-neighbour, as <character>_<seed>_px.png.
"""

import argparse
import json
import random
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image

API = "http://127.0.0.1:18188"
JUGGERNAUT = "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors"
NOOB = "NoobAI-XL-v1.1.safetensors"

CHARACTERS = {
    "orc": dict(
        name="Orc lineman",
        prose="a hulking green-skinned orc fantasy football lineman, jutting tusks, scarred brutish face, "
        "crude iron shoulder plates bolted over spiked leather, battered horned helmet, "
        "holding a spiked leather football, red and black team colours",
        tags="1boy, orc, green skin, tusks, muscular, scar, horned helmet, spiked shoulder armor, leather armor, "
        "holding ball, red and black clothes",
    ),
    "human": dict(
        name="Human lineman",
        prose="a sturdy human fantasy football lineman, stubbled working-class face, padded leather jerkin, "
        "steel shoulder pads, open-faced iron helmet, mud-stained blue and white team colours, "
        "leather football tucked under one arm",
        tags="1boy, human, stubble, open-faced helmet, shoulder pads, leather armor, holding ball, "
        "blue and white clothes, mud",
    ),
    "elf": dict(
        name="Elf lineman",
        prose="a slender graceful high elf fantasy football player, long pale blond hair under a winged helm, "
        "ornate fitted light armour, calm haughty expression, poised athletic stance, "
        "white and gold team colours, spinning a football on one finger",
        tags="1boy, elf, pointy ears, long blonde hair, winged helmet, ornate light armor, slender, "
        "white and gold clothes, holding ball",
    ),
    "witch_elf": dict(
        name="Witch elf",
        prose="a female dark elf witch elf fantasy football blitzer, pale skin, wild white hair, "
        "frenzied snarl, purple war paint, armoured black and purple leather bodysuit, "
        "spiked bracers and greaves, crouched ready to pounce",
        tags="1girl, dark elf, pale skin, white hair, wild hair, pointy ears, facepaint, angry, "
        "black and purple armored bodysuit, spiked bracers, crouching, fighting stance",
    ),
    "goblin": dict(
        name="Goblin",
        prose="a small scrawny goblin fantasy football player, huge pointed ears, long hooked nose, "
        "sly toothy grin, oversized dented helmet slipping over its eyes, patched leather armour, "
        "clutching a football much too big for it",
        tags="goblin, green skin, short, huge pointy ears, big nose, grin, sharp teeth, oversized helmet, "
        "patched leather armor, holding ball",
    ),
    "gnome": dict(
        name="Gnome",
        prose="a short stout gnome fantasy football player, bushy beard, round red nose, mischievous eyes, "
        "tall pointed leather cap-helmet, tinkerer goggles, quilted padded armour with brass buckles, "
        "green and brown team colours",
        tags="gnome, old man, short, beard, big nose, pointed hat, goggles, padded armor, brass buckles, "
        "green and brown clothes, mischievous",
    ),
    "vampire": dict(
        name="Vampire",
        prose="an aristocratic vampire fantasy football runner, deathly pale skin, glowing red eyes, fangs, "
        "slicked-back black hair, gothic black and crimson armour with a high collar, "
        "tattered short cape, cold predatory smile",
        tags="1boy, vampire, pale skin, red eyes, fangs, slicked back hair, gothic armor, high collar, "
        "black and crimson clothes, cape, smirk",
    ),
}

STYLES = {
    "grimdark": dict(
        name="Grimdark oil painting",
        model=JUGGERNAUT,
        prompt="traditional oil painting on canvas of {prose}, full body, on a muddy torn-up pitch, "
        "1990s grimdark fantasy wargame illustration, thick visible brushstrokes, impasto, "
        "dramatic chiaroscuro, muted earthy palette with one bold kit colour",
        negative="photo, photograph, photorealistic, cosplay, cgi, 3d render, text, watermark, logo, "
        "blurry, extra limbs, cropped",
        cfg=6.0,
        sampler=("dpmpp_2m", "karras"),
    ),
    "pixel": dict(
        name="Pixel-art sprite",
        model=JUGGERNAUT,
        lora=("pixel-art-xl.safetensors", 1.0),
        prompt="pixel art, {prose}, full body game sprite, three-quarter top-down view, "
        "standing on plain flat green grass background, limited palette, crisp pixels, 16-bit",
        negative="photo, 3d render, blurry, smooth gradients, text, watermark, cropped",
        cfg=5.0,
        sampler=("dpmpp_2m", "karras"),
    ),
    "toy": dict(
        name="Chunky 3D toy",
        model=JUGGERNAUT,
        prompt="cute stylized 3d vinyl toy figurine of {prose}, full body, super-deformed proportions, "
        "huge head, stubby short legs, oversized hands and feet, smooth matte plastic, "
        "hand-painted colours, mobile game hero render, plain warm grey studio background, soft key light",
        negative="photo, realistic, realistic proportions, tall, skin pores, text, watermark, blurry, "
        "cropped, extra limbs",
        cfg=5.0,
        sampler=("dpmpp_2m", "karras"),
    ),
    "anime": dict(
        name="Anime cel shading",
        model=NOOB,
        prompt="masterpiece, best quality, newest, {tags}, fantasy american football player, "
        "full body, standing, dynamic pose, cel shading, bold lineart, simple background, grass",
        negative="nsfw, nude, cleavage, revealing clothes, worst quality, low quality, text, watermark, "
        "signature, cropped, extra limbs",
        cfg=5.0,
        sampler=("euler_ancestral", "normal"),
    ),
    "sketch": dict(
        name="Pencil and ink sketch",
        model=JUGGERNAUT,
        prompt="rough monochrome graphite pencil sketch of {prose}, full body, loose gestural lines, "
        "unfinished hatching, construction lines, sketchbook page, off-white paper, concept artist's thumbnail",
        negative="colour, color, painted, finished illustration, photo, 3d render, text, watermark, "
        "blurry, cropped",
        cfg=5.0,
        sampler=("dpmpp_2m", "karras"),
    ),
}

NSFW_GUARD = "nsfw, nude, cleavage, revealing clothes"


def workflow(style, character, seed):
    s, c = STYLES[style], CHARACTERS[character]
    positive = s["prompt"].format(prose=c["prose"], tags=c["tags"])
    negative = s["negative"] if NSFW_GUARD in s["negative"] else f"{NSFW_GUARD}, {s['negative']}"
    model_out = ["1", 0]
    clip_out = ["1", 1]
    graph = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": s["model"]}},
    }
    if "lora" in s:
        name, strength = s["lora"]
        graph["9"] = {
            "class_type": "LoraLoader",
            "inputs": {"model": model_out, "clip": clip_out, "lora_name": name,
                       "strength_model": strength, "strength_clip": strength},
        }
        model_out, clip_out = ["9", 0], ["9", 1]
    graph.update({
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_out, "text": positive}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": clip_out, "text": negative}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": model_out, "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": 30, "cfg": s["cfg"], "sampler_name": s["sampler"][0],
            "scheduler": s["sampler"][1], "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": f"bb_{style}_{character}"}},
    })
    return graph


def post(path, body):
    req = urllib.request.Request(API + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))


def get(path):
    return urllib.request.urlopen(API + path).read()


def run(graph):
    prompt_id = post("/prompt", {"prompt": graph})["prompt_id"]
    while True:
        hist = json.loads(get(f"/history/{prompt_id}"))
        if prompt_id in hist:
            entry = hist[prompt_id]
            if entry["status"].get("status_str") == "error":
                raise RuntimeError(json.dumps(entry["status"])[:800])
            img = entry["outputs"]["7"]["images"][0]
            q = f"/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"
            return get(q)
        time.sleep(0.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--only", default="")
    ap.add_argument("--styles", default="")
    args = ap.parse_args()
    chars = args.only.split(",") if args.only else list(CHARACTERS)
    styles = args.styles.split(",") if args.styles else list(STYLES)
    styles.sort(key=lambda k: STYLES[k]["model"] != JUGGERNAUT)  # one checkpoint swap
    rng = random.Random(1987)
    seeds = [rng.randrange(2**31) for _ in range(args.seeds)]
    for style in styles:
        for character in chars:
            for i, seed in enumerate(seeds):
                dest = args.out / style / f"{character}_{i}.png"
                if dest.exists():
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                t = time.time()
                dest.write_bytes(run(workflow(style, character, seed)))
                if style == "pixel":
                    im = Image.open(dest)
                    im.resize((im.width // 8, im.height // 8), Image.NEAREST).save(dest.with_name(f"{character}_{i}_px.png"))
                print(f"{style}/{character}_{i} seed {seed} {time.time() - t:.1f}s", flush=True)
    meta = {
        "characters": {k: v["name"] for k, v in CHARACTERS.items()},
        "styles": {k: v["name"] for k, v in STYLES.items()},
        "seeds": seeds,
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    sys.exit(main())
