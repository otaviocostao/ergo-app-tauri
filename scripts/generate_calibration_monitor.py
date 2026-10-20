from pathlib import Path

from PIL import Image

from generate_calibration_chair import BG, Canvas, GREEN, HEIGHT, INK, MUTED, WIDTH, check, ease
from generate_calibration_desk import TranslatedCanvas, draw_chair, draw_desk, draw_person


EYE_LEVEL = 90
LOW_SCREEN_TOP = 126
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "calibration"


def draw_screen(canvas, lift):
    screen = TranslatedCanvas(canvas, -lift)
    screen.box((787, 126, 910, 202), INK, 6)
    screen.box((793, 132, 904, 195), "#d8eee7", 3)
    screen.box((805, 143, 892, 151), "#ffffff", 3)
    screen.box((805, 159, 831, 185), "#a3d9c7", 3)
    screen.box((839, 159, 890, 165), "#ffffff", 2)
    screen.box((839, 171, 882, 175), "#b1d5c9", 2)
    screen.box((839, 181, 887, 185), "#b1d5c9", 2)
    screen.ellipse((848, 198, 851, 201), "#8ca6ae")


def draw_monitor(canvas, lift):
    canvas.box((844, 195 - lift, 854, 206), "#91adb5", 3)
    canvas.box((819, 204, 885, 210), "#6f8e99", 3)
    draw_screen(canvas, lift)


def draw_notebook(canvas, lift):
    if lift > 0:
        # The stand raises the whole notebook while its feet stay on the desk.
        canvas.line([(813, 209 - lift), (838, 206)], "#72998d", 7, True)
        canvas.line([(890, 209 - lift), (865, 206)], "#527e72", 7, True)
        canvas.box((800, 205, 905, 210), "#8aafa1", 2)
        canvas.box((795, 207 - lift, 907, 211 - lift), "#8aafa1", 2)

    draw_screen(canvas, lift)
    base = TranslatedCanvas(canvas, -lift)
    base.path([
        ("M", 787, 202), ("L", 910, 202), ("L", 920, 208),
        ("L", 920, 210), ("L", 776, 210), ("L", 776, 208),
    ], "#a6bbc2")
    base.path([
        ("M", 787, 202), ("L", 910, 202),
        ("L", 920, 208), ("L", 776, 208),
    ], "#dce6e8")
    for row in range(2):
        for column in range(10):
            x = 796 + column * 11
            y = 203 + row * 2
            base.box((x, y, x + 7, y + 1), "#829ba5", 0.5)
    base.box((836, 207, 864, 208), "#b7cad0", 0.5)


def draw_eye_reference(canvas, settled):
    color = GREEN if settled else "#9dbfb4"
    canvas.box((650, 60, 791, 82), "#def3ea", 10)
    canvas.text((661, 64), "ALTURA DOS OLHOS", 10, GREEN, True)
    for x in range(634, 790, 16):
        canvas.line([(x, EYE_LEVEL), (min(x + 8, 790), EYE_LEVEL)], color, 2)
    if settled:
        canvas.ellipse((790, EYE_LEVEL - 4, 798, EYE_LEVEL + 4), GREEN)
        canvas.line([(794, EYE_LEVEL), (902, EYE_LEVEL)], GREEN, 2)


def render(progress=0, notebook=False):
    progress = max(0, min(1, progress))
    lift = (LOW_SCREEN_TOP - EYE_LEVEL) * progress
    settled = progress >= 1
    canvas = Canvas()
    canvas.box((44, 42, 298, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "03  /  ALTURA DO MONITOR", 11, GREEN, True)
    if notebook:
        canvas.text((44, 99), "Usa notebook?", 37, INK, True)
        canvas.text((44, 143), "Eleve com suporte.", 37, INK, True)
        canvas.text((46, 210), "Use uma base para elevar a tela", 17, MUTED)
        canvas.text((46, 236), "até a altura dos seus olhos.", 17, MUTED)
    else:
        canvas.text((44, 99), "Eleve a tela.", 37, INK, True)
        canvas.text((44, 143), "Alinhe aos olhos.", 37, INK, True)
        canvas.text((46, 210), "O topo da tela deve ficar", 17, MUTED)
        canvas.text((46, 236), "na altura dos seus olhos.", 17, MUTED)
    if settled:
        canvas.box((44, 295, 312, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        canvas.text((90, 304), "Tela alinhada aos olhos", 16, GREEN, True)
    else:
        canvas.box((44, 295, 312, 337), "#e7efef", 21)
        status = "Eleve com um suporte" if notebook else "Ajuste a base do monitor"
        canvas.text((65, 304), status, 16, INK, True)

    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    if notebook:
        draw_notebook(canvas, lift)
    else:
        draw_monitor(canvas, lift)
    draw_person(canvas, 210)
    draw_eye_reference(canvas, settled)
    if not settled:
        canvas.line([(931, 165), (931, 110)], GREEN, 3, True)
        canvas.line([(923, 118), (931, 110), (939, 118)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    start = render()
    monitor_adjusted = render(1)
    notebook_start = render(notebook=True)
    notebook_adjusted = render(1, notebook=True)
    monitor_adjusted.save(OUTPUT / "monitor-height-still.png", optimize=True)

    # Both examples share a palette so colors remain stable across the loop.
    palette_source = Image.new("RGB", (WIDTH, HEIGHT * 4), BG)
    for index, scene in enumerate((start, monitor_adjusted, notebook_start, notebook_adjusted)):
        palette_source.paste(scene, (0, HEIGHT * index))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT)

    blank = Image.new("RGB", start.size, BG)
    frames = []
    for index in range(200):
        time = index * 0.08
        if time < 5.6:
            frame = render(ease((time - 0.8) / 2))
        elif time < 6.16:
            frame = Image.blend(monitor_adjusted, blank, ease((time - 5.6) / 0.56))
        elif time < 6.72:
            frame = Image.blend(blank, notebook_start, ease((time - 6.16) / 0.56))
        elif time < 14.88:
            frame = render(ease((time - 7.2) / 2), notebook=True)
        elif time < 15.44:
            frame = Image.blend(notebook_adjusted, blank, ease((time - 14.88) / 0.56))
        else:
            frame = Image.blend(blank, start, ease((time - 15.44) / 0.56))
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))

    path = OUTPUT / "monitor-height.gif"
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
