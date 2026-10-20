from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH, check


def draw_desk(canvas):
    canvas.ellipse((476, 339, 901, 370), "#dce9e5")
    canvas.box((476, 321, 902, 334), "#adcac2", 6)
    canvas.box((482, 321, 897, 327), "#d0e4dc", 3)
    canvas.box((505, 333, 517, 365), "#91afa5", 4)
    canvas.box((864, 333, 876, 365), "#91afa5", 4)


def draw_stand(canvas, lift):
    if lift <= 0:
        return
    canvas.line([(628, 323 - lift), (680, 315)], "#72998d", 12, True)
    canvas.line([(774, 323 - lift), (722, 315)], "#527e72", 12, True)
    canvas.box((600, 314, 802, 321), "#8aafa1", 3)
    canvas.box((600, 318 - lift, 802, 325 - lift), "#8aafa1", 3)
    canvas.box((611, 317 - lift, 790, 320 - lift), "#bed8cd", 1)


def draw_notebook(canvas, lift):
    dy = -lift
    # Front view keeps the screen and the built-in keyboard easy to identify.
    canvas.box((579, 153 + dy, 822, 304 + dy), INK, 10)
    canvas.box((587, 162 + dy, 814, 294 + dy), "#d8eee7", 4)
    canvas.ellipse((698, 156 + dy, 702, 160 + dy), "#8ca6ae")

    # A quiet, generic screen avoids adding product-specific interface details.
    canvas.box((607, 180 + dy, 793, 197 + dy), "#ffffff", 5)
    canvas.box((607, 209 + dy, 666, 273 + dy), "#a3d9c7", 6)
    canvas.box((679, 210 + dy, 783, 220 + dy), "#ffffff", 4)
    canvas.box((679, 230 + dy, 768, 237 + dy), "#b1d5c9", 3)
    canvas.box((679, 246 + dy, 776, 253 + dy), "#b1d5c9", 3)
    canvas.box((679, 262 + dy, 746, 269 + dy), "#b1d5c9", 3)

    canvas.path([
        ("M", 579, 302), ("L", 822, 302),
        ("L", 848, 318), ("L", 848, 321),
        ("L", 553, 321), ("L", 553, 318),
    ], "#a6bbc2", dy)
    canvas.path([
        ("M", 579, 302), ("L", 822, 302),
        ("L", 848, 318), ("L", 553, 318),
    ], "#dce6e8", dy)
    for row in range(2):
        for column in range(12):
            x = 590 + column * 18
            y = 305 + row * 4 + dy
            canvas.box((x, y, x + 13, y + 2), "#829ba5", 1)
    canvas.box((670, 313 + dy, 731, 317 + dy), "#b7cad0", 2)
    canvas.line([(557, 320 + dy), (844, 320 + dy)], "#8da7b0", 2)


def draw_accessories(canvas, progress):
    if progress <= 0:
        return
    before = canvas.image.copy()
    keyboard_dx = -28 * (1 - progress)
    mouse_dx = 28 * (1 - progress)

    # The external keyboard stays on the desk while the notebook is elevated.
    canvas.ellipse((502 + keyboard_dx, 312, 741 + keyboard_dx, 323), "#b4cdc2")
    canvas.box((507 + keyboard_dx, 290, 737 + keyboard_dx, 320), "#3d5c67", 6)
    canvas.box((510 + keyboard_dx, 290, 734 + keyboard_dx, 316), "#5e7d86", 4)
    for row in range(3):
        for column in range(13):
            x = 517 + column * 16 + keyboard_dx
            y = 295 + row * 5
            canvas.box((x, y, x + 11, y + 3), "#e0eee8", 1)
    canvas.box((587 + keyboard_dx, 311, 653 + keyboard_dx, 314), "#e0eee8", 1)
    canvas.box((518 + keyboard_dx, 311, 542 + keyboard_dx, 314), "#b2d6ca", 1)
    canvas.box((696 + keyboard_dx, 311, 721 + keyboard_dx, 314), "#b2d6ca", 1)

    # A separate mouse completes the setup without using the raised trackpad.
    canvas.ellipse((781 + mouse_dx, 312, 828 + mouse_dx, 323), "#b4cdc2")
    canvas.box((785 + mouse_dx, 282, 823 + mouse_dx, 319), "#3d5c67", 17)
    canvas.box((788 + mouse_dx, 283, 820 + mouse_dx, 314), "#5e7d86", 15)
    canvas.line([(804 + mouse_dx, 285), (804 + mouse_dx, 300)], "#b2d6ca", 1.5)
    canvas.line([(790 + mouse_dx, 300), (818 + mouse_dx, 300)], "#b2d6ca", 1.5)
    canvas.box((802 + mouse_dx, 288, 806 + mouse_dx, 295), "#e0eee8", 2)

    # Fade and slide together keep the arrival of the peripherals easy to follow.
    canvas.image.paste(Image.blend(before, canvas.image, progress))


def render(progress=0, accessories=0):
    progress = max(0, min(1, progress))
    accessories = max(0, min(1, accessories))
    lift = 90 * progress
    canvas = Canvas()
    canvas.box((44, 42, 224, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "PREPARE SEU NOTEBOOK", 11, GREEN, True)
    canvas.text((44, 99), "Eleve seu", 37, INK, True)
    canvas.text((44, 143), "notebook.", 37, INK, True)
    canvas.text((46, 210), "Use um suporte, teclado", 17, MUTED)
    canvas.text((46, 236), "e mouse externos.", 17, MUTED)
    if progress >= 1 and accessories >= 1:
        canvas.box((44, 295, 288, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        canvas.text((90, 304), "Tudo no lugar", 16, GREEN, True)
    else:
        canvas.box((44, 295, 288, 337), "#e7efef", 21)
        status = "Adicione teclado e mouse" if progress >= 1 else "Eleve com um suporte"
        canvas.text((65, 304), status, 16, INK, True)

    canvas.ellipse((474, 31, 880, 373), "#e7f3ef")
    draw_desk(canvas)
    canvas.ellipse((560, 310, 846, 323), "#c4d9d0")
    draw_stand(canvas, lift)
    draw_notebook(canvas, lift)
    draw_accessories(canvas, accessories)
    if progress < 1:
        canvas.line([(872, 239), (872, 186)], GREEN, 3, True)
        canvas.line([(864, 194), (872, 186), (880, 194)], GREEN, 3, True)
    if progress >= 1 and accessories >= 1:
        check(canvas, 550, 375)
        canvas.text((575, 373), "SUPORTE + TECLADO + MOUSE", 11, GREEN, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
