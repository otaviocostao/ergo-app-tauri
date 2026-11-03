/** Provisional acquisition thresholds approved for Task 4.5; not a clinical measure. */
export class LightingFeedback {
  private low = false;
  private since: number | null = null;
  private lastAt: number | null = null;

  reset(): void {
    this.low = false;
    this.since = this.lastAt = null;
  }

  update(pixels: Uint8ClampedArray, now: number): boolean {
    if (this.lastAt !== null && now - this.lastAt > 1000) this.since = null;
    this.lastAt = now;
    if (!pixels.length) return this.low;
    let luminance = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      luminance += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
    }
    luminance /= pixels.length / 4;
    const transitioning = this.low ? luminance > 55 : luminance < 40;
    if (!transitioning) this.since = null;
    else {
      this.since ??= now;
      if (now - this.since >= (this.low ? 1000 : 2000)) {
        this.low = !this.low;
        this.since = null;
      }
    }
    return this.low;
  }
}
