from math import sqrt
from pathlib import Path

from PIL import Image

from generate_calibration_chair import (
    BG, Canvas, GREEN, HEIGHT, INK, MUTED, PANTS, SKIN, WIDTH, check, ease,
)


OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "calibration"


class TranslatedCanvas:
    def __init__(self, canvas, dy):
        self.canvas = canvas
        self.dy = dy

    def box(self, bounds, *args, **kwargs):
        x1, y1, x2, y2 = bounds
        self.canvas.box((x1, y1 + self.dy, x2, y2 + self.dy), *args, **kwargs)

    def ellipse(self, bounds, *args, **kwargs):
        x1, y1, x2, y2 = bounds
        self.canvas.ellipse((x1, y1 + self.dy, x2, y2 + self.dy), *args, **kwargs)

    def line(self, points, *args, **kwargs):
        self.canvas.line([(x, y + self.dy) for x, y in points], *args, **kwargs)

    def path(self, commands, fill, dy=0):
        self.canvas.path(commands, fill, dy + self.dy)

    def text(self, position, *args, **kwargs):
        x, y = position
        self.canvas.text((x, y + self.dy), *args, **kwargs)


def draw_chair(canvas, lift=0):
    canvas.line([(608, 260 - lift), (608, 334)], "#a8b9c0", 8, True)
    canvas.line([(608, 306), (608, 334)], "#7e919c", 12, True)
    canvas.line([(608, 330), (559, 341)], "#607583", 6, True)
    canvas.line([(608, 330), (658, 341)], "#607583", 6, True)
    canvas.line([(608, 330), (607, 346)], "#607583", 6, True)
    for x, y in [(553, 338), (650, 338), (600, 341)]:
        canvas.box((x, y, x + 16, y + 11), "#344b5c", 4)
    raised = TranslatedCanvas(canvas, -lift)
    raised.line([(558, 210), (582, 253), (607, 253)], "#7a9099", 10, True)
    raised.box((540, 139, 570, 244), "#456876", 13)
    raised.box((540, 141, 550, 241), "#597f89", 7)
    raised.box((562, 247, 666, 262), "#456876", 7)
    raised.box((567, 247, 665, 254), "#5a7f8b", 4)


def draw_footrest(canvas, lift):
    if lift <= 0:
        return
    canvas.box((665, 352 - lift, 753, 352), "#72998d", 3)
    canvas.box((662, 350 - lift, 756, min(355 - lift, 352)), "#a8d4c4", 2)


def draw_desk(canvas, top):
    # Fixed feet and telescopic legs make the adjustable height readable.
    for x in (785, 874):
        canvas.box((x, 270, x + 9, 347), "#8aa9a0", 3)
        canvas.box((x - 2, top + 10, x + 11, 291), "#b0c9c0", 3)
        canvas.box((x - 13, 346, x + 23, 352), "#6f9386", 3)
    canvas.box((648, top, 911, top + 12), "#adcac2", 5)
    canvas.box((652, top, 907, top + 5), "#d0e4dc", 2)
    canvas.box((654, top - 6, 726, top - 1), "#456876", 2)
    for x in range(660, 722, 10):
        canvas.line([(x, top - 5), (x + 5, top - 5)], "#dcece6", 1)


def draw_person(canvas, desk_top):
    # Keep the thighs and shins similar in length, with the knees past the seat.
    canvas.line([(611, 231), (681, 237), (679, 330)], "#526b7d", 23, True)
    canvas.box((670, 323, 689, 338), "#bc8564", 5)
    canvas.box((666, 335, 725, 351), "#d9e3e6", 6)
    canvas.line([(607, 237), (695, 237), (695, 328)], PANTS, 28, True)
    canvas.line([(702, 256), (702, 314)], "#405c72", 3, True)
    canvas.box((684, 319, 705, 338), SKIN, 5)
    canvas.path([
        ("M", 683, 331), ("C", 692, 335, 699, 336, 707, 332),
        ("C", 714, 338, 723, 338, 732, 341),
        ("C", 740, 343, 742, 347, 739, 351),
        ("L", 681, 351), ("C", 677, 345, 678, 337, 683, 331),
    ], "#ffffff")
    canvas.line([(682, 350), (738, 350)], "#b6c9cd", 3, True)
    canvas.line([(708, 338), (703, 342)], "#9bb2bc", 2, True)
    canvas.line([(715, 340), (711, 344)], "#9bb2bc", 2, True)

    canvas.box((589, 106, 610, 141), SKIN, 5)
    canvas.path([
        ("M", 587, 127), ("C", 570, 132, 566, 145, 570, 170),
        ("L", 578, 226), ("C", 586, 241, 610, 245, 636, 240),
        ("L", 624, 214), ("L", 622, 163),
        ("C", 622, 141, 613, 130, 605, 128),
        ("C", 599, 137, 592, 136, 587, 127),
    ], "#47ac98")
    canvas.path([
        ("M", 575, 157), ("C", 580, 188, 579, 212, 590, 227),
        ("C", 602, 234, 615, 235, 633, 233),
        ("L", 636, 240), ("C", 610, 245, 586, 241, 578, 226),
        ("L", 570, 170),
    ], "#359a89")

    # Rotate a fixed-length forearm toward the keyboard as the desk moves.
    # Its length is close to the shoulder-to-elbow distance, plus a separate hand.
    wrist_y = desk_top - 9
    wrist_x = 598 + sqrt(64**2 - (wrist_y - 201)**2)
    # Keep the rounded upper end inside the cuff instead of above the sleeve.
    canvas.line([(598, 181), (598, 201)], SKIN, 17, True)
    canvas.line([(598, 201), (wrist_x, wrist_y)], SKIN, 14, True)
    canvas.ellipse((wrist_x - 10, wrist_y - 7, wrist_x + 18, wrist_y + 7), SKIN)
    # Center the shoulder on the torso and align the sleeve with the upper arm.
    canvas.path([
        ("M", 585, 179), ("L", 585, 155),
        ("C", 585, 147, 591, 142, 598, 142),
        ("C", 605, 142, 611, 147, 611, 155),
        ("L", 611, 179), ("L", 585, 179),
    ], "#5bb9a5")

    canvas.path([
        ("M", 586, 69), ("C", 596, 59, 618, 63, 624, 76),
        ("L", 626, 88), ("L", 632, 97), ("L", 627, 100),
        ("C", 628, 112, 619, 120, 608, 119),
        ("L", 590, 110), ("C", 582, 102, 580, 82, 586, 69),
    ], SKIN)
    canvas.path([
        ("M", 583, 99), ("C", 573, 87, 576, 70, 584, 63),
        ("C", 593, 53, 614, 54, 623, 66),
        ("C", 627, 72, 625, 78, 621, 80),
        ("L", 600, 76), ("L", 595, 94), ("L", 590, 93),
        ("L", 589, 107), ("L", 583, 99),
    ], "#293e4d")
    canvas.ellipse((586, 89, 597, 104), "#e1aa86")
    canvas.ellipse((617, 88, 620, 91), INK)
    canvas.line([(622, 107), (626, 106)], "#a66d54", 1.4, True)


def draw_elbow_angle(canvas):
    # The vertical upper arm and horizontal forearm meet at the highlighted joint.
    canvas.line([(598, 179), (620, 179), (620, 201)], GREEN, 2.5)
    canvas.ellipse((594, 197, 602, 205), GREEN)
    canvas.line([(624, 176), (632, 168)], "#80bead", 2)
    canvas.box((636, 144, 713, 181), "#ffffff", 10)
    canvas.text((649, 147), "90°", 24, GREEN, True)


def render(progress=0, chair_progress=0, fixed_desk=False):
    progress = max(0, min(1, progress))
    chair_progress = max(0, min(1, chair_progress))
    desk_top = 172 if fixed_desk else 172 + 38 * progress
    chair_lift = 38 * chair_progress if fixed_desk else 0
    settled = chair_progress >= 1 if fixed_desk else progress >= 1
    canvas = Canvas()
    canvas.box((44, 42, 278, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "02  /  MESA E COTOVELOS", 11, GREEN, True)
    if fixed_desk:
        canvas.text((44, 99), "Mesa sem ajuste?", 37, INK, True)
        canvas.text((44, 143), "Eleve a cadeira.", 37, INK, True)
        canvas.text((46, 210), "Ajuste a cadeira e mantenha", 17, MUTED)
        canvas.text((46, 236), "os pés apoiados em uma base.", 17, MUTED)
    else:
        canvas.text((44, 99), "Ajuste a mesa.", 37, INK, True)
        canvas.text((44, 143), "Relaxe os braços.", 37, INK, True)
        canvas.text((46, 210), "Mantenha os cotovelos a 90°.", 17, MUTED)
        canvas.text((46, 236), "Se precisar, use apoio para os pés.", 17, MUTED)
    if settled:
        canvas.box((44, 295, 302, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        status = "Pés bem apoiados" if fixed_desk else "Cotovelos a 90°"
        canvas.text((90, 304), status, 16, GREEN, True)
    else:
        canvas.box((44, 295, 302, 337), "#e7efef", 21)
        status = "Eleve e apoie os pés" if fixed_desk else "Ajuste a altura da mesa"
        canvas.text((65, 304), status, 16, INK, True)

    canvas.ellipse((474, 31, 906, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (919, 353)], "#c4d7d1", 2)
    draw_chair(canvas, chair_lift)
    draw_desk(canvas, desk_top)
    draw_footrest(canvas, chair_lift)
    raised = TranslatedCanvas(canvas, -chair_lift)
    draw_person(raised, desk_top + chair_lift)
    if settled:
        draw_elbow_angle(raised)
    elif fixed_desk:
        canvas.line([(499, 245), (499, 195)], GREEN, 3, True)
        canvas.line([(491, 203), (499, 195), (507, 203)], GREEN, 3, True)
    else:
        canvas.line([(932, desk_top - 25), (932, desk_top + 20)], GREEN, 3, True)
        canvas.line([(924, desk_top + 12), (932, desk_top + 20),
                     (940, desk_top + 12)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    start = render()
    desk_adjusted = render(1)
    fixed_start = render(fixed_desk=True)
    chair_adjusted = render(chair_progress=1, fixed_desk=True)
    chair_adjusted.save(OUTPUT / "desk-height-still.png", optimize=True)

    # Include both examples in the shared palette to avoid color flicker.
    palette_source = Image.new("RGB", (WIDTH, HEIGHT * 4), BG)
    for index, scene in enumerate((start, desk_adjusted, fixed_start, chair_adjusted)):
        palette_source.paste(scene, (0, HEIGHT * index))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT)

    blank = Image.new("RGB", start.size, BG)
    frames = []
    for index in range(200):
        time = index * 0.08
        if time < 5.6:
            frame = render(ease((time - 0.8) / 2))
        elif time < 6.16:
            frame = Image.blend(desk_adjusted, blank, ease((time - 5.6) / 0.56))
        elif time < 6.72:
            frame = Image.blend(blank, fixed_start, ease((time - 6.16) / 0.56))
        elif time < 14.88:
            # Switch examples before raising the chair, keeping the desk fixed.
            frame = render(chair_progress=ease((time - 7.2) / 2), fixed_desk=True)
        elif time < 15.44:
            frame = Image.blend(chair_adjusted, blank, ease((time - 14.88) / 0.56))
        else:
            frame = Image.blend(blank, start, ease((time - 15.44) / 0.56))
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))

    path = OUTPUT / "desk-height.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:],
                   duration=80, loop=0, disposal=1, optimize=True)
    with Image.open(path) as gif:
        duration = 0
        for index in range(gif.n_frames):
            gif.seek(index)
            duration += gif.info["duration"]
        print(f"{path.name}: {gif.n_frames} frames, {duration / 1000:.2f}s, "
              f"{path.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
