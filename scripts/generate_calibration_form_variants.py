"""Render the additional demonstrations selected by the workspace form.

Run: python -B scripts/generate_calibration_form_variants.py
Reuses the existing procedural artwork; requires Pillow.
"""
from math import sin, pi
from pathlib import Path
import sys

from PIL import Image

from calibration_animation import save_loop
from generate_calibration_chair import BG, Canvas, GREEN, HEIGHT, INK, MUTED, SCALE, WIDTH, check, render as chair_frame
from generate_calibration_desk import TranslatedCanvas, draw_chair, draw_desk, draw_person, render as desk_frame
from generate_calibration_monitor import EYE_LEVEL, LOW_SCREEN_TOP, draw_eye_reference, draw_monitor, draw_notebook
from generate_calibration_distance import HorizontalCanvas, draw_distance_reference
from generate_calibration_notebook import draw_desk as draw_front_desk, draw_notebook as draw_front_notebook, draw_accessories
from generate_calibration_webcam import render as webcam_frame


OUTPUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "calibration"


def caption(canvas, badge, title, body, status, settled):
    canvas.box((38, 34, 446, 346), BG)
    canvas.box((44, 42, 412, 71), "#e4f2ee", 14)
    canvas.text((58, 47), badge, 11, GREEN, True)
    for index, line in enumerate(title):
        canvas.text((44, 99 + index * 44), line, 33, INK, True)
    for index, line in enumerate(body):
        canvas.text((46, 210 + index * 25), line, 16, MUTED)
    canvas.box((44, 295, 412, 337), "#def3ea" if settled else "#e7efef", 21)
    if settled:
        check(canvas, 63, 309)
    canvas.text((90 if settled else 65, 304), status, 15, GREEN if settled else INK, True)


def from_frame(frame):
    canvas = Canvas()
    canvas.image.paste(frame.resize(canvas.image.size, Image.Resampling.NEAREST))
    return canvas


def finish(canvas):
    return canvas.image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def side_scene():
    canvas = Canvas()
    canvas.ellipse((474, 31, 920, 373), "#e7f3ef")
    canvas.ellipse((518, 334, 799, 363), "#dce9e5")
    canvas.line([(457, 353), (929, 353)], "#c4d7d1", 2)
    draw_chair(canvas)
    draw_desk(canvas, 210)
    draw_person(canvas, 210)
    return canvas


def fixed_desk(progress, clock):
    canvas = side_scene()
    caption(canvas, "MESA E CADEIRA SEM REGULAGEM", ("Confira a altura.", "Apoie os braços."),
            ("Mantenha os braços relaxados.", "Se a altura não servir, procure", "mobiliário que permita o ajuste."),
            "Confira o apoio dos braços", progress >= 1)
    # Verification highlights the work area without moving either fixed item.
    pulse = 2 + sin(clock * pi)
    canvas.box((585, 180, 736, 217), None, 8, outline=GREEN, width=pulse)
    draw_desk(canvas, 210)
    draw_person(canvas, 210)
    return finish(canvas)


def supported_screen(progress, clock, notebook=False):
    canvas = side_scene()
    lift = (LOW_SCREEN_TOP - EYE_LEVEL) * progress
    before = canvas.image.copy()
    canvas.box((800, 174, 909, 210), "#72998d", 3)
    canvas.box((797, 171, 912, 177), "#a8d4c4", 2)
    canvas.image.paste(Image.blend(before, canvas.image, progress))
    elevated = TranslatedCanvas(canvas, -lift)
    if notebook:
        draw_notebook(elevated, 0)
    else:
        draw_monitor(elevated, 0)
    draw_eye_reference(canvas, progress >= 1)
    caption(canvas, "ALTURA DO NOTEBOOK" if notebook else "MONITOR SEM REGULAGEM",
            ("Use uma base", "firme e estável."),
            ("Eleve a tela com um suporte fixo.", "Confira o topo na altura dos olhos."),
            "Tela apoiada com estabilidade" if progress >= 1 else "Adicione uma base firme", progress >= 1)
    return finish(canvas)


class OffsetCanvas(HorizontalCanvas):
    def path(self, commands, fill, dy=0):
        shifted = [tuple([command[0]] + [value + self.dx if index % 2 == 0 else value
                    for index, value in enumerate(command[1:])]) for command in commands]
        self.canvas.path(shifted, fill, dy)


def screen_distance(progress, clock, notebook=False):
    canvas = side_scene()
    offset = -36 * (1 - progress)
    shifted = OffsetCanvas(canvas, offset)
    if notebook:
        draw_notebook(shifted, LOW_SCREEN_TOP - EYE_LEVEL)
    else:
        draw_monitor(shifted, LOW_SCREEN_TOP - EYE_LEVEL)
    draw_distance_reference(canvas, 787 + offset, progress >= 1)
    caption(canvas, "DISTÂNCIA DO NOTEBOOK" if notebook else "DISTÂNCIA DO MONITOR",
            ("Ajuste a distância", "da sua tela."),
            ("Mova o conjunto com cuidado.", "Mantenha a tela à sua frente e", "confira uma distância confortável."),
            "Tela à sua frente" if progress >= 1 else "Ajuste a posição da tela", progress >= 1)
    if progress < 1:
        canvas.line([(799 + offset, 185), (836 + offset, 185)], GREEN, 3, True)
        canvas.line([(828 + offset, 177), (836 + offset, 185), (828 + offset, 193)], GREEN, 3, True)
    return finish(canvas)


def peripherals(progress, clock, keyboard, mouse):
    canvas = Canvas()
    canvas.ellipse((474, 31, 900, 373), "#e7f3ef")
    draw_front_desk(canvas)
    # A fixed riser illustrates peripheral placement without an adjustable stand.
    canvas.box((600, 228, 802, 236), "#8aafa1", 3)
    canvas.box((616, 235, 630, 315), "#72998d", 3)
    canvas.box((770, 235, 784, 315), "#72998d", 3)
    draw_front_notebook(canvas, 90)
    base = canvas.image.copy()
    draw_accessories(canvas, 1 if keyboard else progress)
    mouse_canvas = Canvas()
    mouse_canvas.image.paste(base)
    draw_accessories(mouse_canvas, 1 if mouse else progress)
    bounds = tuple(int(value * SCALE) for value in (775, 275, 870, 327))
    canvas.image.paste(mouse_canvas.image.crop(bounds), bounds[:2])
    if keyboard and mouse:
        title = ("Organize teclado", "e mouse externos.")
        body = ("Você já possui os dois acessórios.", "Mantenha-os próximos ao corpo", "e na mesma superfície de apoio.")
        status = "Confira a posição dos acessórios"
    elif keyboard:
        title = ("Adicione um", "mouse externo.")
        body = ("Mantenha seu teclado externo.", "Posicione o mouse ao lado dele,", "sem precisar esticar o braço.")
        status = "Teclado mantido + mouse externo"
    elif mouse:
        title = ("Adicione um", "teclado externo.")
        body = ("Mantenha seu mouse externo.", "Use um teclado separado para", "posicionar a tela com liberdade.")
        status = "Mouse mantido + teclado externo"
    else:
        title = ("Use teclado", "e mouse externos.")
        body = ("Adicione os dois acessórios", "para separar a posição da tela", "da posição das suas mãos.")
        status = "Adicione os dois acessórios"
    caption(canvas, "ACESSÓRIOS DO NOTEBOOK", title, body, status, progress >= 1)
    return finish(canvas)


def aligned_webcam(progress, clock):
    canvas = from_frame(webcam_frame(1))
    caption(canvas, "WEBCAM JÁ POSICIONADA DE FRENTE", ("Confira rosto", "e ombros na tela."),
            ("Mantenha a câmera à sua frente.", "Confira rosto e ombros visíveis", "antes de iniciar a calibração."),
            "Mantenha o enquadramento", progress >= 1)
    color = GREEN if sin(clock * pi) >= 0 else "#80bead"
    canvas.line([(641, 151), (641, 133), (659, 133)], color, 3, True)
    canvas.line([(769, 305), (787, 305), (787, 287)], color, 3, True)
    return finish(canvas)


def main(names=None):
    variants = {
        "chair-footrest": lambda progress, clock: chair_frame(progress, clock, fixed_chair=True),
        "desk-adjustment": lambda progress, clock: desk_frame(progress),
        "desk-chair-adjustment": lambda progress, clock: desk_frame(chair_progress=progress, fixed_desk=True),
        "desk-fixed": fixed_desk,
        "monitor-height-support": supported_screen,
        "notebook-height-support": lambda progress, clock: supported_screen(progress, clock, notebook=True),
        "monitor-distance-adjustment": screen_distance,
        "notebook-distance": lambda progress, clock: screen_distance(progress, clock, notebook=True),
        "notebook-peripherals-ready": lambda progress, clock: peripherals(progress, clock, True, True),
        "notebook-peripherals-keyboard": lambda progress, clock: peripherals(progress, clock, False, True),
        "notebook-peripherals-mouse": lambda progress, clock: peripherals(progress, clock, True, False),
        "notebook-peripherals-both": lambda progress, clock: peripherals(progress, clock, False, False),
        "webcam-aligned": aligned_webcam,
    }
    for name in names or variants:
        if name not in variants:
            raise SystemExit(f"Unknown variant: {name}")
        save_loop(OUTPUT, name, variants[name])


if __name__ == "__main__":
    main(sys.argv[1:])
