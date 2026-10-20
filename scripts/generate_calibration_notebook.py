from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH


def draw_desk(canvas):
    canvas.ellipse((476, 339, 901, 370), "#dce9e5")
    canvas.box((476, 321, 902, 334), "#adcac2", 6)
    canvas.box((482, 321, 897, 327), "#d0e4dc", 3)
    canvas.box((505, 333, 517, 365), "#91afa5", 4)
    canvas.box((864, 333, 876, 365), "#91afa5", 4)


def draw_notebook(canvas):
    # Front view keeps the screen and the built-in keyboard easy to identify.
    canvas.ellipse((560, 310, 846, 323), "#c4d9d0")
    canvas.box((579, 153, 822, 304), INK, 10)
    canvas.box((587, 162, 814, 294), "#d8eee7", 4)
    canvas.ellipse((698, 156, 702, 160), "#8ca6ae")

    # A quiet, generic screen avoids adding product-specific interface details.
    canvas.box((607, 180, 793, 197), "#ffffff", 5)
    canvas.box((607, 209, 666, 273), "#a3d9c7", 6)
    canvas.box((679, 210, 783, 220), "#ffffff", 4)
    canvas.box((679, 230, 768, 237), "#b1d5c9", 3)
    canvas.box((679, 246, 776, 253), "#b1d5c9", 3)
    canvas.box((679, 262, 746, 269), "#b1d5c9", 3)

    canvas.path([
        ("M", 579, 302), ("L", 822, 302),
        ("L", 848, 318), ("L", 848, 321),
        ("L", 553, 321), ("L", 553, 318),
    ], "#a6bbc2")
    canvas.path([
        ("M", 579, 302), ("L", 822, 302),
        ("L", 848, 318), ("L", 553, 318),
    ], "#dce6e8")
    for row in range(2):
        for column in range(12):
            x = 590 + column * 18
            y = 305 + row * 4
            canvas.box((x, y, x + 13, y + 2), "#829ba5", 1)
    canvas.box((670, 313, 731, 317), "#b7cad0", 2)
    canvas.line([(557, 320), (844, 320)], "#8da7b0", 2)


def render():
    canvas = Canvas()
    canvas.box((44, 42, 224, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "PREPARE SEU NOTEBOOK", 11, GREEN, True)
    canvas.text((44, 99), "Eleve seu", 37, INK, True)
    canvas.text((44, 143), "notebook.", 37, INK, True)
    canvas.text((46, 210), "Use um suporte, teclado", 17, MUTED)
    canvas.text((46, 236), "e mouse externos.", 17, MUTED)
    canvas.box((44, 295, 288, 337), "#e7efef", 21)
    canvas.text((65, 304), "Comece pelo suporte", 16, INK, True)

    canvas.ellipse((474, 31, 880, 373), "#e7f3ef")
    draw_desk(canvas)
    draw_notebook(canvas)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
