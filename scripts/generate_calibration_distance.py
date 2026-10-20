from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH, check
from generate_calibration_desk import draw_chair, draw_desk, draw_person
from generate_calibration_monitor import EYE_LEVEL, LOW_SCREEN_TOP, draw_monitor


CLOSE_OFFSET = -36


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


def draw_distance_reference(canvas, monitor_left, settled):
    start = 634
    center = (start + monitor_left) / 2
    color = GREEN if settled else "#9dbfb4"
    canvas.box((center - 56, 27, center + 56, 49), "#def3ea", 10)
    label = "50 a 70 cm" if settled else "AFASTE A TELA"
    label_x = center - 29 if settled else center - 40
    canvas.text((label_x, 31), label, 10, GREEN, True)
    canvas.line([(start, 58), (monitor_left, 58)], color, 2)
    canvas.line([(start + 6, 53), (start, 58), (start + 6, 63)], color, 2)
    canvas.line([(monitor_left - 6, 53), (monitor_left, 58),
                 (monitor_left - 6, 63)], color, 2)
    for x in (start, monitor_left):
        canvas.line([(x, 69), (x, 85)], color, 1.5)


def render(progress=0):
    progress = max(0, min(1, progress))
    offset = CLOSE_OFFSET * (1 - progress)
    monitor_left = 787 + offset
    settled = progress >= 1
    canvas = Canvas()
    canvas.box((44, 42, 336, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "04  /  DISTÂNCIA DO MONITOR", 11, GREEN, True)
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
        canvas.text((65, 304), "Afaste o monitor", 16, INK, True)

    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    draw_monitor(HorizontalCanvas(canvas, offset), LOW_SCREEN_TOP - EYE_LEVEL)
    draw_person(canvas, 210)
    draw_distance_reference(canvas, monitor_left, settled)
    if not settled:
        canvas.line([(monitor_left + 12, 185), (monitor_left + 49, 185)], GREEN, 3, True)
        canvas.line([(monitor_left + 41, 177), (monitor_left + 49, 185),
                     (monitor_left + 41, 193)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
