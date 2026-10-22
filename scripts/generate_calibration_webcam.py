from PIL import Image

from generate_calibration_chair import Canvas, GREEN, HEIGHT, INK, MUTED, SKIN, WIDTH


FACE_CENTER_X = 714
INITIAL_CAMERA_X = 854


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


def render():
    canvas = Canvas()
    canvas.box((44, 42, 323, 71), "#e4f2ee", 14)
    canvas.text((58, 47), "POSICIONAMENTO DA WEBCAM", 11, GREEN, True)
    canvas.text((44, 99), "Alinhe sua", 37, INK, True)
    canvas.text((44, 143), "webcam.", 37, INK, True)
    canvas.text((46, 210), "Posicione a câmera diretamente", 17, MUTED)
    canvas.text((46, 236), "à sua frente, alinhada ao rosto.", 17, MUTED)
    canvas.box((44, 295, 330, 337), "#e7efef", 21)
    canvas.text((65, 304), "Ajuste a posição da câmera", 16, INK, True)

    canvas.ellipse((474, 31, 930, 373), "#e7f3ef")
    canvas.ellipse((548, 344, 895, 369), "#dce9e5")
    canvas.box((492, 353, 934, 366), "#adcac2", 6)
    canvas.box((498, 353, 928, 358), "#d0e4dc", 3)
    draw_monitor(canvas)
    draw_webcam(canvas, INITIAL_CAMERA_X)
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
