from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH
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


def render():
    canvas = Canvas()
    canvas.box((44, 42, 336, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "04  /  DISTÂNCIA DO MONITOR", 11, GREEN, True)
    canvas.text((44, 99), "Ajuste a", 37, INK, True)
    canvas.text((44, 143), "distância da tela.", 37, INK, True)
    canvas.text((46, 210), "Deixe a tela a cerca de um braço,", 17, MUTED)
    canvas.text((46, 236), "aproximadamente 50 a 70 cm.", 17, MUTED)
    canvas.box((44, 295, 312, 337), "#e7efef", 21)
    canvas.text((65, 304), "Ajuste a posição da tela", 16, INK, True)

    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    draw_monitor(HorizontalCanvas(canvas, CLOSE_OFFSET), LOW_SCREEN_TOP - EYE_LEVEL)
    draw_person(canvas, 210)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
