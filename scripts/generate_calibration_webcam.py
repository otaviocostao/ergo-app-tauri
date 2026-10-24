"""Generate the webcam calibration GIF with a continuous shoulder silhouette.

Run: python scripts/generate_calibration_webcam.py
Requires Pillow and generate_calibration_chair.py in the same directory.
"""

from pathlib import Path

from PIL import Image

from generate_calibration_chair import (
    BG, Canvas, GREEN, HEIGHT, INK, MUTED, SKIN, WIDTH, check, ease,
)


FACE_CENTER_X = 714
INITIAL_CAMERA_X = 854
OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "calibration"


def draw_portrait(canvas):
    """Draw a centered adult with connected shoulders and relaxed forearms.

    Both sides share mirrored geometry. Arms sit behind the shirt, whose
    single outline contains the shoulders and sleeves without capsule caps.
    Coordinates use the existing Canvas API and the original portrait scale.
    """
    shirt = "#47ac98"
    shirt_shadow = "#359a89"
    shirt_light = "#5bb9a5"
    skin_shadow = "#c58b68"

    def mirrored(commands):
        return [
            (command[0], *(
                2 * FACE_CENTER_X - value if index % 2 == 0 else value
                for index, value in enumerate(command[1:])
            ))
            for command in commands
        ]

    # Upper arms emerge from the cuffs; elbows and wrists share a baseline.
    # A filled outline gives a smooth elbow without a circular end cap.
    arm = [
        ("M", 655, 256), ("L", 673, 257), ("L", 673, 276),
        ("C", 673, 279, 675, 280, 678, 280),
        ("L", 694, 280), ("L", 694, 292), ("L", 666, 292),
        ("C", 658, 292, 655, 287, 655, 280),
        ("L", 655, 256),
    ]
    for commands in (arm, mirrored(arm)):
        canvas.path(commands, SKIN)

    # Neck is shorter and visibly supported by the neckline and trapezius.
    canvas.path([
        ("M", 704, 198), ("L", 724, 198), ("L", 725, 217),
        ("C", 724, 225, 704, 225, 703, 217),
        ("L", 704, 198),
    ], SKIN)
    canvas.path([
        ("M", 704, 201), ("C", 710, 207, 718, 209, 724, 202),
        ("L", 724, 208), ("C", 718, 213, 709, 212, 704, 208),
    ], skin_shadow)

    # ONE silhouette: neckline -> sloping shoulders -> sleeves -> torso.
    # The shoulder starts at the neck instead of a separate rounded sleeve.
    canvas.path([
        ("M", 703, 216),
        ("C", 696, 219, 686, 221, 676, 226),
        ("C", 662, 231, 655, 239, 653, 249),
        ("L", 651, 262), ("L", 674, 265),
        ("L", 678, 253), ("L", 678, 296),
        ("C", 700, 298, 728, 298, 750, 296),
        ("L", 750, 253), ("L", 754, 265),
        ("L", 777, 262), ("L", 775, 249),
        ("C", 773, 239, 766, 231, 752, 226),
        ("C", 742, 221, 732, 219, 725, 216),
        ("C", 723, 227, 705, 227, 703, 216),
    ], shirt)

    # Subtle sleeve shading follows the shoulder slope, without a hard cap.
    sleeve = [
        ("M", 676, 226),
        ("C", 662, 231, 655, 239, 653, 249),
        ("L", 651, 262), ("L", 674, 265),
        ("L", 678, 253),
        ("C", 680, 244, 680, 234, 676, 226),
    ]
    for commands in (sleeve, mirrored(sleeve)):
        canvas.path(commands, shirt_light)

    # Soft folds remain inside the torso and do not split the shoulders.
    fold = [
        ("M", 678, 253), ("C", 679, 267, 681, 284, 686, 296),
        ("L", 678, 296), ("L", 678, 253),
    ]

    for commands in (fold, mirrored(fold)):
        canvas.path(commands, shirt_shadow)

    # Forearms and hands rest in front of the shirt, connected to both elbows.
    forearm = [
        ("M", 666, 280), ("L", 694, 280),
        ("C", 698, 278, 704, 278, 708, 280),
        ("C", 711, 282, 711, 290, 708, 292),
        ("C", 704, 294, 698, 294, 694, 292),
        ("L", 666, 292),
    ]
    for commands in (forearm, mirrored(forearm)):
        canvas.path(commands, SKIN)

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
