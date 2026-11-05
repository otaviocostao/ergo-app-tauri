import { describe, expect, it } from "vitest";
import { buildCalibrationGuide, type WorkspaceSetup } from "./calibrationGuide";
import { CALIBRATION_ILLUSTRATIONS } from "./calibrationIllustrations";

const profile: WorkspaceSetup = {
  deviceType: "notebook", isWebcamFront: true, hasExternalKeyboard: true, hasExternalMouse: true,
  adjustableDesk: false, adjustableChair: true, adjustableMonitor: true,
};
const step = (id: number, changes: Partial<WorkspaceSetup> = {}) => buildCalibrationGuide({ ...profile, ...changes }).find(item => item.id === id)!;

describe("calibration guidance follows the reported equipment", () => {
  it("checks an already frontal webcam and moves only a webcam reported as misaligned", () => {
    expect(step(6).illustration).toBe("webcam-aligned");
    expect(step(6, { isWebcamFront: false }).illustration).toBe("webcam-position");
  });

  it.each([
    [true, true, "notebook-peripherals-ready"],
    [false, true, "notebook-peripherals-keyboard"],
    [true, false, "notebook-peripherals-mouse"],
    [false, false, "notebook-peripherals-both"],
  ] as const)("covers external keyboard=%s and mouse=%s without replacing existing accessories", (keyboard, mouse, illustration) => {
    const guide = step(5, { hasExternalKeyboard: keyboard, hasExternalMouse: mouse });
    expect(guide.illustration).toBe(illustration);
    if (keyboard) expect(guide.description.toLowerCase()).not.toContain("adicione um teclado");
    if (mouse) expect(guide.description.toLowerCase()).not.toContain("adicione um mouse");
  });

  it("does not ask a user with a fixed chair to change the chair height", () => {
    expect(step(1).illustration).toBe("chair-height");
    const fixed = step(1, { adjustableChair: false });
    expect(fixed.illustration).toBe("chair-footrest");
    expect(fixed.description).toContain("não possui regulagem");
    expect(fixed.description).not.toMatch(/eleve a cadeira|use a regulagem/i);
  });

  it.each([
    [true, true, "desk-adjustment"],
    [true, false, "desk-adjustment"],
    [false, true, "desk-chair-adjustment"],
    [false, false, "desk-fixed"],
  ] as const)("selects a feasible desk demonstration for desk=%s and chair=%s", (desk, chair, illustration) => {
    const guide = step(2, { adjustableDesk: desk, adjustableChair: chair });
    expect(guide.illustration).toBe(illustration);
    if (!desk && !chair) expect(guide.description).toContain("sem tentar alterar a altura dos móveis");
  });

  it.each([
    ["desktop", true, "monitor-height"], ["desktop", false, "monitor-height-support"],
    ["notebook", true, "notebook-height"], ["notebook", false, "notebook-height-support"],
  ] as const)("matches the screen and available height adjustment (%s, %s)", (device, adjustable, illustration) => {
    expect(step(3, { deviceType: device, adjustableMonitor: adjustable }).illustration).toBe(illustration);
  });

  it("shows the chosen device for distance and ignores hidden notebook-only answers on desktop", () => {
    expect(step(4).illustration).toBe("notebook-distance");
    expect(step(4, { deviceType: "desktop" }).illustration).toBe("monitor-distance-adjustment");
    const desktop = { ...profile, deviceType: "desktop" as const };
    expect(buildCalibrationGuide(desktop).some(item => item.id === 5)).toBe(false);
    expect(buildCalibrationGuide({ ...desktop, hasExternalKeyboard: false, hasExternalMouse: false })).toEqual(buildCalibrationGuide(desktop));
  });

  it("has a complete, accessible, nonduplicated route for all 128 combinations", () => {
    const fields = ["isWebcamFront", "hasExternalKeyboard", "hasExternalMouse", "adjustableDesk", "adjustableChair", "adjustableMonitor"] as const;
    const usedIllustrations = new Set<string>();
    for (const deviceType of ["desktop", "notebook"] as const) {
      for (let combination = 0; combination < 64; combination++) {
        const options = Object.fromEntries(fields.map((field, index) => [field, Boolean(combination & (1 << index))]));
        const guide = buildCalibrationGuide({ ...profile, ...options, deviceType });
        expect(guide).toHaveLength(deviceType === "desktop" ? 5 : 6);
        expect(new Set(guide.map(item => item.id)).size).toBe(guide.length);
        for (const item of guide) {
          const [gif, still, alt] = CALIBRATION_ILLUSTRATIONS[item.illustration];
          expect(gif).toContain(".gif"); expect(still).toContain(".png");
          expect(alt.length).toBeGreaterThan(15);
          usedIllustrations.add(item.illustration);
        }
      }
    }
    expect([...usedIllustrations].sort()).toEqual(Object.keys(CALIBRATION_ILLUSTRATIONS).sort());
  });
});
