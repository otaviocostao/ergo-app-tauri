import type { PostureAlertCondition } from "../../types/postureClassification";
import { createPostureClassificationConfig, type PostureClassificationConfig } from "./postureClassificationConfig";

/** Delivery history is separate from continuous-condition evidence. No implicit clock. */
export class PostureAlertCooldown {
  private readonly config: PostureClassificationConfig;
  private readonly lastNotified = new Map<string, number>();
  private lastTimestampMs: number | null = null;

  constructor(config: Partial<PostureClassificationConfig> = {}) {
    this.config = createPostureClassificationConfig(config);
  }

  private acceptTime(timestampMs: number): boolean {
    if (!Number.isFinite(timestampMs) || timestampMs < 0 ||
      (this.lastTimestampMs !== null && timestampMs < this.lastTimestampMs)) return false;
    this.lastTimestampMs = timestampMs;
    return true;
  }

  /** Call with current sustained conditions, not with stale events from previous frames. */
  ready(conditions: readonly PostureAlertCondition[], timestampMs: number): PostureAlertCondition[] {
    if (!this.acceptTime(timestampMs)) return [];
    const seen = new Set<string>();
    return conditions.filter(condition => {
      const key = `${condition.metric}:${condition.level}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const last = this.lastNotified.get(key);
      return last === undefined || timestampMs - last >= this.config.cooldownMs;
    });
  }

  /** Record only events actually forwarded to the existing output channel. */
  markNotified(conditions: readonly PostureAlertCondition[], timestampMs: number): void {
    if (!this.acceptTime(timestampMs)) return;
    for (const condition of conditions) this.lastNotified.set(`${condition.metric}:${condition.level}`, timestampMs);
  }

  /** Account changes end the delivery context; ordinary pauses preserve cooldown. */
  reset(): void {
    this.lastNotified.clear();
    this.lastTimestampMs = null;
  }
}
