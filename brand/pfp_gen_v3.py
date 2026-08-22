"""Coffer PFP round 3 — refine the vault door, fix the brackets.

Kept from round 2: H (vault door) was the only mark that was both
distinctive and legible at 48px.
Fixed here:
  - G's brackets pointed outward (= release). Now they clamp inward.
  - H's lugs were square blocks reading as noise. Now tapered, and the
    core gets a real depth read instead of a flat dot.
"""
from PIL import Image, ImageDraw
import math, os

INK        = (10, 10, 8)
PANEL      = (18, 18, 16)
PANEL2     = (25, 25, 22)
LINE2      = (56, 56, 47)
TEXT       = (233, 230, 218)
AMBER      = (255, 176, 0)
AMBER_DEEP = (198, 136, 0)

S, SS = 400, 4
C = S * SS // 2
U = SS
OUT = os.path.dirname(os.path.abspath(__file__))


def canvas():
    img = Image.new("RGB", (S * SS, S * SS), INK)
    return img, ImageDraw.Draw(img)


def disc(d, r, color):
    d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U], fill=color)


def ring(d, r, color, w):
    d.ellipse([C - r * U, C - r * U, C + r * U, C + r * U],
              outline=color, width=w * U)


def rect(d, x0, y0, x1, y1, **kw):
    d.rectangle([C + x0 * U, C + y0 * U, C + x1 * U, C + y1 * U], **kw)


def polar(r, deg):
    a = math.radians(deg)
    return (C + r * U * math.cos(a), C + r * U * math.sin(a))


def ngon(d, r, n, rot, **kw):
    d.polygon([polar(r, rot + i * 360 / n) for i in range(n)], **kw)


def finish(img, name):
    img = img.resize((S, S), Image.LANCZOS)
    img.save(os.path.join(OUT, name))
    return os.path.join(OUT, name), img


def vault_door(band_r=130, band_w=34, lug=30, core=68, pupil=30,
               lug_count=4, rot=45, deep=True, name="x.png"):
    """The mark. Heavy band + tapered lugs + solid core."""
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)

    if deep:                                   # depth under the band
        ring(d, band_r, AMBER_DEEP, band_w + 6)
    ring(d, band_r, AMBER, band_w)

    inner = band_r - band_w / 2 - 4
    outer = band_r + band_w / 2 + 4
    half = math.degrees(math.atan((lug * 0.5 * U) / (band_r * U)))
    for i in range(lug_count):                 # trapezoid lugs, cut in INK
        a = rot + i * 360 / lug_count
        d.polygon([polar(inner, a - half * 0.62), polar(inner, a + half * 0.62),
                   polar(outer, a + half), polar(outer, a - half)], fill=INK)

    disc(d, core, AMBER)
    disc(d, core - 7, AMBER_DEEP)
    disc(d, pupil, INK)
    return finish(img, name)


def brackets_inward():
    """G, corrected: brackets face IN. Capital held, not released."""
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)
    t, arm, sp = 30, 76, 116
    for s in (-1, 1):
        x = s * sp
        rect(d, min(x - s * t, x), -142, max(x - s * t, x), 142, fill=AMBER)
        for y in (-142, 142 - t):              # arms reach inward
            x2 = x - s * t - s * arm
            rect(d, min(x - s * t, x2), y, max(x - s * t, x2), y + t, fill=AMBER)
    ngon(d, 52, 6, -90, fill=TEXT)
    return finish(img, "concept-g2-brackets-in.png")


built = [
    vault_door(name="v3-door-4lug.png"),
    vault_door(lug_count=6, rot=0, name="v3-door-6lug.png"),
    vault_door(band_r=134, band_w=40, core=60, pupil=0, deep=True,
               name="v3-door-solidcore.png"),
    brackets_inward(),
]


def circle_crop(im):
    m = Image.new("L", (im.width * 4, im.height * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.width * 4, im.height * 4], fill=255)
    out = Image.new("RGB", im.size, (12, 12, 10))
    out.paste(im, (0, 0), m.resize(im.size, Image.LANCZOS))
    return out


PAD, BIG, MID, SMALL = 34, 240, 96, 48
sheet = Image.new("RGB", (PAD + 4 * (BIG + PAD), PAD * 4 + BIG + MID + SMALL),
                  (12, 12, 10))
for i, (_, im) in enumerate(built):
    x = PAD + i * (BIG + PAD)
    sheet.paste(circle_crop(im.resize((BIG, BIG), Image.LANCZOS)), (x, PAD))
    sheet.paste(circle_crop(im.resize((MID, MID), Image.LANCZOS)),
                (x + (BIG - MID) // 2, PAD * 2 + BIG))
    sheet.paste(circle_crop(im.resize((SMALL, SMALL), Image.LANCZOS)),
                (x + (BIG - SMALL) // 2, PAD * 3 + BIG + MID))
sheet.save(os.path.join(OUT, "concepts-sheet-v3.png"))
for p, _ in built:
    print(p)
