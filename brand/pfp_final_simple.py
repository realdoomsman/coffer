"""Coffer PFP — FINAL (simplified).

Single element, no lugs. Just the vault ring and solid core.
Regenerate:  python pfp_final_simple.py
"""
from PIL import Image, ImageDraw
import os

INK        = (10, 10, 8)
PANEL      = (18, 18, 16)
LINE2      = (56, 56, 47)
AMBER      = (255, 176, 0)
AMBER_DEEP = (198, 136, 0)

S, SS = 400, 4
C = S * SS // 2
U = SS
OUT = os.path.dirname(os.path.abspath(__file__))

BAND_R, BAND_W, CORE, PUPIL = 132, 36, 72, 32


def build():
    img = Image.new("RGB", (S * SS, S * SS), INK)
    d = ImageDraw.Draw(img)

    def disc(r, color):
        d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U], fill=color)

    def ring(r, color, w):
        d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U],
                  outline=color, width=w * U)

    disc(190, PANEL)
    ring(190, LINE2, 2)

    ring(BAND_R, AMBER_DEEP, BAND_W + 8)
    ring(BAND_R, AMBER, BAND_W)

    disc(CORE, AMBER)
    disc(CORE - 8, AMBER_DEEP)
    disc(PUPIL, INK)

    return img.resize((S, S), Image.LANCZOS)


def circle_crop(im):
    m = Image.new("L", (im.width * 4, im.height * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.width * 4, im.height * 4], fill=255)
    out = Image.new("RGB", im.size, (12, 12, 10))
    out.paste(im, (0, 0), m.resize(im.size, Image.LANCZOS))
    return out


final = build()
final.save(os.path.join(OUT, "coffer-pfp.png"))

sizes = [128, 96, 48]
PAD, BIG = 30, 280
sheet = Image.new("RGB", (PAD * 2 + BIG + PAD + max(sizes), PAD * 2 + BIG), (12, 12, 10))
sheet.paste(circle_crop(final.resize((BIG, BIG), Image.LANCZOS)), (PAD, PAD))
y = PAD
for s in sizes:
    sheet.paste(circle_crop(final.resize((s, s), Image.LANCZOS)),
                (PAD * 2 + BIG, y))
    y += s + 16
sheet.save(os.path.join(OUT, "coffer-pfp-preview.png"))

print(os.path.join(OUT, "coffer-pfp.png"))
print(os.path.join(OUT, "coffer-pfp-preview.png"))
