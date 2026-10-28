import type { IPDMeasurement } from "./ocularLandmarks";
import type { PostureAngles } from "./temporalPostureFilter";

/** One inference, before display rounding. Never combine observations from different frames. */
export interface PostureCalibrationFrame {
  readonly timestampMs: number;
  readonly captureId: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly ipd: IPDMeasurement;
  readonly rawAngles: PostureAngles;
  readonly filteredAngles: PostureAngles;
}
