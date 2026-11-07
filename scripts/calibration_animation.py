"""Shared GIF/PNG export for the procedural calibration illustrations."""
from PIL import Image, ImageSequence


def smooth(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def save_loop(output, name, render, background="#f5faf9"):
    output.mkdir(parents=True, exist_ok=True)
    start, middle, settled = (render(progress, 0) for progress in (0, 0.5, 1))
    settled.save(output / f"{name}-still.png", optimize=True)
    width, height = start.size
    palette_source = Image.new("RGB", (width, height * 3), background)
    for index, frame in enumerate((start, middle, settled)):
        palette_source.paste(frame, (0, height * index))
    palette = palette_source.quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    blank = Image.new("RGB", start.size, background)
    frames = []
    for index in range(100):
        clock = index * 0.08
        if clock < 6.88:
            frame = render(smooth((clock - 0.8) / 2), clock)
        elif clock < 7.44:
            frame = Image.blend(settled, blank, smooth((clock - 6.88) / 0.56))
        else:
            frame = Image.blend(blank, start, smooth((clock - 7.44) / 0.56))
        frames.append(frame.quantize(palette=palette, dither=Image.Dither.NONE))
    path = output / f"{name}.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=80,
                   loop=0, disposal=1, optimize=True)
    with Image.open(path) as gif:
        duration = sum(frame.info.get("duration", 0) for frame in ImageSequence.Iterator(gif))
        print(f"{name}: {gif.n_frames} frames, {duration / 1000:.2f}s, {path.stat().st_size / 1024:.0f} KiB")
