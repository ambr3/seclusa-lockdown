#!/usr/bin/env python3
"""Regenerate Seclusa Lockdown icons.

    python3 tools/make_icons.py

Needs Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ICONS = HERE.parent / "static" / "icons"

SIZE = 1024
BG = (10, 10, 10, 255)
FG = (255, 255, 255, 255)
ACCENT = (249, 115, 22, 255)


def draw_mark(scale=1.0, colour=FG):
    s = int(SIZE * scale)
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # vault door
    d.rounded_rectangle([int(s * 0.22), int(s * 0.24), int(s * 0.78), int(s * 0.76)], radius=int(s * 0.05), fill=colour)
    # inner dark panel
    inset = [int(s * 0.30), int(s * 0.32), int(s * 0.70), int(s * 0.60)]
    d.rounded_rectangle(inset, radius=int(s * 0.03), fill=BG)
    # lock
    cx, cy = s // 2, int(s * 0.46)
    r = int(s * 0.045)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour)
    d.rounded_rectangle([cx - int(s * 0.02), cy, cx + int(s * 0.02), cy + int(s * 0.09)], radius=int(s * 0.01), fill=colour)
    # status bars
    y = int(s * 0.80)
    h = int(s * 0.028)
    for x0 in (0.24, 0.44, 0.64):
        d.rounded_rectangle([int(s * x0), y, int(s * (x0 + 0.12)), y + h], radius=h // 2, fill=ACCENT)
    return layer


def make_tile(scale, colour, size):
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark = draw_mark(scale, colour)
    out.paste(mark, (0, 0), mark)
    return out


def make_maskable(colour, size):
    out = Image.new("RGBA", (size, size), BG)
    inner = int(size * 0.72)
    mark = draw_mark(inner / SIZE, colour)
    off = (size - inner) // 2
    out.paste(mark, (off, off), mark)
    return out


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Seclusa Lockdown">
  <rect width="1024" height="1024" rx="200" fill="#0a0a0a"/>
  <rect x="220" y="250" width="584" height="524" rx="48" fill="#ffffff"/>
  <rect x="300" y="330" width="424" height="280" rx="28" fill="#0a0a0a"/>
  <circle cx="512" cy="470" r="46" fill="#ffffff"/>
  <rect x="490" y="470" width="44" height="90" rx="14" fill="#ffffff"/>
  <rect x="250" y="820" width="120" height="28" rx="10" fill="#f97316"/>
  <rect x="452" y="820" width="120" height="28" rx="10" fill="#f97316"/>
  <rect x="654" y="820" width="120" height="28" rx="10" fill="#f97316"/>
</svg>
"""


def main():
    ICONS.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        tile = make_tile(1.0, FG, size)
        # solid black plate under mark
        plate = Image.new("RGBA", (size, size), BG)
        plate.paste(tile, (0, 0), tile)
        plate.save(ICONS / f"icon-{size}.png")

    make_maskable(FG, 512).save(ICONS / "icon-maskable-512.png")
    (ICONS / "icon.svg").write_text(SVG, encoding="utf-8")

    for name in ("icon-192.png", "icon-512.png", "icon-maskable-512.png", "icon.svg"):
        print(f"static/icons/{name}")


if __name__ == "__main__":
    main()
