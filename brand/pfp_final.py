"""Coffer PFP — FINAL. Vault door, 4 lugs.

Chosen after three rounds. Rejected along the way, and why:
  radiation symbol (6 blades round a hex) · download icon (arrow + tray) ·
  generic crypto padlock · outward brackets (read as release, not custody) ·
  6-lug door (busy, reads as a gear) · flat solid core (no depth).

Produces coffer-pfp.png (400) plus 48/96/128 previews.
Regenerate:  python pfp_final.py
"""
from PIL import Image, ImageDraw
import math, os

INK        = (10, 10, 8)
PANEL      = (18, 18, 16)
LINE2      = (56, 56, 47)
AMBER      = (255, 176, 0)
AMBER_DEEP = (198, 136, 0)

S, SS = 400, 4
C = S * SS // 2
U = SS
OUT = os.path.dirname(os.path.abspath(__file__))

BAND_R, BAND_W, LUG, CORE, PUPIL, ROT = 130, 34, 30, 68, 30, 45


def polar(r, deg):
    a = math.radians(deg)
    return (C + r * U * math.cos(a), C + r * U * math.sin(a))


def build():
    img = Image.new("RGB", (S * SS, S * SS), INK)
    d = ImageDraw.Draw(img)

    def disc(r, color):
        d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U], fill=color)

    def ring(r, color, w):
        d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U],
                  outline=color, width=w * U)

    disc(190, PANEL)                       # plate
    ring(190, LINE2, 2)                    # hairline edge

    ring(BAND_R, AMBER_DEEP, BAND_W + 6)   # depth
    ring(BAND_R, AMBER, BAND_W)            # band

    inner = BAND_R - BAND_W / 2 - 4
    outer = BAND_R + BAND_W / 2 + 4
    half = math.degrees(math.atan((LUG * 0.5 * U) / (BAND_R * U)))
    for i in range(4):                     # tapered lugs
        a = ROT + i * 90
        d.polygon([polar(inner, a - half * 0.62), polar(inner, a + half * 0.62),
                   polar(outer, a + half), polar(outer, a - half)], fill=INK)

    disc(CORE, AMBER)                      # core
    disc(CORE - 7, AMBER_DEEP)
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
w = PAD * 2 + BIG + PAD + max(sizes)
sheet = Image.new("RGB", (w, PAD * 2 + BIG), (12, 12, 10))
sheet.paste(circle_crop(final.resize((BIG, BIG), Image.LANCZOS)), (PAD, PAD))
y = PAD
for s in sizes:
    sheet.paste(circle_crop(final.resize((s, s), Image.LANCZOS)),
                (PAD * 2 + BIG, y))
    y += s + 16
sheet.save(os.path.join(OUT, "coffer-pfp-preview.png"))

print(os.path.join(OUT, "coffer-pfp.png"))
print(os.path.join(OUT, "coffer-pfp-preview.png"))
