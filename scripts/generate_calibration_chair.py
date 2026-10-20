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

    # Five-star chair base, telescopic cylinder, and back support.
    c.line([(608, 306), (608, 334)], "#7e919c", 12, True)
    c.line([(608, 260 + dy), (608, 308)], "#a8b9c0", 8, True)
    c.line([(608, 330), (559, 341)], "#607583", 6, True)
    c.line([(608, 330), (658, 341)], "#607583", 6, True)
    c.line([(608, 330), (607, 346)], "#607583", 6, True)
    for x, y in [(553, 338), (650, 338), (600, 341)]:
        c.box((x, y, x + 16, y + 11), "#344b5c", 4)
    c.path([
        ("M", 567, 199), ("L", 579, 200), ("L", 588, 249),
        ("L", 609, 249), ("L", 609, 261), ("L", 578, 261),
        ("L", 567, 199),
    ], "#7a9099", dy)
    c.box((540, 139 + dy, 570, 244 + dy), "#456876", 13)
    c.box((540, 141 + dy, 550, 241 + dy), "#597f89", 7)
    c.box((562, 247 + dy, 688, 262 + dy), "#456876", 7)
    c.box((567, 247 + dy, 687, 254 + dy), "#5a7f8b", 4)
    # Height lever.
    c.line([(631, 265 + dy), (660, 274 + dy)], "#7a9099", 4, True)
    c.box((652, 268 + dy, 677, 278 + dy), INK, 4)

    # Far leg is slightly offset; both feet descend with the seat.
    c.line([(611, 229 + dy), (703, 235 + dy), (701, 330 + dy)],
           "#526b7d", 23, True)
    c.box((692, 323 + dy, 711, 338 + dy), "#bc8564", 5)
    c.path([
        ("M", 692, 332), ("C", 706, 335, 712, 331, 719, 335),
        ("L", 738, 340), ("C", 745, 341, 747, 346, 744, 350),
        ("L", 691, 350), ("C", 686, 345, 688, 337, 692, 332),
    ], "#d9e3e6", dy)

    # Near leg: horizontal thigh and vertical shin give a true right angle.
    c.line([(607, 231 + dy), (717, 237 + dy)], PANTS, 31, True)
    c.line([(717, 237 + dy), (717, 328 + dy)], PANTS, 27, True)
    c.line([(724, 256 + dy), (724, 314 + dy)], "#405c72", 3, True)
    c.box((706, 319 + dy, 727, 338 + dy), SKIN, 5)
    c.path([
        ("M", 705, 331), ("C", 714, 335, 721, 336, 729, 332),
        ("C", 736, 338, 745, 338, 754, 341),
        ("C", 762, 343, 764, 347, 761, 351),
        ("L", 703, 351), ("C", 699, 345, 700, 337, 705, 331),
    ], "#ffffff", dy)
    c.line([(704, 350 + dy), (760, 350 + dy)], "#b6c9cd", 3, True)
    c.line([(730, 338 + dy), (725, 342 + dy)], "#9bb2bc", 2, True)
    c.line([(737, 340 + dy), (733, 344 + dy)], "#9bb2bc", 2, True)

    # Neck, torso and a relaxed arm resting on the thigh.
    c.path([
        ("M", 589, 107), ("L", 610, 106), ("L", 612, 137),
        ("L", 589, 141), ("L", 589, 107),
    ], SKIN, dy)
    c.path([
        ("M", 587, 127), ("C", 570, 132, 566, 145, 570, 170),
        ("L", 578, 226), ("C", 586, 241, 610, 245, 636, 240),
        ("L", 624, 214), ("L", 622, 163),
        ("C", 622, 141, 613, 130, 605, 128),
        ("C", 599, 137, 592, 136, 587, 127),
    ], "#47ac98", dy)
    c.path([
        ("M", 575, 157), ("C", 580, 188, 579, 212, 590, 227),
        ("C", 602, 234, 615, 235, 633, 233),
        ("L", 636, 240), ("C", 610, 245, 586, 241, 578, 226),
        ("L", 570, 170),
    ], "#359a89", dy)
    c.line([(604, 161 + dy), (623, 202 + dy)], SKIN, 16, True)
    c.line([(623, 202 + dy), (664, 221 + dy)], SKIN, 14, True)
    c.ellipse((654, 214 + dy, 681, 229 + dy), SKIN)
    c.path([
        ("M", 600, 143), ("C", 610, 142, 617, 150, 621, 164),
        ("L", 625, 174), ("L", 605, 184), ("L", 594, 163),
        ("C", 590, 153, 591, 145, 600, 143),
    ], "#5bb9a5", dy)

    # Side profile with restrained facial features.
    c.path([
        ("M", 586, 69), ("C", 596, 59, 618, 63, 624, 76),
        ("L", 626, 88), ("L", 632, 97), ("L", 627, 100),
        ("C", 628, 112, 619, 120, 608, 119),
        ("L", 590, 110), ("C", 582, 102, 580, 82, 586, 69),
    ], SKIN, dy)
    c.path([
        ("M", 583, 99), ("C", 573, 87, 576, 70, 584, 63),
        ("C", 593, 53, 614, 54, 623, 66),
        ("C", 627, 72, 625, 78, 621, 80),
        ("L", 600, 76), ("L", 595, 94), ("L", 590, 93),
        ("L", 589, 107), ("L", 583, 99),
    ], "#293e4d", dy)
    c.ellipse((586, 89 + dy, 597, 104 + dy), "#e1aa86")
    c.ellipse((617, 88 + dy, 620, 91 + dy), INK)
    c.line([(622, 107 + dy), (626, 106 + dy)], "#a66d54", 1.4, True)

    if settled:
        # Overlay the actual knee joint and label its interior right angle.
        c.line([(691, 237), (691, 263), (717, 263)], GREEN, 2.5)
        c.ellipse((713, 233, 721, 241), GREEN)
        c.box((754, 235, 835, 276), "#ffffff", 12)
        c.text((768, 239), "90°", 24, GREEN, True)
        c.line([(735, 252), (748, 252)], "#80bead", 2)
        c.text((690, 373), "PÉS NO CHÃO", 11, GREEN, True)
        check(c, 669, 375)
    else:
        # Moving arrow alongside the chair indicates its adjustment direction.
        pulse = 3 * sin(clock * 2 * pi)
        c.line([(499, 210 + pulse), (499, 260 + pulse)], GREEN, 3, True)
        c.line([(491, 252 + pulse), (499, 260 + pulse),
                (507, 252 + pulse)], GREEN, 3, True)

    return c.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
