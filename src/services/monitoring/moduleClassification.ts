import { Module } from "../../enums/module";
import { isModuleEnabled, type ModuleSettings } from "../settingsService";
import { getPostureStatus } from "../vision/postureClassifier";
import type { MetricClassification, PostureClassification, PostureMetric } from "../../types/postureClassification";

/** The distance is a posture metric measured from the eyes, so it needs both modules. */
export const METRIC_MODULES: Readonly<Record<PostureMetric, readonly Module[]>> = {
  neck: [Module.POSTURAL_ANALYSIS],
  shoulders: [Module.POSTURAL_ANALYSIS],
  distance: [Module.POSTURAL_ANALYSIS, Module.OCULAR_ANALYSIS],
  "blink-rate": [Module.OCULAR_ANALYSIS],
};

/** First disabled module the metric depends on, or null when it is available. */
export function getInactiveModule(metric: PostureMetric, settings: ModuleSettings | null): Module | null {
  return METRIC_MODULES[metric].find(module => !isModuleEnabled(settings, module)) ?? null;
}

const UNAVAILABLE: MetricClassification = { value: null, status: null };

/**
 * Metrics of disabled modules become unavailable before cards, alerts and recording see them,
 * so a disabled module produces no notification or stored measurement.
 */
export function restrictClassificationToModules(
  classification: PostureClassification,
  settings: ModuleSettings | null,
): PostureClassification {
  const entries = Object.entries(classification.metrics) as [PostureMetric, MetricClassification][];
  if (entries.every(([metric]) => getInactiveModule(metric, settings) === null)) return classification;
  const metrics = Object.fromEntries(entries.map(([metric, value]) =>
    [metric, getInactiveModule(metric, settings) === null ? value : UNAVAILABLE],
  )) as PostureClassification["metrics"];
  return { ...classification, metrics, postureStatus: getPostureStatus(metrics) };
}
