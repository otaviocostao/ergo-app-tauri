import { PostureStatus } from "../../enums/postureStatus";
import type { Point2D } from "../../services/vision/biomechanics";

const COLORS: Record<PostureStatus, string> = {
  [PostureStatus.GOOD]: "rgba(16, 185, 129, 0.85)",
  [PostureStatus.WARNING]: "rgba(245, 158, 11, 0.85)",
  [PostureStatus.DANGER]: "rgba(239, 68, 68, 0.85)",
};

export const metricColor = (status: PostureStatus | null | undefined): string =>
  status ? COLORS[status] : "rgba(148, 163, 184, 0.85)";

/** Display-only positions. Never feed these interpolated values into measurements. */
export class CanvasPose {
  private readonly target = new Float64Array(6);
  private readonly current = new Float64Array(6);
  private readonly projected = new Float64Array(6);
  private detectedAt = -Infinity;
  private renderedAt = -Infinity;

  reset(): void {
    this.detectedAt = this.renderedAt = -Infinity;
  }

  update(head: Point2D, left: Point2D, right: Point2D, now: number): void {
    this.target[0] = head.x; this.target[1] = head.y;
    this.target[2] = left.x; this.target[3] = left.y;
    this.target[4] = right.x; this.target[5] = right.y;
    if (now - this.detectedAt > 300) {
      this.current.set(this.target);
      this.renderedAt = now;
    }
    this.detectedAt = now;
  }

  /** Reuses its output storage; projects the mirrored, centered object-cover video. */
  drawPositions(now: number, width: number, height: number, frameWidth: number, frameHeight: number): Float64Array | null {
    if (now - this.detectedAt > 300) return null;
    const alpha = 1 - Math.exp(-Math.max(0, now - this.renderedAt) / 80);
    this.renderedAt = now;
    const scale = Math.max(width / frameWidth, height / frameHeight);
    const renderedWidth = frameWidth * scale, renderedHeight = frameHeight * scale;
    const offsetX = (width - renderedWidth) / 2, offsetY = (height - renderedHeight) / 2;
    for (let index = 0; index < 6; index += 2) {
      this.current[index] += (this.target[index] - this.current[index]) * alpha;
      this.current[index + 1] += (this.target[index + 1] - this.current[index + 1]) * alpha;
      this.projected[index] = (1 - this.current[index]) * renderedWidth + offsetX;
      this.projected[index + 1] = this.current[index + 1] * renderedHeight + offsetY;
    }
    return this.projected;
  }
}
