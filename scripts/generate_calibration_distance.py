from math import hypot, sqrt

from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH, check
from generate_calibration_desk import draw_chair, draw_desk, draw_person
from generate_calibration_monitor import EYE_LEVEL, LOW_SCREEN_TOP, draw_monitor, draw_screen


CLOSE_OFFSET = -36
FAR_OFFSET = 24


class HorizontalCanvas:
    def __init__(self, canvas, dx):
        self.canvas = canvas
        self.dx = dx

    def box(self, bounds, *args, **kwargs):
        x1, y1, x2, y2 = bounds
        self.canvas.box((x1 + self.dx, y1, x2 + self.dx, y2), *args, **kwargs)

    def ellipse(self, bounds, *args, **kwargs):
        x1, y1, x2, y2 = bounds
        self.canvas.ellipse((x1 + self.dx, y1, x2 + self.dx, y2), *args, **kwargs)

    def line(self, points, *args, **kwargs):
        self.canvas.line([(x + self.dx, y) for x, y in points], *args, **kwargs)


def draw_articulated_monitor(canvas, offset):
    anchor = (900, 190)
    attachment = (849 + offset, 166)
    dx = attachment[0] - anchor[0]
    dy = attachment[1] - anchor[1]
    distance = hypot(dx, dy)
    # Two links of equal length rotate around a fixed clamp on the desk.
    height = sqrt(40**2 - (distance / 2)**2)
    elbow = ((anchor[0] + attachment[0]) / 2 + dy / distance * height,
             (anchor[1] + attachment[1]) / 2 - dx / distance * height)
    canvas.box((896, 190, 904, 208), "#6f9386", 3)
    canvas.box((886, 205, 911, 210), "#527e72", 2)
    canvas.line([anchor, elbow], "#72998d", 7, True)
    canvas.line([elbow, attachment], "#527e72", 7, True)
    for x, y in (anchor, elbow):
        canvas.ellipse((x - 5, y - 5, x + 5, y + 5), "#456876")
        canvas.ellipse((x - 2, y - 2, x + 2, y + 2), "#b2d6ca")
    draw_screen(HorizontalCanvas(canvas, offset), LOW_SCREEN_TOP - EYE_LEVEL)


def draw_distance_reference(canvas, monitor_left, settled, approaching=False):
    start = 634
    center = (start + monitor_left) / 2
    color = GREEN if settled else "#9dbfb4"
    canvas.box((center - 56, 27, center + 56, 49), "#def3ea", 10)
    if settled:
        label, label_x = "50 a 70 cm", center - 29
    elif approaching:
        label, label_x = "APROXIME A TELA", center - 46
    else:
        label, label_x = "AFASTE A TELA", center - 40
    canvas.text((label_x, 31), label, 10, GREEN, True)
    canvas.line([(start, 58), (monitor_left, 58)], color, 2)
    canvas.line([(start + 6, 53), (start, 58), (start + 6, 63)], color, 2)
    canvas.line([(monitor_left - 6, 53), (monitor_left, 58),
                 (monitor_left - 6, 63)], color, 2)
    for x in (start, monitor_left):
        canvas.line([(x, 69), (x, 85)], color, 1.5)


def render(progress=0, articulated=False):
    progress = max(0, min(1, progress))
    offset = (FAR_OFFSET if articulated else CLOSE_OFFSET) * (1 - progress)
    monitor_left = 787 + offset
    settled = progress >= 1
    canvas = Canvas()
    canvas.box((44, 42, 336, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "04  /  DISTÂNCIA DO MONITOR", 11, GREEN, True)
    if articulated:
        canvas.text((44, 99), "Use o suporte", 37, INK, True)
        canvas.text((44, 143), "articulado.", 37, INK, True)
        canvas.text((46, 210), "Mova a tela para frente ou para trás", 17, MUTED)
        canvas.text((46, 236), "até ficar a um braço de distância.", 17, MUTED)
    else:
        canvas.text((44, 99), "Ajuste a", 37, INK, True)
        canvas.text((44, 143), "distância da tela.", 37, INK, True)
        canvas.text((46, 210), "Deixe a tela a cerca de um braço,", 17, MUTED)
        canvas.text((46, 236), "aproximadamente 50 a 70 cm.", 17, MUTED)
    if settled:
        canvas.box((44, 295, 312, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        canvas.text((90, 304), "Um braço de distância", 16, GREEN, True)
    else:
        canvas.box((44, 295, 312, 337), "#e7efef", 21)
        status = "Aproxime o monitor" if articulated else "Afaste o monitor"
        canvas.text((65, 304), status, 16, INK, True)

    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    if articulated:
        draw_articulated_monitor(canvas, offset)
    else:
        draw_monitor(HorizontalCanvas(canvas, offset), LOW_SCREEN_TOP - EYE_LEVEL)
    draw_person(canvas, 210)
    draw_distance_reference(canvas, monitor_left, settled, approaching=articulated)
    if not settled:
        if articulated:
            canvas.line([(monitor_left + 49, 185), (monitor_left + 12, 185)], GREEN, 3, True)
            canvas.line([(monitor_left + 20, 177), (monitor_left + 12, 185),
                         (monitor_left + 20, 193)], GREEN, 3, True)
        else:
            canvas.line([(monitor_left + 12, 185), (monitor_left + 49, 185)], GREEN, 3, True)
            canvas.line([(monitor_left + 41, 177), (monitor_left + 49, 185),
                         (monitor_left + 41, 193)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
