import { describe, expect, it } from "vitest";
import {
  calculateEAR,
  calculateMeanEAR,
  estimateScreenDistance,
  clampScreenDistance,
  smoothScreenDistance,
  calculateNeckAngle,
  calculateShoulderAngle,
  calculateShoulderBalance,
  type Point2D,
} from "./biomechanics";

const origin: Point2D = { x: 0, y: 0 };
const nose: Point2D = { x: 0, y: -4 };
const ear: Point2D = { x: 0, y: -2 };

function rotate(point: Point2D, degrees: number): Point2D {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function transform(point: Point2D, scale: number, offset: Point2D): Point2D {
  return { x: point.x * scale + offset.x, y: point.y * scale + offset.y };
}

describe("calculateNeckAngle", () => {
  it("measures zero for a head centered above the shoulders", () => {
    expect(calculateNeckAngle(nose, ear, origin)).toBe(0);
  });

  it.each([-180, -120, -90, -60, -45, -30, -20, -12, -5, 5, 12, 20, 30, 45, 60, 90, 120, 180])(
    "measures a simulated %s degree rotation from the upward vertical",
    (degrees) => {
      expect(calculateNeckAngle(rotate(nose, degrees), rotate(ear, degrees), origin))
        .toBeCloseTo(Math.abs(degrees), 10);
    },
  );

  it("uses both nose and ear to locate the head midpoint", () => {
    expect(calculateNeckAngle({ x: 6, y: -4 }, ear, origin)).toBeCloseTo(45, 10);
    expect(calculateNeckAngle(nose, { x: 6, y: -2 }, origin)).toBeCloseTo(45, 10);
  });

  it.each([-3, 3])("measures a horizontal head displacement of %s units", (dx) => {
    expect(calculateNeckAngle({ x: dx, y: -4 }, { x: dx, y: -2 }, origin))
      .toBeCloseTo(45, 10);
  });

  it.each([0.01, 1, 1000])("is invariant under translation and uniform scale %s", (scale) => {
    const offset = { x: 320, y: 240 };
    const points = [rotate(nose, 30), rotate(ear, 30), origin]
      .map((point) => transform(point, scale, offset));

    expect(calculateNeckAngle(points[0], points[1], points[2])).toBeCloseTo(30, 9);
  });

  it("preserves the angle when the image is mirrored", () => {
    const points = [rotate(nose, 35), rotate(ear, 35), origin];
    const mirrored = points.map(({ x, y }) => ({ x: 640 - x, y }));

    expect(calculateNeckAngle(mirrored[0], mirrored[1], mirrored[2])).toBeCloseTo(35, 10);
  });

  it("measures 45 degrees after converting normalized landmarks to a 1200x600 frame", () => {
    const pixels = ({ x, y }: Point2D): Point2D => ({ x: x * 1200, y: y * 600 });

    expect(calculateNeckAngle(
      pixels({ x: 0.375, y: 0.15 }),
      pixels({ x: 0.625, y: 0.35 }),
      pixels({ x: 0.25, y: 0.75 }),
    )).toBeCloseTo(45, 10);
  });

  it("returns null when the head midpoint coincides with the shoulder center", () => {
    expect(calculateNeckAngle({ x: -1, y: -1 }, { x: 1, y: 1 }, origin)).toBeNull();
  });

  it("does not discard a small but nonzero neck vector", () => {
    expect(calculateNeckAngle(
      { x: 1e-12, y: -1.5e-12 },
      { x: 1e-12, y: -0.5e-12 },
      origin,
    )).toBeCloseTo(45, 10);
  });

  it("returns null when finite coordinates overflow during subtraction", () => {
    expect(calculateNeckAngle(
      { x: Number.MAX_VALUE, y: -4 },
      { x: Number.MAX_VALUE, y: -2 },
      { x: -Number.MAX_VALUE, y: 0 },
    )).toBeNull();
  });
});

describe("calculateShoulderAngle", () => {
  it.each([-90, -45, -15, -10, -6, -3, 0, 3, 6, 10, 15, 45, 90])(
    "preserves a %s degree inclination before percentage clamping", degrees => {
      const right = rotate({ x: 2, y: 0 }, degrees);
      expect(calculateShoulderAngle(origin, right)).toBeCloseTo(Math.abs(degrees), 10);
      expect(calculateShoulderAngle(right, origin)).toBeCloseTo(Math.abs(degrees), 10);
      expect(calculateShoulderAngle(origin, { x: -right.x, y: right.y }))
        .toBeCloseTo(Math.abs(degrees), 10);
    },
  );

  it("rejects coincident points, non-finite coordinates and subtraction overflow", () => {
    expect(calculateShoulderAngle(origin, origin)).toBeNull();
    expect(calculateShoulderAngle(origin, { x: NaN, y: 1 })).toBeNull();
    expect(calculateShoulderAngle({ x: Infinity, y: 0 }, origin)).toBeNull();
    expect(calculateShoulderAngle({ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 0 })).toBeNull();
  });
});

describe("calculateShoulderBalance", () => {
  it.each([
    [-180, 100], [-179, 90], [-175, 50], [-90, 0], [-45, 0], [-10, 0],
    [-6, 40], [-3, 70], [-1, 90], [0, 100], [1, 90], [3, 70], [6, 40],
    [9.5, 5], [10, 0], [10.1, 0], [45, 0], [90, 0], [175, 50], [179, 90], [180, 100],
  ])("maps a %s degree shoulder line to %s percent", (degrees, expected) => {
    const right = rotate({ x: 2, y: 0 }, degrees);

    expect(calculateShoulderBalance(origin, right)).toBeCloseTo(expected, 10);
  });

  it.each([-90, -6, 0, 3, 90, 175, 180])(
    "does not change when shoulder labels are swapped at %s degrees",
    (degrees) => {
      const right = rotate({ x: 2, y: 0 }, degrees);
      expect(calculateShoulderBalance(right, origin))
        .toBeCloseTo(calculateShoulderBalance(origin, right)!, 10);
    },
  );

  it("handles exactly horizontal and vertical lines", () => {
    expect(calculateShoulderBalance({ x: 600, y: 200 }, { x: 100, y: 200 })).toBe(100);
    expect(calculateShoulderBalance({ x: 100, y: 200 }, { x: 100, y: 600 })).toBe(0);
  });

  it.each([0.01, 1, 1000])("is invariant under translation and uniform scale %s", (scale) => {
    const offset = { x: 320, y: 240 };
    const left = transform(origin, scale, offset);
    const right = transform(rotate({ x: 2, y: 0 }, 3), scale, offset);

    expect(calculateShoulderBalance(left, right)).toBeCloseTo(70, 8);
  });

  it("preserves the balance when the image is mirrored", () => {
    const right = rotate({ x: 2, y: 0 }, 6);
    expect(calculateShoulderBalance({ x: 640, y: 0 }, { x: 640 - right.x, y: right.y }))
      .toBeCloseTo(40, 10);
  });

  it("returns null for coincident shoulders", () => {
    expect(calculateShoulderBalance(origin, origin)).toBeNull();
  });

  it("does not discard a small but nonzero shoulder span", () => {
    expect(calculateShoulderBalance(origin, { x: 1e-12, y: 0 })).toBe(100);
  });

  it("returns null when finite coordinates overflow during subtraction", () => {
    expect(calculateShoulderBalance(
      { x: -Number.MAX_VALUE, y: 0 },
      { x: Number.MAX_VALUE, y: 0 },
    )).toBeNull();
  });
});

describe.each([NaN, Infinity, -Infinity])("invalid coordinate %s", (value) => {
  it.each(["x", "y"] as const)("rejects a non-finite %s in any neck landmark", (axis) => {
    expect(calculateNeckAngle({ ...nose, [axis]: value }, ear, origin)).toBeNull();
    expect(calculateNeckAngle(nose, { ...ear, [axis]: value }, origin)).toBeNull();
    expect(calculateNeckAngle(nose, ear, { ...origin, [axis]: value })).toBeNull();
  });

  it.each(["x", "y"] as const)("rejects a non-finite %s in either shoulder", (axis) => {
    const right = { x: 2, y: 0 };
    expect(calculateShoulderBalance({ ...origin, [axis]: value }, right)).toBeNull();
    expect(calculateShoulderBalance(origin, { ...right, [axis]: value })).toBeNull();
  });
});

it("does not mutate input landmarks", () => {
  const frozenNose = Object.freeze({ x: 0, y: -4 });
  const frozenEar = Object.freeze({ x: 0, y: -2 });
  const frozenLeft = Object.freeze({ x: -1, y: 0 });
  const frozenRight = Object.freeze({ x: 1, y: 0 });
  const frozenCenter = Object.freeze({ x: 0, y: 0 });

  expect(calculateNeckAngle(frozenNose, frozenEar, frozenCenter)).toBe(0);
  expect(calculateShoulderBalance(frozenLeft, frozenRight)).toBe(100);
});

const openEye: readonly Point2D[] = Object.freeze([
  { x: 0, y: 0 }, { x: 3, y: -1.5 }, { x: 7, y: -1.5 },
  { x: 10, y: 0 }, { x: 7, y: 1.5 }, { x: 3, y: 1.5 },
].map(point => Object.freeze(point)));

describe("calculateMeanEAR", () => {
  it("averages both eyes without mutating their frozen points", () => {
    const smallerEye = openEye.map(point => ({ ...point, y: point.y / 2 }));
    expect(calculateMeanEAR(openEye, smallerEye)).toBeCloseTo(0.225, 10);
  });

  it("uses either available eye and preserves a valid zero EAR", () => {
    expect(calculateMeanEAR(null, openEye)).toBeCloseTo(0.30, 10);
    expect(calculateMeanEAR(openEye, [])).toBeCloseTo(0.30, 10);
    expect(calculateMeanEAR(openEye.map(point => ({ ...point, y: 0 })), undefined)).toBe(0);
    expect(calculateMeanEAR(null, [])).toBeNull();
  });
});

describe("calculateEAR", () => {
  it("measures 0.30 for an open eye and zero for a closed eye", () => {
    expect(calculateEAR(openEye)).toBeCloseTo(0.30, 10);
    expect(calculateEAR(openEye.map(point => ({ ...point, y: 0 })))).toBe(0);
  });

  it("combines asymmetric vertical openings", () => {
    const eye = openEye.map(point => ({ ...point }));
    eye[1].y = -0.5; eye[5].y = 0.5;
    expect(calculateEAR(eye)).toBeCloseTo(0.20, 10);
  });

  it.each([0.01, 1, 1000])("preserves EAR under uniform scale %s and translation", scale => {
    expect(calculateEAR(openEye.map(point => transform(point, scale, { x: 320, y: 240 }))))
      .toBeCloseTo(0.30, 9);
  });

  it("rejects missing points, wrong counts, coincident or near-coincident corners", () => {
    for (const points of [null, undefined, [], openEye.slice(1), [...openEye, origin], Array<Point2D>(6)]) {
      expect(calculateEAR(points)).toBeNull();
    }
    expect(calculateEAR(openEye.map((point, i) => i === 3 ? openEye[0] : point))).toBeNull();
    expect(calculateEAR(openEye.map(point => transform(point, 1e-12, origin)))).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity])("rejects every non-finite coordinate %s", invalid => {
    for (let index = 0; index < 6; index++) {
      for (const axis of ["x", "y"] as const) {
        expect(calculateEAR(openEye.map((point, i) => i === index ? { ...point, [axis]: invalid } : point)))
          .toBeNull();
      }
    }
  });

  it("returns null when finite coordinates overflow during geometry", () => {
    const eye = [...openEye];
    eye[0] = { x: -Number.MAX_VALUE, y: 0 }; eye[3] = { x: Number.MAX_VALUE, y: 0 };
    expect(calculateEAR(eye)).toBeNull();
  });
});

describe("estimateScreenDistance", () => {
  const baseline = Object.freeze({ baselineEyeDistancePx: 100, baselineDistanceCm: 60 });

  it.each([[100, 60], [50, 120], [200, 30], [10, 600]])("maps IPD %s px to %s cm without clamping", (ipd, cm) => {
    expect(estimateScreenDistance(ipd, baseline)).toBe(cm);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid IPD or baseline values %s", invalid => {
    expect(estimateScreenDistance(invalid, baseline)).toBeNull();
    expect(estimateScreenDistance(100, { ...baseline, baselineEyeDistancePx: invalid })).toBeNull();
    expect(estimateScreenDistance(100, { ...baseline, baselineDistanceCm: invalid })).toBeNull();
  });

  it("rejects missing calibration, overflow and numerical underflow", () => {
    expect(estimateScreenDistance(100, null)).toBeNull();
    expect(estimateScreenDistance(100, undefined)).toBeNull();
    expect(estimateScreenDistance(Number.MIN_VALUE, baseline)).toBeNull();
    expect(estimateScreenDistance(Number.MAX_VALUE, { baselineEyeDistancePx: Number.MIN_VALUE, baselineDistanceCm: 1 })).toBeNull();
  });
});

describe("screen distance display filters", () => {
  it.each([[10, 20], [20, 20], [60, 60], [150, 150], [300, 150]])("clamps %s cm to %s cm", (value, expected) => {
    expect(clampScreenDistance(value)).toBe(expected);
  });

  it("supports configurable ranges independently of the raw estimate", () => {
    expect(clampScreenDistance(30, 40, 100)).toBe(40);
    expect(clampScreenDistance(110, 40, 100)).toBe(100);
    expect(clampScreenDistance(60, 80, 40)).toBeNull();
  });

  it("starts at the current value and applies a fractional EMA without rounding", () => {
    expect(smoothScreenDistance(60, null)).toBe(60);
    expect(smoothScreenDistance(60, 50, 0.3)).toBeCloseTo(53, 10);
    expect(smoothScreenDistance(60, 50, 0)).toBe(50);
    expect(smoothScreenDistance(60, 50, 1)).toBe(60);
    expect(smoothScreenDistance(600, null)).toBe(600);
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("rejects invalid distances/ranges %s", invalid => {
    expect(clampScreenDistance(invalid)).toBeNull();
    expect(clampScreenDistance(60, invalid, 100)).toBeNull();
    expect(clampScreenDistance(60, 20, invalid)).toBeNull();
    expect(smoothScreenDistance(invalid, 60)).toBeNull();
    expect(smoothScreenDistance(60, invalid)).toBeNull();
  });

  it.each([-0.1, 1.1, NaN, Infinity])("rejects invalid EMA alpha %s", alpha => {
    expect(smoothScreenDistance(60, 50, alpha)).toBeNull();
  });
});
