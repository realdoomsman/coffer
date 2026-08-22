"""Coffer PFP concepts. Supersampled 4x -> LANCZOS down for crisp edges.
Palette is lifted verbatim from apps/web/src/theme.css."""
from PIL import Image, ImageDraw
import math, os

INK        = (10, 10, 8)
PANEL      = (18, 18, 16)
PANEL2     = (25, 25, 22)
LINE2      = (56, 56, 47)
LINEBRIGHT = (84, 84, 71)
TEXT       = (233, 230, 218)
MUTED      = (154, 150, 138)
AMBER      = (255, 176, 0)
GREEN      = (47, 217, 128)

S = 400          # final size
SS = 4           # supersample factor
C = S * SS // 2  # center in supersampled space
OUT = os.path.dirname(os.path.abspath(__file__))


def canvas():
    img = Image.new("RGB", (S * SS, S * SS), INK)
    return img, ImageDraw.Draw(img)


def ring(d, r, color, w):
    d.ellipse([C - r, C - r, C + r, C + r], outline=color, width=w)


def disc(d, r, color):
    d.ellipse([C - r, C - r, C + r, C + r], fill=color)


def polar(r, deg):
    a = math.radians(deg)
    return (C + r * math.cos(a), C + r * math.sin(a))


def ngon(d, r, n, rot, fill=None, outline=None, w=0):
    pts = [polar(r, rot + i * 360 / n) for i in range(n)]
    d.polygon(pts, fill=fill, outline=outline, width=w)


def dot_grid(d, pitch, r, color):
    p = pitch * SS
    rr = r * SS
    y = p // 2
    while y < S * SS:
        x = p // 2
        while x < S * SS:
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=color)
            x += p
        y += p


def finish(img, name):
    img = img.resize((S, S), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path)
    return path, img


# ── A. Vault dial ──────────────────────────────────────────────────────────
# Concentric rings + notched dial + sealed hexagonal core. No keyhole:
# there is no code path out, so the mark has no way in either.
def concept_a():
    img, d = canvas()
    dot_grid(d, 22, 0.5, (26, 26, 22))

    ring(d, 190 * SS, LINE2, 2 * SS)            # outer hairline
    ring(d, 176 * SS, PANEL2, 1 * SS)

    ring(d, 150 * SS, AMBER, 11 * SS)           # main dial band
    # notches cut through the band in background colour
    for i in range(8):
        a = i * 45
        x1, y1 = polar(138 * SS, a)
        x2, y2 = polar(163 * SS, a)
        d.line([x1, y1, x2, y2], fill=INK, width=7 * SS)

    ring(d, 118 * SS, LINE2, 2 * SS)            # inner well
    disc(d, 112 * SS, PANEL)
    ring(d, 112 * SS, LINEBRIGHT, 1 * SS)

    ngon(d, 60 * SS, 6, -90, fill=AMBER)        # sealed core
    ngon(d, 34 * SS, 6, -90, outline=INK, w=4 * SS)
    return finish(img, "concept-a-dial.png")


# ── B. Closed aperture ─────────────────────────────────────────────────────
# Six blades overlapped shut. Reads as "sealed" at any size.
def concept_b():
    img, d = canvas()
    dot_grid(d, 22, 0.5, (26, 26, 22))

    ring(d, 190 * SS, LINE2, 2 * SS)
    disc(d, 168 * SS, PANEL)
    ring(d, 168 * SS, LINEBRIGHT, 2 * SS)

    R = 168 * SS
    for i in range(6):
        base = i * 60
        p1 = polar(R, base)
        p2 = polar(R, base + 60)
        p3 = polar(46 * SS, base + 60)
        d.polygon([p1, p2, p3], fill=PANEL2 if i % 2 else PANEL)
        d.line([p2, p3], fill=AMBER, width=5 * SS)

    ngon(d, 46 * SS, 6, 0, fill=INK, outline=AMBER, w=6 * SS)
    return finish(img, "concept-b-aperture.png")


# ── C. One-way gate ────────────────────────────────────────────────────────
# Capital enters, the floor is solid. Nothing leaves.
def concept_c():
    img, d = canvas()
    dot_grid(d, 22, 0.5, (26, 26, 22))

    ring(d, 190 * SS, LINE2, 2 * SS)
    ring(d, 176 * SS, PANEL2, 1 * SS)

    shaft_w = 26 * SS
    d.rectangle([C - shaft_w // 2, C - 132 * SS, C + shaft_w // 2, C - 6 * SS],
                fill=AMBER)
    head = 46 * SS
    d.polygon([(C, C + 44 * SS),
               (C - head, C - 18 * SS),
               (C + head, C - 18 * SS)], fill=AMBER)

    d.rectangle([C - 120 * SS, C + 66 * SS, C + 120 * SS, C + 92 * SS],
                fill=TEXT)
    d.rectangle([C - 120 * SS, C + 104 * SS, C + 120 * SS, C + 118 * SS],
                fill=LINE2)
    return finish(img, "concept-c-oneway.png")


# ── D. Strongbox from above ────────────────────────────────────────────────
# Nested rotated squares: a coffer lid, plan view.
def concept_d():
    img, d = canvas()
    dot_grid(d, 22, 0.5, (26, 26, 22))

    ring(d, 190 * SS, LINE2, 2 * SS)

    ngon(d, 172 * SS, 4, 45, fill=PANEL, outline=LINEBRIGHT, w=3 * SS)
    ngon(d, 132 * SS, 4, 45, outline=AMBER, w=9 * SS)
    ngon(d, 96 * SS, 4, 45, outline=LINE2, w=3 * SS)
    ngon(d, 54 * SS, 4, 45, fill=AMBER)
    ngon(d, 26 * SS, 4, 45, fill=INK)

    for a in (45, 135, 225, 315):                # corner bolts
        x, y = polar(150 * SS, a)
        r = 9 * SS
        d.ellipse([x - r, y - r, x + r, y + r], fill=TEXT)
    return finish(img, "concept-d-strongbox.png")


built = [concept_a(), concept_b(), concept_c(), concept_d()]

# ── contact sheet: big + 48px timeline size, circular-cropped like X ───────
def circle_crop(im):
    m = Image.new("L", (im.width * 4, im.height * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.width * 4, im.height * 4], fill=255)
    m = m.resize(im.size, Image.LANCZOS)
    out = Image.new("RGB", im.size, (12, 12, 10))
    out.paste(im, (0, 0), m)
    return out

PAD, BIG, SMALL = 34, 240, 48
sheet = Image.new("RGB", (PAD + 4 * (BIG + PAD), PAD * 3 + BIG + SMALL), (12, 12, 10))
for i, (path, im) in enumerate(built):
    x = PAD + i * (BIG + PAD)
    sheet.paste(circle_crop(im.resize((BIG, BIG), Image.LANCZOS)), (x, PAD))
    sheet.paste(circle_crop(im.resize((SMALL, SMALL), Image.LANCZOS)),
                (x + (BIG - SMALL) // 2, PAD * 2 + BIG))
sheet.save(os.path.join(OUT, "concepts-sheet.png"))

for p, _ in built:
    print(p)
print(os.path.join(OUT, "concepts-sheet.png"))
