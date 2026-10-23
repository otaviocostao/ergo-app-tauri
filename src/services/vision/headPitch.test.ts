import { describe, expect, it } from "vitest";
import { calculateHeadPitch, type FaceTransformationMatrix } from "./biomechanics";

// Build a forward transform by rotating each basis vector about X, Y, then Z.
// Translation lives in the last column, matching MediaPipe's packed data.
function transform(pitch: number, yaw = 0, roll = 0, scale = 1): FaceTransformationMatrix {
  const [p, yawRadians, r] = [pitch, yaw, roll].map(degrees => degrees * Math.PI / 180);
  const rotate = ([x, y, z]: number[]) => {
    const afterX = [x, y * Math.cos(p) - z * Math.sin(p), y * Math.sin(p) + z * Math.cos(p)];
    const afterY = [afterX[0] * Math.cos(yawRadians) + afterX[2] * Math.sin(yawRadians), afterX[1],
      -afterX[0] * Math.sin(yawRadians) + afterX[2] * Math.cos(yawRadians)];
    return [afterY[0] * Math.cos(r) - afterY[1] * Math.sin(r), afterY[0] * Math.sin(r) + afterY[1] * Math.cos(r), afterY[2]];
  };
  return { rows: 4, columns: 4, data: [
    ...rotate([1, 0, 0]).map(value => value * scale), 0,
    ...rotate([0, 1, 0]).map(value => value * scale), 0,
    ...rotate([0, 0, 1]).map(value => value * scale), 0,
    13, -7, -65, 1,
  ] };
}

describe("vertical head orientation", () => {
  it.each([-120, -90, -80, -45, -21, -14, 0, 14, 21, 45, 80, 90, 120])("recovers a signed pitch of %s degrees", pitch => {
    expect(calculateHeadPitch(transform(pitch))).toBeCloseTo(pitch, 8);
  });

  it.each([[45, 30, -20], [-55, -35, 25], [0, 60, 40], [80, -60, -30]])(
    "separates pitch %s from yaw %s and roll %s", (pitch, yaw, roll) => {
      expect(calculateHeadPitch(transform(pitch, yaw, roll))).toBeCloseTo(pitch, 8);
    });

  it.each([0.1, 1, 10])("ignores translation and uniform scale %s without mutating the matrix", scale => {
    const matrix = transform(35, 20, -15, scale);
    Object.freeze(matrix.data); Object.freeze(matrix);
    expect(calculateHeadPitch(matrix)).toBeCloseTo(35, 8);
  });

  it.each([-90, 90])("rejects singular yaw %s instead of returning a false neutral angle", yaw => {
    expect(calculateHeadPitch(transform(40, yaw, 20))).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("rejects a non-finite matrix entry %s", invalid => {
    const data = [...transform(0).data]; data[6] = invalid;
    expect(calculateHeadPitch({ rows: 4, columns: 4, data })).toBeNull();
  });

  it("rejects missing, truncated, transposed, degenerate, reflected and sheared transforms", () => {
    expect(calculateHeadPitch(null)).toBeNull();
    expect(calculateHeadPitch(undefined)).toBeNull();
    expect(calculateHeadPitch({ rows: 3, columns: 3, data: Array(9).fill(0) })).toBeNull();
    expect(calculateHeadPitch({ rows: 4, columns: 4, data: [1, 2] })).toBeNull();
    expect(calculateHeadPitch({ rows: 4, columns: 4, data: Array(16).fill(0) })).toBeNull();
    for (const [index, value] of [[3, 13], [0, -1], [4, 0.5], [5, 2]]) {
      const data = [...transform(0).data]; data[index] = value;
      expect(calculateHeadPitch({ rows: 4, columns: 4, data })).toBeNull();
    }
  });
});
