"""Coffer PFP round 2.

Round 1 post-mortem, encoded as rules here:
  - 6 blades around a hex = radiation symbol. Never again.
  - arrow + tray = download icon. Avoid arrows entirely.
  - stroke < 8% of diameter vanishes at 48px. Everything is heavy now.
  - max 3 shapes per mark.
"""
from PIL import Image, ImageDraw
import math, os

INK        = (10, 10, 8)
PANEL      = (18, 18, 16)
LINE2      = (56, 56, 47)
LINEBRIGHT = (84, 84, 71)
TEXT       = (233, 230, 218)
AMBER      = (255, 176, 0)

S, SS = 400, 4
C = S * SS // 2
U = SS                      # 1 design px
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


# ── E. Coffer slot ─────────────────────────────────────────────────────────
# Solid amber block, one dark deposit slot. Money goes in. That's the
# whole vocabulary of the shape: there is an in, there is no out.
def concept_e():
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)
    rect(d, -112, -78, 112, 108, fill=AMBER)      # the block
    rect(d, -66, -46, 66, -20, fill=INK)          # the slot
    rect(d, -112, 78, 112, 108, fill=INK)         # solid plinth / floor
    return finish(img, "concept-e-slot.png")


# ── F. Shackle with no opening ─────────────────────────────────────────────
# A padlock whose loop is continuous and whose body has no keyhole.
# "No code path moves funds out" as a single silhouette.
def concept_f():
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)

    d.arc([C - 74 * U, C - 150 * U, C + 74 * U, C - 22 * U],
          start=180, end=360, fill=AMBER, width=26 * U)
    rect(d, -74, -86, -48, -30, fill=AMBER)
    rect(d, 48, -86, 74, -30, fill=AMBER)
    rect(d, -116, -30, 116, 128, fill=AMBER)      # body, unbroken
    rect(d, -34, 22, 34, 76, fill=INK)            # sealed core, not a keyhole
    return finish(img, "concept-f-shackle.png")


# ── G. Held between brackets ───────────────────────────────────────────────
# Two heavy brackets clamp a core. Custody as a gesture, not an object.
def concept_g():
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)

    t, arm, sp = 28, 78, 104
    for s in (-1, 1):                             # left / right bracket
        x = s * sp
        rect(d, min(x, x - s * t), -140, max(x, x - s * t), 140, fill=AMBER)
        for y in (-140, 140 - t):
            x2 = x - s * t + s * arm
            rect(d, min(x - s * t, x2), y, max(x - s * t, x2), y + t, fill=AMBER)
    ngon(d, 46, 6, -90, fill=TEXT)                # what is being held
    return finish(img, "concept-g-brackets.png")


# ── H. Vault door, heavy ───────────────────────────────────────────────────
# Round 1's dial, rebuilt: one thick band, four fat lugs, solid core.
def concept_h():
    img, d = canvas()
    disc(d, 190, PANEL)
    ring(d, 190, LINE2, 2)
    ring(d, 132, AMBER, 30)                       # single heavy band
    for a in (0, 90, 180, 270):                   # square lugs, not blades
        x, y = polar(132, a)
        h = 26 * U
        d.rectangle([x - h, y - h, x + h, y + h], fill=INK)
    disc(d, 74, AMBER)
    disc(d, 34, INK)
    return finish(img, "concept-h-door.png")


built = [concept_e(), concept_f(), concept_g(), concept_h()]


def circle_crop(im):
    m = Image.new("L", (im.width * 4, im.height * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.width * 4, im.height * 4], fill=255)
    out = Image.new("RGB", im.size, (12, 12, 10))
    out.paste(im, (0, 0), m.resize(im.size, Image.LANCZOS))
    return out


PAD, BIG, SMALL = 34, 240, 48
sheet = Image.new("RGB", (PAD + 4 * (BIG + PAD), PAD * 3 + BIG + SMALL), (12, 12, 10))
for i, (_, im) in enumerate(built):
    x = PAD + i * (BIG + PAD)
    sheet.paste(circle_crop(im.resize((BIG, BIG), Image.LANCZOS)), (x, PAD))
    sheet.paste(circle_crop(im.resize((SMALL, SMALL), Image.LANCZOS)),
                (x + (BIG - SMALL) // 2, PAD * 2 + BIG))
sheet.save(os.path.join(OUT, "concepts-sheet-v2.png"))
for p, _ in built:
    print(p)
