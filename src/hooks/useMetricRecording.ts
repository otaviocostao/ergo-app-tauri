import { useCallback, useEffect, useRef, useState } from "react";
import { monitoringSessionService } from "../services/monitoringSessionService";
import { postureMetricSnapshotService } from "../services/postureMetricSnapshotService";
import { postureAlertService } from "../services/postureAlertService";
import { MetricAggregation, frameFromClassification, type PresenceObservation } from "../services/monitoring/metricAggregation";
import { PostureAlertEpisodes, type AlertResolution } from "../services/monitoring/postureAlertEpisodes";
import type { PostureAlertCondition, PostureClassification, PostureMetric } from "../types/postureClassification";
import { notifySessionHistoryUpdated } from "../services/monitoring/sessionHistoryEvents";
import { RecordingStatus } from "../enums/recordingStatus";

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
let unfinishedClose: (() => Promise<void>) | null = null;

/** Navigation may mount the dashboard while the previous page is still saving. */
export function waitForRecordingWrites(): Promise<void> {
  return sessionLifecycle;
}

/**
 * Persists a monitoring session shared by active analysis modules (posture + typing),
 * recording 60s posture aggregate snapshots and confirmed posture alert episodes when
 * `recordPosture` is enabled.
 */
export function useMetricRecording(
  enabled: boolean,
  userId: number | null,
  onEvent: (event: RecordingEvent) => void,
  recordPosture = true,
) {
  const recorderRef = useRef<Recorder | null>(null);
  const recordPostureRef = useRef(recordPosture);
  recordPostureRef.current = recordPosture;
  const syncPostureRef = useRef<((enabledPosture: boolean) => void) | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const ownerRef = useRef(userId);
  ownerRef.current = userId;
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    syncPostureRef.current?.(recordPosture);
  }, [recordPosture]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const generation = ++generationRef.current;
    let cancelled = false;
    let closed = false;
    let sessionId: string | null = null;
    let recorder: Recorder | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let writes = Promise.resolve();
    const openAlertIds = new Map<PostureMetric, string | null>();
    const resolutions = new Map<string, AlertResolution>();

    const publish = (next: RecordingStatus, message: string | null = null) => {
      if (mountedRef.current && ownerRef.current === userId && generationRef.current === generation) {
        setStatus(next);
        setError(message);
      }
    };

    const reportError = (message: string, error: unknown) => {
      console.error(message, error);
      if (mountedRef.current && ownerRef.current === userId && generationRef.current === generation) {
        onEventRef.current({ type: "error", message });
      }
    };

    const enqueue = (write: () => Promise<unknown>, errorMessage: string) => {
      writes = writes.then(write).then(() => {
        if (sessionId) {
          notifySessionHistoryUpdated({ userId, sessionId });
        }
      }).catch(error => reportError(errorMessage, error));
    };

    publish(RecordingStatus.STARTING);
    setElapsedSeconds(0);
    const resolveEpisode = async (id: string, resolution: AlertResolution) => {
      await postureAlertService.resolveAlert({ id, ...resolution });
      resolutions.delete(id);
    };

    sessionLifecycle = sessionLifecycle.then(async () => {
      if (cancelled) {
        return;
      }

      if (unfinishedClose) {
        await unfinishedClose();
        unfinishedClose = null;
      }

      if (cancelled) {
        return;
      }

      const session = await monitoringSessionService.startSession({ userId });
      sessionId = session?.id ?? null;
      if (sessionId && session) {
        notifySessionHistoryUpdated({ userId, sessionId, session });
      }

      if (cancelled) {
        return;
      }

      if (!sessionId) {
        publish(RecordingStatus.ACTIVE);
        return;
      }

      const storedStart = Date.parse(session?.startedAt ?? "");
      const startedAtEpochMs = Number.isFinite(storedStart) ? storedStart : Date.now();
      const startedAtMs = performance.now() - Math.max(0, Date.now() - startedAtEpochMs);

      recorder = {
        aggregation: new MetricAggregation({
          sessionId,
          startedAtMs,
          startedAtEpochMs,
          onSnapshot: payload => {
            if (!recordPostureRef.current && payload.samplesCount === 0) return;
            enqueue(
              () => postureMetricSnapshotService.recordSnapshot(payload),
              "Não foi possível salvar o resumo de métricas deste minuto.",
            );
          },
        }),
        episodes: new PostureAlertEpisodes({
          sessionId,
          onAlert: (metric, payload) => enqueue(
            async () => { openAlertIds.set(metric, (await postureAlertService.recordAlert(payload))?.id ?? null); },
            "Não foi possível salvar o alerta de postura.",
          ),
          // Writes are serialized, so the alert's ID is known when its resolution runs.
          onAlertResolved: (metric, resolution) => {
            enqueue(async () => {
              const id = openAlertIds.get(metric);
              openAlertIds.delete(metric);
              if (id) {
                resolutions.set(id, resolution);
                await resolveEpisode(id, resolution);
              }
            }, "Não foi possível atualizar a duração do alerta de postura.");
          },
        }),
      };

      const updateElapsed = (now: number) => {
        if (cancelled || !recorder) return;
        const postureSeconds = recorder.aggregation.sessionSummary().durationSeconds ?? 0;
        setElapsedSeconds(
          recordPostureRef.current
            ? postureSeconds
            : Math.max(postureSeconds, Math.max(0, Math.floor((now - startedAtMs) / 1000))),
        );
      };

      const syncPosture = (enabledPosture: boolean) => {
        if (cancelled || !recorder) return;
        if (enabledPosture) {
          recorderRef.current = recorder;
        } else {
          if (recorderRef.current === recorder) recorderRef.current = null;
          recorder.aggregation.pause();
          recorder.episodes.pause();
        }
        updateElapsed(performance.now());
      };

      syncPostureRef.current = syncPosture;
      syncPosture(recordPostureRef.current);
      publish(RecordingStatus.ACTIVE);

      const pulse = () => {
        const now = performance.now();
        recorder?.aggregation.tick(now);
        updateElapsed(now);
        if (!cancelled && recorder) {
          timer = setTimeout(pulse,
            Math.min(1000, Math.max(1, recorder.aggregation.millisecondsUntilNextWindow(now))));
        }
      };
      timer = setTimeout(pulse, Math.min(1000, Math.max(1, recorder.aggregation.millisecondsUntilNextWindow(performance.now()))));
    }).catch(error => {
      const message = unfinishedClose ? "Não foi possível finalizar a sessão anterior. Tente novamente." : "Não foi possível iniciar a sessão de monitoramento.";
      publish(RecordingStatus.ERROR, message);
      reportError(message, error);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      syncPostureRef.current = null;
      if (recorderRef.current === recorder) {
        recorderRef.current = null;
      }

      recorder?.aggregation.pause();
      recorder?.episodes.pause();
      const endedAt = new Date().toISOString();
      publish(RecordingStatus.ENDING);

      const close = async () => {
        if (closed) {
          return;
        }

        await writes;

        for (const [id, resolution] of resolutions) await resolveEpisode(id, resolution);
        if (sessionId) {
          // A cancelled start may have created a backend session without a recorder.
          // Do not preserve the backend's initial 100% defaults as measured history.
          const summary = recorder?.aggregation.sessionSummary() ?? {
            durationSeconds: 0, averageScore: 0, goodPosturePercentage: 0,
            warningPosturePercentage: 0, dangerPosturePercentage: 0,
          };
          const session = await monitoringSessionService.endSession({ id: sessionId, endedAt, ...summary });
          notifySessionHistoryUpdated({ userId, sessionId, session: session ?? undefined });
        }
        closed = true;
        if (unfinishedClose === close) unfinishedClose = null;
      };
      sessionLifecycle = sessionLifecycle.then(close).then(() => publish(RecordingStatus.IDLE)).catch(error => {
        unfinishedClose = close;
        const message = "Não foi possível finalizar a sessão de monitoramento. Tente novamente.";
        publish(RecordingStatus.ERROR, message);
        reportError(message, error);
      });
    };
  }, [enabled, userId, retryKey]);

  const retry = useCallback(() => {
    if (status !== RecordingStatus.ERROR) return;
    if (enabled) { setRetryKey(value => value + 1); return; }
    if (!unfinishedClose) { setStatus(RecordingStatus.IDLE); setError(null); return; }
    const owner = userId;
    setStatus(RecordingStatus.ENDING); setError(null);
    sessionLifecycle = sessionLifecycle.then(async () => {
      await unfinishedClose?.();
      unfinishedClose = null;
      if (mountedRef.current && ownerRef.current === owner) setStatus(RecordingStatus.IDLE);
    }).catch(error => {
      console.error("Failed to finalize monitoring session", error);
      if (mountedRef.current && ownerRef.current === owner) {
        setStatus(RecordingStatus.ERROR);
        setError("Não foi possível finalizar a sessão de monitoramento. Tente novamente.");
      }
    });
  }, [enabled, status, userId]);

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
  const observePresence = useCallback((observation: PresenceObservation) => {
    recorderRef.current?.aggregation.observePresence(observation);
  }, []);
  return { recordClassification, observePresence, pause, status, error, elapsedSeconds, retry };
}
