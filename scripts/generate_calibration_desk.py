from PIL import Image

from generate_calibration_chair import (
    Canvas, GREEN, HEIGHT, INK, MUTED, PANTS, SKIN, WIDTH, check,
)


def draw_chair(canvas):
    canvas.line([(608, 260), (608, 334)], "#a8b9c0", 8, True)
    canvas.line([(608, 306), (608, 334)], "#7e919c", 12, True)
    canvas.line([(608, 330), (559, 341)], "#607583", 6, True)
    canvas.line([(608, 330), (658, 341)], "#607583", 6, True)
    canvas.line([(608, 330), (607, 346)], "#607583", 6, True)
    for x, y in [(553, 338), (650, 338), (600, 341)]:
        canvas.box((x, y, x + 16, y + 11), "#344b5c", 4)
    canvas.line([(558, 210), (582, 253), (607, 253)], "#7a9099", 10, True)
    canvas.box((540, 139, 570, 244), "#456876", 13)
    canvas.box((540, 141, 550, 241), "#597f89", 7)
    canvas.box((562, 247, 688, 262), "#456876", 7)
    canvas.box((567, 247, 687, 254), "#5a7f8b", 4)


def draw_desk(canvas, top):
    # Fixed feet and telescopic legs make the adjustable height readable.
    for x in (785, 874):
        canvas.box((x, 270, x + 9, 347), "#8aa9a0", 3)
        canvas.box((x - 2, top + 10, x + 11, 291), "#b0c9c0", 3)
        canvas.box((x - 13, 346, x + 23, 352), "#6f9386", 3)
    canvas.box((678, top, 911, top + 12), "#adcac2", 5)
    canvas.box((682, top, 907, top + 5), "#d0e4dc", 2)
    canvas.box((692, top - 6, 764, top - 1), "#456876", 2)
    for x in range(698, 760, 10):
        canvas.line([(x, top - 5), (x + 5, top - 5)], "#dcece6", 1)


def draw_person(canvas, desk_top):
    canvas.line([(611, 231), (703, 237), (701, 330)], "#526b7d", 23, True)
    canvas.box((692, 323, 711, 338), "#bc8564", 5)
    canvas.box((688, 335, 747, 351), "#d9e3e6", 6)
    canvas.line([(607, 237), (717, 237), (717, 328)], PANTS, 28, True)
    canvas.line([(724, 256), (724, 314)], "#405c72", 3, True)
    canvas.box((706, 319, 727, 338), SKIN, 5)
    canvas.path([
        ("M", 705, 331), ("C", 714, 335, 721, 336, 729, 332),
        ("C", 736, 338, 745, 338, 754, 341),
        ("C", 762, 343, 764, 347, 761, 351),
        ("L", 703, 351), ("C", 699, 345, 700, 337, 705, 331),
    ], "#ffffff")
    canvas.line([(704, 350), (760, 350)], "#b6c9cd", 3, True)
    canvas.line([(730, 338), (725, 342)], "#9bb2bc", 2, True)
    canvas.line([(737, 340), (733, 344)], "#9bb2bc", 2, True)

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

    # The forearm follows the keyboard; the upper arm remains beside the torso.
    canvas.line([(614, 157), (614, 201)], SKIN, 17, True)
    canvas.line([(614, 201), (700, desk_top - 9)], SKIN, 14, True)
    canvas.ellipse((690, desk_top - 16, 718, desk_top - 2), SKIN)
    canvas.path([
        ("M", 600, 143), ("C", 610, 142, 617, 150, 621, 164),
        ("L", 625, 174), ("L", 603, 177), ("L", 594, 163),
        ("C", 590, 153, 591, 145, 600, 143),
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
    canvas.line([(614, 179), (636, 179), (636, 201)], GREEN, 2.5)
    canvas.ellipse((610, 197, 618, 205), GREEN)
    canvas.line([(640, 176), (648, 168)], "#80bead", 2)
    canvas.box((652, 144, 729, 181), "#ffffff", 10)
    canvas.text((665, 147), "90°", 24, GREEN, True)


def render(progress=0):
    progress = max(0, min(1, progress))
    desk_top = 172 + 38 * progress
    canvas = Canvas()
    canvas.box((44, 42, 278, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "02  /  MESA E COTOVELOS", 11, GREEN, True)
    canvas.text((44, 99), "Ajuste a mesa.", 37, INK, True)
    canvas.text((44, 143), "Relaxe os braços.", 37, INK, True)
    canvas.text((46, 210), "Mantenha os cotovelos a 90°.", 17, MUTED)
    canvas.text((46, 236), "Se precisar, use apoio para os pés.", 17, MUTED)
    if progress >= 1:
        canvas.box((44, 295, 302, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        canvas.text((90, 304), "Cotovelos a 90°", 16, GREEN, True)
    else:
        canvas.box((44, 295, 302, 337), "#e7efef", 21)
        canvas.text((65, 304), "Ajuste a altura da mesa", 16, INK, True)

    canvas.ellipse((474, 31, 906, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (919, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, desk_top)
    draw_person(canvas, desk_top)
    if progress >= 1:
        draw_elbow_angle(canvas)
    else:
        canvas.line([(932, desk_top - 25), (932, desk_top + 20)], GREEN, 3, True)
        canvas.line([(924, desk_top + 12), (932, desk_top + 20),
                     (940, desk_top + 12)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
