from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH
from generate_calibration_desk import draw_chair, draw_desk, draw_person


def draw_monitor(canvas):
    canvas.box((844, 195, 854, 206), "#91adb5", 3)
    canvas.box((819, 204, 885, 210), "#6f8e99", 3)
    canvas.box((787, 126, 910, 202), INK, 6)
    canvas.box((793, 132, 904, 195), "#d8eee7", 3)
    canvas.box((805, 143, 892, 151), "#ffffff", 3)
    canvas.box((805, 159, 831, 185), "#a3d9c7", 3)
    canvas.box((839, 159, 890, 165), "#ffffff", 2)
    canvas.box((839, 171, 882, 175), "#b1d5c9", 2)
    canvas.box((839, 181, 887, 185), "#b1d5c9", 2)
    canvas.ellipse((848, 198, 851, 201), "#8ca6ae")


def render():
    canvas = Canvas()
    canvas.box((44, 42, 298, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "03  /  ALTURA DO MONITOR", 11, GREEN, True)
    canvas.text((44, 99), "Eleve a tela.", 37, INK, True)
    canvas.text((44, 143), "Alinhe aos olhos.", 37, INK, True)
    canvas.text((46, 210), "O topo da tela deve ficar", 17, MUTED)
    canvas.text((46, 236), "na altura dos seus olhos.", 17, MUTED)
    canvas.box((44, 295, 312, 337), "#e7efef", 21)
    canvas.text((65, 304), "Ajuste a base do monitor", 16, INK, True)

    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    draw_monitor(canvas)
    draw_person(canvas, 210)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
