import { describe, expect, it } from "vitest";
import { CanvasPose, metricColor } from "./canvasFeedback";
import { PostureStatus } from "../../enums/postureStatus";

describe("canvas-only posture feedback", () => {
  it("uses distinct classifier colors and a neutral unavailable color", () => {
    expect(new Set([null, ...Object.values(PostureStatus)].map(metricColor)).size).toBe(4);
    expect(metricColor(null)).toBe(metricColor(undefined));
  });

  it("projects mirrored points through a centered crop and smooths only its own copy", () => {
    const pose = new CanvasPose();
    const head = { x: 0.6, y: 0.2 }, left = { x: 0.3, y: 0.6 }, right = { x: 0.7, y: 0.6 };
    pose.update(head, left, right, 100);
    const positions = pose.drawPositions(100, 400, 400, 1280, 720)!;
    expect(positions[0]).toBeCloseTo((1 - 0.6) * 1280 * (400 / 720) + (400 - 1280 * (400 / 720)) / 2);
    expect(positions[1]).toBeCloseTo(80);
    head.x = 0.8;
    pose.update(head, left, right, 190);
    expect(pose.drawPositions(206, 400, 400, 1280, 720)).toBe(positions);
    expect(positions[0]).toBeLessThan(129);
    expect(positions[0]).toBeGreaterThan(-14);
    expect(head.x).toBe(0.8);
    expect(pose.drawPositions(491, 400, 400, 1280, 720)).toBeNull();
    pose.update(head, left, right, 600);
    pose.reset();
    expect(pose.drawPositions(601, 400, 400, 1280, 720)).toBeNull();
  });
});
