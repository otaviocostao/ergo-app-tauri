"""Render the chair calibration illustration. Requires Python and Pillow.

Run from any directory: python scripts/generate_calibration_chair.py
Outputs the looping GIF and its reduced-motion still in src/assets/calibration.
"""

from functools import lru_cache
from math import sin, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "assets" / "calibration"
WIDTH, HEIGHT, SCALE = 960, 420, 2
BG = "#f5faf9"
INK = "#203747"
MUTED = "#617680"
GREEN = "#0d957b"
MINT = "#c9eee3"
SKIN = "#d79d78"
PANTS = "#344c63"
FONT_DIR = Path("C:/Windows/Fonts")


@lru_cache
def font(size, bold=False):
    candidates = [
        FONT_DIR / ("segoeuib.ttf" if bold else "segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), round(size * SCALE))
    raise RuntimeError("Install Segoe UI or DejaVu Sans to render this illustration.")


class Canvas:
    def __init__(self):
        self.image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), BG)
        self.draw = ImageDraw.Draw(self.image)

    def box(self, bounds, fill, radius=0, outline=None, width=1):
        self.draw.rounded_rectangle(
            tuple(round(v * SCALE) for v in bounds),
            radius=round(radius * SCALE), fill=fill, outline=outline,
            width=round(width * SCALE),
        )

    def ellipse(self, bounds, fill):
        self.draw.ellipse(tuple(round(v * SCALE) for v in bounds), fill=fill)

    def line(self, points, fill, width=2, rounded=False):
        self.draw.line(
            [(round(x * SCALE), round(y * SCALE)) for x, y in points],
            fill=fill, width=round(width * SCALE), joint="curve",
        )
        if rounded:
            for x, y in (points[0], points[-1]):
                r = width / 2
                self.ellipse((x - r, y - r, x + r, y + r), fill)

    def text(self, position, text, size, fill=INK, bold=False):
        self.draw.text(tuple(round(v * SCALE) for v in position), text,
                       font=font(size, bold), fill=fill)

    def path(self, commands, fill, dy=0):
        """Sample cubic Beziers before antialiasing the finished frame."""
        points = []
        current = (0, 0)
        for command in commands:
            if command[0] == "M" or command[0] == "L":
                current = command[1:3]
                points.append(current)
            elif command[0] == "C":
                p0 = current
                x1, y1, x2, y2, x3, y3 = command[1:]
                for i in range(1, 19):
                    t = i / 18
                    u = 1 - t
                    points.append((
                        u**3 * p0[0] + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                        u**3 * p0[1] + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3,
                    ))
                current = (x3, y3)
        self.draw.polygon([(round(x * SCALE), round((y + dy) * SCALE))
                           for x, y in points], fill=fill)


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def check(canvas, x, y, color=GREEN):
    canvas.line([(x, y + 5), (x + 5, y + 10), (x + 15, y)], color, 2.5, True)


def render(progress, clock=0):
    c = Canvas()
    dy = -44 * (1 - progress)
    settled = progress >= 0.999

    # Editorial copy stays still while the chair moves.
    c.box((44, 42, 263, 71), "#e4f2ee", 14)
    c.text((58, 47), "01  /  AJUSTE DA CADEIRA", 11, GREEN, True)
    c.text((44, 99), "Encontre a", 37, INK, True)
    c.text((44, 143), "altura ideal.", 37, INK, True)
    c.text((46, 210), "Ajuste a cadeira até apoiar os pés", 17, MUTED)
    c.text((46, 236), "e manter os joelhos a 90°.", 17, MUTED)

    if settled:
        c.box((44, 295, 280, 337), "#def3ea", 21)
        check(c, 62, 309)
        c.text((88, 304), "Pés bem apoiados", 16, GREEN, True)
    else:
        c.box((44, 295, 280, 337), "#e7efef", 21)
        c.line([(67, 306), (67, 324)], MUTED, 2, True)
        c.line([(62, 319), (67, 324), (72, 319)], MUTED, 2, True)
        c.text((88, 304), "Regule a altura", 16, INK, True)

    # Quiet backdrop and floor are fixed in place to make height changes clear.
    c.ellipse((474, 31, 880, 373), "#e7f3ef")
    c.ellipse((518, 334, 799, 363), "#dce9e5")
    c.line([(457, 353), (898, 353)], "#c4d7d1", 2)

    if settled:
        c.box((695, 346, 780, 353), "#83cbb7", 3)

    return c.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
