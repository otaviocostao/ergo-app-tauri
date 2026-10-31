import { useCallback, useEffect, useRef } from "react";
import { monitoringSessionService } from "../services/monitoringSessionService";
import { postureMetricSnapshotService } from "../services/postureMetricSnapshotService";
import { postureAlertService } from "../services/postureAlertService";
import { MetricAggregation, frameFromClassification } from "../services/monitoring/metricAggregation";
import { PostureAlertEpisodes } from "../services/monitoring/postureAlertEpisodes";
import type { PostureAlertCondition, PostureClassification, PostureMetric } from "../types/postureClassification";

export interface RecordingEvent {
  type: "error";
  message: string;
}

interface Recorder {
  aggregation: MetricAggregation;
  episodes: PostureAlertEpisodes;
}

// A new page/session must wait for pending writes and the previous session's end.
// This also handles React StrictMode's setup/cleanup/setup cycle.
let sessionLifecycle: Promise<void> = Promise.resolve();

/**
 * Persists a monitoring session: 60s aggregate snapshots and one alert per confirmed
 * deviation episode. User-facing alert notifications remain with the page's cooldown.
 */
export function useMetricRecording(
  enabled: boolean,
  userId: number | null,
  onEvent: (event: RecordingEvent) => void,
) {
  const recorderRef = useRef<Recorder | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let sessionId: string | null = null;
    let recorder: Recorder | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let writes = Promise.resolve();
    const openAlertIds = new Map<PostureMetric, string | null>();

    const reportError = (message: string, error: unknown) => {
      console.error(message, error);
      if (!cancelled) onEventRef.current({ type: "error", message });
    };
    const enqueue = (write: () => Promise<unknown>, errorMessage: string) => {
      writes = writes.then(write).then(() => undefined).catch(error => reportError(errorMessage, error));
    };

    sessionLifecycle = sessionLifecycle.then(async () => {
      if (cancelled) return;
      const session = await monitoringSessionService.startSession({ userId });
      sessionId = session?.id ?? null;
      // Services return null in browser previews; no fabricated session IDs.
      if (cancelled || !sessionId) return;
      recorder = {
        aggregation: new MetricAggregation({
          sessionId,
          onSnapshot: payload => enqueue(
            () => postureMetricSnapshotService.recordSnapshot(payload),
            "Não foi possível salvar o resumo de métricas deste minuto.",
          ),
        }),
        episodes: new PostureAlertEpisodes({
          sessionId,
          onAlert: (metric, payload) => enqueue(
            async () => { openAlertIds.set(metric, (await postureAlertService.recordAlert(payload))?.id ?? null); },
            "Não foi possível salvar o alerta de postura.",
          ),
          // Writes are serialized, so the alert's ID is known when its resolution runs.
          onAlertResolved: (metric, resolution) => enqueue(
            async () => {
              const id = openAlertIds.get(metric);
              openAlertIds.delete(metric);
              if (id) await postureAlertService.resolveAlert({ id, ...resolution });
            },
            "Não foi possível atualizar a duração do alerta de postura.",
          ),
        }),
      };
      recorderRef.current = recorder;
      timer = setInterval(() => recorder?.aggregation.tick(performance.now()), 1000);
    }).catch(error => reportError("Não foi possível iniciar a sessão de monitoramento.", error));

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (recorderRef.current === recorder) recorderRef.current = null;
      recorder?.aggregation.pause();
      recorder?.episodes.pause();
      const endedAt = new Date().toISOString();
      sessionLifecycle = sessionLifecycle.then(async () => {
        await writes;
        if (sessionId) {
          await monitoringSessionService.endSession({ id: sessionId, endedAt, ...recorder?.aggregation.sessionSummary() });
        }
      }).catch(error => reportError("Não foi possível finalizar a sessão de monitoramento.", error));
    };
  }, [enabled, userId]);

  /** Call per classification with the hysteresis alerts and blinks since the previous call. */
  const recordClassification = useCallback((
    classification: PostureClassification,
    confirmed: readonly PostureAlertCondition[],
    blinkCount = 0,
  ) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const frame = frameFromClassification(classification, blinkCount);
    if (frame) recorder.aggregation.recordFrame(frame);
    recorder.episodes.update(classification, confirmed);
  }, []);
  const pause = useCallback(() => {
    recorderRef.current?.aggregation.pause();
    recorderRef.current?.episodes.pause();
  }, []);
  return { recordClassification, pause };
}
