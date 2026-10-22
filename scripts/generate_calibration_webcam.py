from pathlib import Path

from PIL import Image

from generate_calibration_chair import BG, Canvas, GREEN, HEIGHT, INK, MUTED, SKIN, WIDTH, check, ease


FACE_CENTER_X = 714
INITIAL_CAMERA_X = 854
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "calibration"


def draw_portrait(canvas):
    # A frontal preview makes the relationship between face and camera clear.
    canvas.box((703, 207, 725, 239), SKIN, 6)
    canvas.path([
        ("M", 658, 310), ("L", 659, 268),
        ("C", 659, 242, 677, 230, 702, 226),
        ("C", 707, 236, 721, 236, 726, 226),
        ("C", 751, 230, 771, 242, 771, 268),
        ("L", 772, 310),
    ], "#47ac98")
    canvas.path([
        ("M", 659, 268), ("C", 663, 285, 667, 301, 681, 310),
        ("L", 658, 310),
    ], "#359a89")
    canvas.box((661, 268, 679, 310), SKIN, 8)
    canvas.box((751, 268, 769, 310), SKIN, 8)
    canvas.box((657, 246, 683, 280), "#5bb9a5", 10)
    canvas.box((747, 246, 773, 280), "#5bb9a5", 10)

    canvas.ellipse((685, 178, 695, 195), "#d0926e")
    canvas.ellipse((733, 178, 743, 195), "#d0926e")
    canvas.path([
        ("M", 690, 166), ("C", 690, 149, 738, 149, 738, 166),
        ("L", 738, 184), ("C", 738, 207, 728, 217, 714, 217),
        ("C", 700, 217, 690, 207, 690, 184),
    ], SKIN)
    canvas.path([
        ("M", 688, 182), ("C", 680, 160, 689, 143, 704, 142),
        ("C", 724, 135, 743, 145, 741, 164),
        ("L", 738, 180), ("L", 732, 165),
        ("C", 720, 171, 710, 159, 698, 164), ("L", 694, 182),
    ], "#293e4d")
    canvas.line([(702, 175), (709, 174)], "#76513f", 1.5, True)
    canvas.line([(719, 174), (726, 175)], "#76513f", 1.5, True)
    canvas.ellipse((704, 179, 708, 183), INK)
    canvas.ellipse((720, 179, 724, 183), INK)
    canvas.line([(714, 183), (712, 193), (716, 193)], "#b77d5c", 1.3, True)
    canvas.line([(708, 202), (714, 204), (720, 202)], "#a66d54", 1.5, True)


def draw_monitor(canvas):
    canvas.box((708, 317, 720, 348), "#91adb5", 4)
    canvas.box((666, 346, 763, 353), "#6f8e99", 3)
    canvas.box((516, 112, 912, 322), INK, 12)
    canvas.box((526, 122, 902, 311), "#e0f1e9", 6)
    draw_portrait(canvas)
    canvas.ellipse((712, 315, 716, 319), "#8ca6ae")


def draw_webcam(canvas, center):
    canvas.box((center - 10, 106, center + 10, 120), "#8ca6ae", 3)
    canvas.box((center - 34, 83, center + 34, 111), "#456876", 9)
    canvas.box((center - 30, 85, center + 30, 107), "#597f89", 7)
    canvas.ellipse((center - 11, 86, center + 11, 108), INK)
    canvas.ellipse((center - 7, 90, center + 7, 104), "#87b7b9")
    canvas.ellipse((center - 4, 93, center + 4, 101), "#284c61")
    canvas.ellipse((center - 3, 92, center, 95), "#e3f2f0")
    canvas.ellipse((center + 23, 94, center + 27, 98), GREEN)


def draw_alignment_guides(canvas, settled):
    color = GREEN if settled else "#95b9ae"
    # Mark the central axis without covering the eyes, nose or mouth.
    for start, end in ((124, 139), (220, 235), (283, 301)):
        for y in range(start, end, 7):
            canvas.line([(FACE_CENTER_X, y), (FACE_CENTER_X, min(y + 3, end))], color, 2)

    # Corner brackets frame the head and shoulders inside the camera preview.
    for points in (
        [(641, 151), (641, 133), (659, 133)],
        [(769, 133), (787, 133), (787, 151)],
        [(641, 287), (641, 305), (659, 305)],
        [(769, 305), (787, 305), (787, 287)],
    ):
        canvas.line(points, color, 2.5, True)

    if settled:
        canvas.ellipse((FACE_CENTER_X - 3, 127, FACE_CENTER_X + 3, 133), GREEN)
        canvas.box((805, 133, 888, 157), "#def3ea", 11)
        canvas.text((817, 138), "ALINHADA", 10, GREEN, True)


def render(progress=0):
    progress = max(0, min(1, progress))
    camera_center = INITIAL_CAMERA_X + (FACE_CENTER_X - INITIAL_CAMERA_X) * progress
    settled = progress >= 1
    canvas = Canvas()
    canvas.box((44, 42, 323, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "POSICIONAMENTO DA WEBCAM", 11, GREEN, True)
    canvas.text((44, 99), "Alinhe sua", 37, INK, True)
    canvas.text((44, 143), "webcam.", 37, INK, True)
    canvas.text((46, 210), "Posicione a câmera diretamente", 17, MUTED)
    canvas.text((46, 236), "à sua frente, alinhada ao rosto.", 17, MUTED)
    if settled:
        canvas.box((44, 295, 330, 337), "#def3ea", 21)
        check(canvas, 63, 309)
        canvas.text((90, 304), "Webcam à sua frente", 16, GREEN, True)
    else:
        canvas.box((44, 295, 330, 337), "#e7efef", 21)
        canvas.text((65, 304), "Mova a câmera para o centro", 16, INK, True)

    canvas.ellipse((474, 31, 930, 373), "#e7f3ef")
    canvas.ellipse((548, 344, 895, 369), "#dce9e5")
    canvas.box((492, 353, 934, 366), "#adcac2", 6)
    canvas.box((498, 353, 928, 358), "#d0e4dc", 3)
    draw_monitor(canvas)
    draw_alignment_guides(canvas, settled)
    draw_webcam(canvas, camera_center)
    if camera_center - FACE_CENTER_X > 20:
        canvas.line([(camera_center, 61), (FACE_CENTER_X, 61)], GREEN, 3, True)
        canvas.line([(FACE_CENTER_X + 8, 53), (FACE_CENTER_X, 61),
                     (FACE_CENTER_X + 8, 69)], GREEN, 3, True)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    start = render()
    still = render(1)
    still.save(OUTPUT / "webcam-position-still.png", optimize=True)

    # A shared palette keeps the portrait stable while the webcam moves.
    palette_source = Image.new("RGB", (WIDTH, HEIGHT * 3), BG)
    for index, scene in enumerate((start, render(0.5), still)):
        palette_source.paste(scene, (0, HEIGHT * index))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT)

    blank = Image.new("RGB", start.size, BG)
    frames = []
    for index in range(100):
        time = index * 0.08
        if time < 6.88:
            frame = render(ease((time - 0.8) / 2.4))
        elif time < 7.44:
            frame = Image.blend(still, blank, ease((time - 6.88) / 0.56))
        else:
            frame = Image.blend(blank, start, ease((time - 7.44) / 0.56))
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))

    path = OUTPUT / "webcam-position.gif"
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
