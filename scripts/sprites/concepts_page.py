"""Build the concept-sketch review page from concepts.py output.

    python3 scripts/sprites/concepts_page.py IMAGES_DIR PAGE_DIR

Writes PAGE_DIR/index.html with WebP copies of every image: a 300 px thumb
and a full-size view. The text for each style lives in NOTES below.
"""

import html
import json
import sys
from pathlib import Path

from PIL import Image

NOTES = json.loads((Path(__file__).with_name("concepts_notes.json")).read_text())


def main(src, dest):
    meta = json.loads((src / "meta.json").read_text())
    img_dir = dest / "img"
    img_dir.mkdir(parents=True, exist_ok=True)
    seeds = range(len(meta["seeds"]))

    def export(style, char, i):
        stem = f"{style}_{char}_{i}"
        im = Image.open(src / style / f"{char}_{i}.png").convert("RGB")
        im.save(img_dir / f"{stem}.webp", quality=86)
        im.resize((300, round(300 * im.height / im.width)), Image.LANCZOS).save(img_dir / f"{stem}_t.webp", quality=82)
        px = src / style / f"{char}_{i}_px.png"
        if px.exists():
            Image.open(px).save(img_dir / f"{stem}_px.png")
        return stem

    head_cells = "".join(f'<th scope="col">{html.escape(n)}</th>' for n in meta["styles"].values())
    rows = []
    for char, char_name in meta["characters"].items():
        cells = []
        for style in meta["styles"]:
            imgs = []
            for i in seeds:
                stem = export(style, char, i)
                alt = f"{char_name}, {meta['styles'][style]}, take {i + 1}"
                px = f' data-px="img/{stem}_px.png"' if (img_dir / f"{stem}_px.png").exists() else ""
                imgs.append(
                    f'<button class="shot seed{i}" data-full="img/{stem}.webp"{px} data-cap="{html.escape(alt)}">'
                    f'<img loading="lazy" src="img/{stem}_t.webp" alt="{html.escape(alt)}"></button>'
                )
            cells.append(f"<td>{''.join(imgs)}</td>")
        rows.append(f'<tr><th scope="row">{html.escape(char_name)}</th>{"".join(cells)}</tr>')

    style_notes = "".join(
        f"<section><h3>{html.escape(meta['styles'][k])}</h3><p>{NOTES['styles'][k]}</p></section>"
        for k in meta["styles"]
    )
    char_notes = "".join(
        f"<li><b>{html.escape(meta['characters'][k])}.</b> {v}</li>" for k, v in NOTES["characters"].items()
    )
    page = TEMPLATE.format(
        intro=NOTES["intro"], head=head_cells, rows="".join(rows), style_notes=style_notes,
        verdict=NOTES["verdict"], char_notes=char_notes, method=NOTES["method"],
    )
    (dest / "index.html").write_text(page)


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Character concept sketches, 27 October 2026</title>
<style>
  :root {{ color-scheme: dark; --bg: #18181a; --panel: #232326; --line: #36363b; --text: #dcddde; --dim: #8e8e95; --accent: #e6c84a; }}
  * {{ box-sizing: border-box; }}
  html, body {{ background: var(--bg); color: var(--text); }}
  body {{ margin: 0; font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }}
  main {{ max-width: 1500px; margin: 0 auto; padding: 36px 22px 80px; }}
  h1 {{ color: #fff; font-size: 28px; margin: 0 0 6px; }}
  h2 {{ color: #fff; font-size: 21px; margin: 44px 0 10px; }}
  h3 {{ color: #fff; font-size: 16px; margin: 0 0 4px; }}
  p, li {{ max-width: 76ch; }}
  .dim {{ color: var(--dim); }}
  .verdict {{ background: var(--panel); border-left: 3px solid var(--accent); padding: 14px 18px; border-radius: 6px; margin: 20px 0; }}
  .verdict p {{ margin: 0 0 8px; }} .verdict p:last-child {{ margin: 0; }}
  .bar {{ display: flex; gap: 8px; align-items: center; margin: 14px 0; position: sticky; top: 0; background: var(--bg); padding: 8px 0; z-index: 2; }}
  .bar span {{ color: var(--dim); font-size: 14px; }}
  .bar button {{ background: #2e2e33; color: var(--text); border: 1px solid #45454c; border-radius: 6px; padding: 6px 12px; font: inherit; font-size: 14px; cursor: pointer; }}
  .bar button[aria-pressed="true"] {{ background: var(--accent); color: #18181a; border-color: var(--accent); }}
  .wrap {{ overflow-x: auto; }}
  table {{ border-collapse: separate; border-spacing: 8px; min-width: 1100px; }}
  thead th {{ color: var(--dim); font-weight: 500; font-size: 14px; text-align: left; padding: 0 2px; }}
  tbody th {{ color: #fff; font-weight: 600; font-size: 15px; text-align: left; vertical-align: middle; width: 110px; }}
  td {{ background: var(--panel); border-radius: 8px; padding: 0; vertical-align: top; }}
  .shot {{ display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }}
  .shot img {{ display: block; width: 100%; aspect-ratio: 832 / 1216; object-fit: cover; border-radius: 8px; }}
  body.s0 .seed1, body.s1 .seed0 {{ display: none; }}
  .notes {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }}
  .notes section {{ background: var(--panel); border-radius: 8px; padding: 14px 16px; }}
  .notes p {{ margin: 0; font-size: 15px; }}
  dialog {{ background: #0f0f10; color: var(--text); border: 1px solid var(--line); border-radius: 10px; padding: 14px; max-width: 96vw; max-height: 96vh; }}
  dialog::backdrop {{ background: rgba(0,0,0,.8); }}
  dialog .imgs {{ display: flex; gap: 14px; align-items: flex-start; }}
  dialog img {{ max-height: 82vh; max-width: 70vw; border-radius: 6px; display: block; }}
  dialog img.px {{ image-rendering: pixelated; height: 82vh; width: auto; }}
  dialog .cap {{ margin-top: 8px; color: var(--dim); font-size: 14px; display: flex; justify-content: space-between; gap: 12px; }}
  dialog button {{ background: #2e2e33; color: var(--text); border: 1px solid #45454c; border-radius: 6px; padding: 4px 10px; font: inherit; font-size: 14px; cursor: pointer; }}
</style>
</head>
<body class="s0">
<main>
  <h1>Character concept sketches</h1>
  <p class="dim">27 October 2026 · seven players in five styles, two takes each · generated with ComfyUI on Jellybingus</p>
  <div class="verdict">{intro}</div>

  <div class="bar"><span>Take</span><button data-seed="0" aria-pressed="true">A</button><button data-seed="1" aria-pressed="false">B</button><span>Click any image to enlarge it. Pixel images also show the real 8× shrunk sprite.</span></div>
  <div class="wrap"><table>
    <thead><tr><th></th>{head}</tr></thead>
    <tbody>{rows}</tbody>
  </table></div>

  <h2>The five styles</h2>
  <div class="notes">{style_notes}</div>

  <h2>My pick</h2>
  <div class="verdict">{verdict}</div>

  <h2>Per character</h2>
  <ul>{char_notes}</ul>

  <h2>How these were made</h2>
  {method}
</main>
<dialog id="view">
  <div class="imgs"><img id="full" alt=""><img id="px" class="px" alt="The same image shrunk to true pixel size and scaled back up"></div>
  <div class="cap"><span id="cap"></span><button id="close">Close</button></div>
</dialog>
<script>
  const view = document.getElementById("view");
  document.querySelectorAll(".shot").forEach((b) => b.addEventListener("click", () => {{
    document.getElementById("full").src = b.dataset.full;
    const px = document.getElementById("px");
    px.hidden = !b.dataset.px;
    if (b.dataset.px) px.src = b.dataset.px;
    document.getElementById("cap").textContent = b.dataset.cap;
    view.showModal();
  }}));
  document.getElementById("close").addEventListener("click", () => view.close());
  view.addEventListener("click", (e) => {{ if (e.target === view) view.close(); }});
  document.querySelectorAll("[data-seed]").forEach((b) => b.addEventListener("click", () => {{
    document.body.className = "s" + b.dataset.seed;
    document.querySelectorAll("[data-seed]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  }}));
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
