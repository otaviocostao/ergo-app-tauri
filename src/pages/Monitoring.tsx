import { useState, useEffect, useRef } from "react";
import Header from "../components/Header";
import WebcamFeed from "../components/monitoring/WebcamFeed";
import ErgoMetricsCard from "../components/monitoring/ErgoMetricsCard";
import KeyboardMonitorCard from "../components/monitoring/KeyboardMonitorCard";
import PostureHistoryLog, { LogEvent } from "../components/monitoring/PostureHistoryLog";
import WorkspaceCalibrationModal from "../components/monitoring/WorkspaceCalibrationModal";
import { postureService } from "../services/postureService";
import { useOptionalAuth } from "../auth/AuthContext";
import { useMetricRecording } from "../hooks/useMetricRecording";
import { useModuleSettings } from "../hooks/useModuleSettings";
import { isModuleEnabled, settingsService } from "../services/settingsService";
import { getInactiveModule, restrictClassificationToModules } from "../services/monitoring/moduleClassification";
import type { PostureCalibrationDTO } from "../types/postureCalibration";
import type { PostureClassification, PostureMetric } from "../types/postureClassification";
import { PostureStatus, POSTURE_STATUS_LABELS } from "../enums/postureStatus";
import { Module, MODULE_LABELS } from "../enums/module";
import {
  DEFAULT_POSTURE_CLASSIFICATION_CONFIG as classificationConfig,
  getPostureStatusLabel, PostureAlertCooldown, PostureHysteresis,
  POSTURE_MEASUREMENT_LIMITS,
} from "../services/vision";

import {
  Compass,
  Sliders,
  UserCheck,
  Eye,
  Volume2,
  VolumeX,
} from "lucide-react";

import type { UserPresenceState } from "../types/vision";
import type { OcularMetrics } from "../services/vision/ocularMetrics";

const ALERT_MESSAGES: Record<PostureMetric, string> = {
  neck: "Ajuste a posição do pescoço",
  shoulders: "Ajuste o alinhamento dos ombros",
  distance: "Ajuste a distância da tela",
  "blink-rate": "Frequência de piscadas reduzida",
};

function getShoulderBalance(deviation: number | null): number | null {
  if (deviation === null) {
    return null
  };

  const points = deviation * POSTURE_MEASUREMENT_LIMITS.shoulderBalancePointsPerDegree;
  return Math.max(0, Math.min(100, Math.round(100 - points)));
}

function getShoulderCardValue(
  balance: number | null,
  calibration: PostureCalibrationDTO | null
): string | number {
  if (balance !== null) {
    return balance;
  }

  if (!calibration) {
    return "Aguardando calibração"
  };

  if (calibration.baselineShoulderBalance === 0) {
    return "Recalibre a postura base"
  };

  return "Aguardando leitura";
}

export default function Monitoring({ isVisible = true }: { isVisible?: boolean }) {
  const auth = useOptionalAuth();
  const userId = auth?.session.kind === "authenticated" ? auth.session.user.id : null;
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  useEffect(() => {
    if (!isVisible) setIsCalibrationOpen(false);
  }, [isVisible]);
  const uiPublishedAtRef = useRef(-Infinity);
  const ocularPublishedAtRef = useRef(-Infinity);
  const transitionRequestedRef = useRef(false);
  const { settings: moduleSettings, setSettings: setModuleSettings, isLoading: modulesLoading } = useModuleSettings();
  const posturalEnabled = isModuleEnabled(moduleSettings, Module.POSTURAL_ANALYSIS);
  const ocularEnabled = isModuleEnabled(moduleSettings, Module.OCULAR_ANALYSIS);
  // Waiting for the settings avoids switching the camera on, or opening a session, only to stop it.
  const cameraModulesEnabled = !modulesLoading && (posturalEnabled || ocularEnabled);
  const monitoringContextRef = useRef({ enabled: false, userId, modules: moduleSettings });
  const [calibration, setCalibration] = useState<PostureCalibrationDTO | null>(null);
  const [sessionBlinkCount, setSessionBlinkCount] = useState(0);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [ocularMetrics, setOcularMetrics] = useState<OcularMetrics | null>(null);
  const distanceCm = ocularMetrics?.distanceCm ?? null;
  const [classification, setClassification] = useState<PostureClassification | null>(null);
  const alertStateRef = useRef<{ hysteresis: PostureHysteresis; cooldown: PostureAlertCooldown } | null>(null);
  const alertState = alertStateRef.current ?? (alertStateRef.current = {
    hysteresis: new PostureHysteresis(classificationConfig),
    cooldown: new PostureAlertCooldown(classificationConfig),
  });
  const postureStatus = classification?.postureStatus ?? null;
  const statusText = classification ? getPostureStatusLabel(classification, classificationConfig) : "Aguardando calibração ou leituras válidas";
  const [userPresence, setUserPresence] = useState<UserPresenceState>("PARTIALLY_OCCLUDED");

  // Session logs list
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const lastAnnouncedPresenceRef = useRef<"ACTIVE" | "ABSENT" | null>(null);
  const hardwareBusyRef = useRef(false);
  // Blink events since the last classification; both callbacks come from the same inference.
  const pendingBlinksRef = useRef(0);
  // Sessions and snapshots summarize posture, so nothing is recorded without the postural module.
  const recording = useMetricRecording(isMonitoring && !isCalibrationOpen && !modulesLoading && posturalEnabled, userId, event => {
    setLogs(previous => [{
      ...event,
      scope: "account" as const,
      userId,
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      timestamp: new Date().toLocaleTimeString("pt-BR"),
    }, ...previous].slice(0, 100));
  });
  const captureEnabled = isMonitoring && !isCalibrationOpen && cameraModulesEnabled &&
    (!posturalEnabled || recording.status === "active");
  monitoringContextRef.current = { enabled: captureEnabled, userId, modules: moduleSettings };

  const toggleMonitoring = () => {
    if (transitionRequestedRef.current || recording.status === "starting" || recording.status === "ending") return;
    transitionRequestedRef.current = true;
    if (recording.status === "error") { recording.retry(); return; }
    if (!isMonitoring) {
      lastAnnouncedPresenceRef.current = null;
      setSessionBlinkCount(0);
      pendingBlinksRef.current = 0;
      alertState.hysteresis.resetContinuity();
      uiPublishedAtRef.current = ocularPublishedAtRef.current = -Infinity;
    }
    setIsMonitoring(previous => !previous);
  };

  useEffect(() => {
    if (recording.status !== "starting" && recording.status !== "ending") transitionRequestedRef.current = false;
  }, [recording.status, isMonitoring]);

  const handlePostureUpdate = (metrics: {
    neckAngle: number;
    shoulderBalance: number;
    distanceCm: number | null;
    status: PostureStatus | null;
    statusLabel: string;
    presence?: UserPresenceState;
  }) => {
    if (metrics.presence) {
      setUserPresence(metrics.presence);
    }
  };

  const handleClassificationUpdate = (measured: PostureClassification | null) => {
    const context = monitoringContextRef.current;
    if (context.userId !== userId) {
      return;
    }

    // Disabled modules produce no card value, alert or stored measurement.
    const current = measured && restrictClassificationToModules(measured, context.modules);
    if (!current || !context.enabled) {
      setClassification(null);
      uiPublishedAtRef.current = -Infinity;
      alertState.hysteresis.resetContinuity();
      recording.pause();
      pendingBlinksRef.current = 0;
      return;
    }

    if (current.timestampMs - uiPublishedAtRef.current >= 250) {
      uiPublishedAtRef.current = current.timestampMs;
      setClassification(current);
    }

    const temporal = alertState.hysteresis.update(current);
    recording.recordClassification(current, temporal.alerts, pendingBlinksRef.current);
    pendingBlinksRef.current = 0;
    const alerts = alertState.cooldown.ready(temporal.sustained, current.timestampMs);

    if (alerts.length === 0) {
      return;
    }

    const events: LogEvent[] = alerts.map(alert => ({
      id: `posture:${current.timestampMs}:${alert.metric}:${alert.level}`,
      occurredAt: new Date().toISOString(),
      timestamp: new Date().toLocaleTimeString("pt-BR"),
      type: alert.level === PostureStatus.DANGER ? "error" : "warning",
      message: ALERT_MESSAGES[alert.metric],
      detail: `${POSTURE_STATUS_LABELS[alert.level]}. Condição mantida por ${Math.floor(alert.durationMs / 1000)} s.`,
    }));

    setLogs(previous => [...events, ...previous]);
    alertState.cooldown.markNotified(alerts, current.timestampMs);
  };

  useEffect(() => {
    if (!captureEnabled) {
      alertState.hysteresis.resetContinuity();
    }

  }, [captureEnabled, userId]);

  const handlePresenceChange = (presence: UserPresenceState) => {
    const context = monitoringContextRef.current;
    if (context.userId !== userId) return;
    setUserPresence(presence);
    if (presence !== "ACTIVE") recording.pause();
    // Brief occlusions do not rearm the announcement; only the detector's 5s absence does.
    // Calibration and inactive capture must not add presence events to the monitoring history.
    if (!context.enabled || presence === "PARTIALLY_OCCLUDED" || lastAnnouncedPresenceRef.current === presence) return;
    lastAnnouncedPresenceRef.current = presence;

    if (presence === "ABSENT") {
      const newLog: LogEvent = {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        type: "warning",
        scope: isModuleEnabled(context.modules, Module.POSTURAL_ANALYSIS) ? "session" : "account",
        userId,
        message: "Usuário ausente do posto de trabalho",
        detail: "Nenhum ponto corporal detectado por pelo menos 5 segundos. Métricas pausadas.",
      };
      setLogs((prev) => [newLog, ...prev]);
    } else if (presence === "ACTIVE") {
      const newLog: LogEvent = {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        type: "info",
        scope: isModuleEnabled(context.modules, Module.POSTURAL_ANALYSIS) ? "session" : "account",
        userId,
        message: "Usuário presente",
        detail: "Rastreamento corporal e análise postural ativos.",
      };
      setLogs((prev) => [newLog, ...prev]);
    }
  };

  const handleHardwareBusyChange = (isBusy: boolean) => {
    if (hardwareBusyRef.current === isBusy) return;
    hardwareBusyRef.current = isBusy;
    if (isBusy) {
      recording.pause();
      const newLog: LogEvent = {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        type: "warning",
        scope: "account",
        userId,
        message: "Câmera solicitada por outro aplicativo",
        detail: "Concorrência de hardware detectada (Meet, Teams, Zoom). Captura pausada.",
      };
      setLogs((prev) => [newLog, ...prev]);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setCalibration(null);
    setClassification(null);
    setLogs([]);
    lastAnnouncedPresenceRef.current = null;
    hardwareBusyRef.current = false;
    alertState.hysteresis.resetContinuity();
    alertState.cooldown.reset();
    postureService
      .getActiveCalibration(userId)
      .then((activeCal) => {
        if (isMounted && activeCal) {
          setCalibration(activeCal);
        }
      })
      .catch((err) => {
        console.error("Erro ao carregar calibração ativa:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleCalibrateSubmit = (savedCalibration?: PostureCalibrationDTO | null) => {
    if (monitoringContextRef.current.userId !== userId) return;
    if (savedCalibration) {
      setCalibration(savedCalibration);
    } else {
      postureService
        .getActiveCalibration(userId)
        .then((cal) => {
          if (cal) {
            setCalibration(cal);
          }
        })
        .catch(console.error);
    }
    const newLog: LogEvent = {
      id: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      timestamp: new Date().toLocaleTimeString("pt-BR"),
      type: "success",
      scope: "account",
      userId,
      message: "Ambiente de trabalho salvo com sucesso",
      detail: `Configuração atualizada. Calibração neutra aplicada.`,
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  // The chosen camera becomes the account's default for every visual analysis.
  const handleWebCamSelect = (deviceId: string) => {
    if (!moduleSettings) return;
    const owner = moduleSettings.userId;
    setModuleSettings(current => current?.userId === owner ? { ...current, webCam: deviceId } : current);
    settingsService.setWebCam(deviceId).catch(error => {
      console.error("Failed to save the default webcam:", error);
      setLogs(previous => [{
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        type: "error",
        scope: "account" as const,
        userId: owner,
        message: "Não foi possível salvar a câmera padrão.",
        detail: "A câmera escolhida continua em uso nesta sessão.",
      }, ...previous]);
    });
  };

  const handleOcularUpdate = (metrics: OcularMetrics | null) => {
    const now = performance.now();
    if (!metrics || now - ocularPublishedAtRef.current >= 250) {
      ocularPublishedAtRef.current = metrics ? now : -Infinity;
      setOcularMetrics(metrics);
    }

    if (metrics?.blinkEvent === "blink" && isModuleEnabled(monitoringContextRef.current.modules, Module.OCULAR_ANALYSIS)) {
      setSessionBlinkCount((prev) => prev + 1);
      pendingBlinksRef.current++;
    }
  };

  const inactiveModuleLabel = (metric: PostureMetric) => {
    const module = getInactiveModule(metric, moduleSettings);
    return module && MODULE_LABELS[module];
  };
  const isPaused = !captureEnabled || userPresence !== "ACTIVE";
  const blinkRate = ocularMetrics?.blinkRate.blinksPerMinute ?? null;
  const neck = classification?.metrics.neck;
  const shoulders = classification?.metrics.shoulders;
  const distance = classification?.metrics.distance;
  const blink = classification?.metrics["blink-rate"];
  const neckDeviation = neck?.value ?? null;
  const shoulderDeviation = shoulders?.value ?? null;
  const calibratedShoulderBalance = getShoulderBalance(shoulderDeviation);

  return (
    <div className="w-full h-full flex flex-col gap-6 pb-8">
      <Header
        title="Monitoramento Em Tempo Real"
        subtitle="Supervisão contínua em tempo real da sua postura corporal e atividade no computador"
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundAlerts(!soundAlerts)}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${soundAlerts
                ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                : "bg-slate-100/50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                }`}
              title={soundAlerts ? "Desativar alertas sonoros" : "Ativar alertas sonoros"}
            >
              {soundAlerts ? <Volume2 size={16} className="text-primary-500" /> : <VolumeX size={16} />}
              <span className="hidden md:inline">{soundAlerts ? "Som Ativo" : "Som Mudo"}</span>
            </button>
          </div>
        }
      />
      {recording.error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
        {recording.error} <button className="ml-2 font-semibold underline" onClick={recording.retry}>Tentar novamente</button>
      </div>}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <WebcamFeed
            isMonitoring={captureEnabled}
            showMetricBadges={false}
            recordingStatus={recording.status}
            disabledMessage={modulesLoading || posturalEnabled || ocularEnabled ? null
              : "As análises postural e ocular estão desativadas em Configurações → Módulos. A câmera fica desligada até que uma delas seja ativada."}
            preferredDeviceId={moduleSettings?.webCam ?? null}
            onDeviceSelect={handleWebCamSelect}
            calibration={calibration}
            classificationConfig={classificationConfig}
            moduleSettings={moduleSettings}
            onClassificationUpdate={handleClassificationUpdate}
            onToggleMonitoring={toggleMonitoring}
            onCalibrate={() => setIsCalibrationOpen(true)}
            onPostureUpdate={handlePostureUpdate}
            onPresenceChange={handlePresenceChange}
            onPresenceObservation={recording.observePresence}
            onHardwareBusyChange={handleHardwareBusyChange}
            onStreamChange={setCameraStream}
            onOcularUpdate={handleOcularUpdate}
          />

          <KeyboardMonitorCard
            enabled={isModuleEnabled(moduleSettings, Module.TYPING_ANALYSIS)}
            onPauseRequested={() => {
              const newLog: LogEvent = {
                id: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                timestamp: new Date().toLocaleTimeString("pt-BR"),
                type: "info",
                scope: "account",
                userId,
                message: "Pausa de digitação registrada",
                detail: "Contador de uso contínuo do teclado foi reiniciado.",
              };
              setLogs((prev) => [newLog, ...prev]);
            }}
          />
        </div>

        <div className="lg:col-span-5 flex flex-col gap-3">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 text-white border border-slate-800 shadow-md flex flex-col justify-between gap-4">
            <div className="flex gap-4">
              <div className="flex gap-2">
                <h2 className="text-base font-bold text-white">Resumo da sua ergonomia</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${!posturalEnabled || isPaused || postureStatus === null
                    ? "bg-slate-800 text-slate-400 border border-slate-700"
                    : postureStatus === PostureStatus.GOOD
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : postureStatus === PostureStatus.WARNING
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                >
                  {!posturalEnabled
                    ? "Módulo inativo"
                    : !isMonitoring
                    ? "Pausado"
                    : userPresence === "ABSENT"
                      ? "Ausente (Pausado)"
                      : userPresence === "PARTIALLY_OCCLUDED"
                        ? "Ajuste o enquadramento"
                        : postureStatus === null
                          ? "Aguardando dados"
                          : postureStatus === PostureStatus.GOOD
                            ? "Excelente"
                            : postureStatus === PostureStatus.WARNING
                              ? "Atenção"
                              : "Crítico"}
                </span>
              </div>
            </div>
            <div className="flex">
              <p className="text-xs text-slate-300 mt-1 sm:pr-6">
                {!posturalEnabled
                  ? "A análise postural está desativada em Configurações → Módulos. Ative-a para acompanhar pescoço, ombros, coluna e distância da tela."
                  : !isMonitoring
                  ? "O monitoramento está pausado. Inicie o monitoramento para visualizar a análise postural e métricas em tempo real."
                  : userPresence === "ABSENT"
                    ? "Nenhum usuário detectado há mais de 5 segundos. O cálculo de métricas e gráficos está pausado até o seu retorno."
                    : userPresence === "PARTIALLY_OCCLUDED"
                      ? "Aguardando pontos confiáveis da cabeça e dos ombros. Ajuste o enquadramento para retomar as métricas."
                      : postureStatus === null
                        ? "Calibre a postura base e aguarde leituras válidas para classificar sua postura."
                        : postureStatus === PostureStatus.GOOD
                          ? "Sua coluna e pescoço estão alinhados dentro das diretrizes ideais."
                          : "Ajuste sua inclinação do pescoço ou altura da tela para melhorar sua postura."}
              </p>

              <div className="flex items-center gap-6 text-xs text-slate-300 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-700/60 pt-3 sm:pt-0 sm:pl-6 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex flex-col">
                  <span className="text-slate-400">Status Geral:</span>
                  <span
                    className={`font-semibold ${!posturalEnabled || isPaused || postureStatus === null
                      ? "text-slate-400"
                      : postureStatus === "good"
                        ? "text-emerald-400"
                        : postureStatus === "warning"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                  >
                    {!posturalEnabled
                      ? "Análise postural inativa"
                      : !isMonitoring
                      ? "Pausado"
                      : userPresence === "ABSENT"
                        ? "Usuário Ausente"
                        : userPresence === "PARTIALLY_OCCLUDED"
                          ? "Detecção parcial"
                          : statusText}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400">Sessão:</span>
                  <span className="font-semibold text-white">
                    {recording.status === "starting" ? "Iniciando" : recording.status === "ending" ? "Encerrando" : `${Math.floor(recording.elapsedSeconds / 60)} min ${recording.elapsedSeconds % 60} s monitorados`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ErgoMetricsCard
              title="Inclinação do Pescoço"
              value={neckDeviation === null ? (calibration ? "Aguardando leitura" : "Aguardando calibração") : Number(neckDeviation.toFixed(1))}
              unit={neckDeviation === null ? undefined : "°"}
              status={neck?.status ?? "info"}
              icon={Compass}
              progress={neckDeviation === null ? undefined : Math.min(100, (neckDeviation / classificationConfig.neck.warningMaxDegrees) * 100)}
              idealRange={`Desvio ≤ ${classificationConfig.neck.goodMaxDegrees}°`}
              trend={neck?.status === PostureStatus.GOOD ? "improving" : "stable"}
              description="Variação do ângulo do pescoço em relação à sua postura neutra calibrada."
              details={[
                { label: "Orientação:", value: neck?.status == null ? "Indisponível" : neck.status === PostureStatus.GOOD ? "Neutra" : "Inclinada" },
                { label: "Limite Alerta:", value: `${classificationConfig.neck.warningMaxDegrees}°` },
              ]}
              isPaused={isPaused}
              inactiveModule={inactiveModuleLabel("neck")}
            />

            <ErgoMetricsCard
              title="Alinhamento Ombros"
              value={getShoulderCardValue(calibratedShoulderBalance, calibration)}
              unit={calibratedShoulderBalance === null ? undefined : "%"}
              status={shoulders?.status ?? "info"}
              icon={Sliders}
              progress={calibratedShoulderBalance ?? undefined}
              idealRange={`Desvio ≤ ${classificationConfig.shoulders.goodMaxDegrees}°`}
              trend={shoulders?.status === PostureStatus.GOOD ? "stable" : "worsening"}
              description="Alinhamento dos ombros em relação à sua postura neutra calibrada."
              details={[
                { label: "Desvio da referência:", value: shoulderDeviation === null ? "Indisponível" : `${shoulderDeviation.toFixed(1)}°` },
                {
                  label: "Balanço:", value: shoulders?.status == null
                    ? calibration?.baselineShoulderBalance === 0 ? "Recalibre a postura base" : "Indisponível"
                    : shoulders.status === PostureStatus.GOOD ? "Simétrico" : "Inclinado"
                },
              ]}
              isPaused={isPaused}
              inactiveModule={inactiveModuleLabel("shoulders")}
            />

            <ErgoMetricsCard
              title="Distância da Tela"
              value={distanceCm === null ? (calibration ? "Aguardando detecção facial" : "Aguardando calibração") : Math.round(distanceCm)}
              unit={distanceCm === null ? undefined : "cm"}
              status={distance?.status ?? "info"}
              icon={Eye}
              progress={distanceCm === null ? undefined : Math.min(100, Math.max(0, (distanceCm / 80) * 100))}
              idealRange={`${classificationConfig.distance.goodMinCm} - ${classificationConfig.distance.goodMaxCm} cm`}
              trend="stable"
              description="Estimativa pela distância entre os olhos, dependente de calibração e rosto frontal."
              details={[
                { label: "Recomendado:", value: `${classificationConfig.distance.goodMinCm}-${classificationConfig.distance.goodMaxCm} cm` },
                { label: "Medição:", value: distanceCm === null ? (calibration ? "Aguardando detecção facial" : "Não calibrada") : "Calibrada" },
                ...(calibration ? [{ label: "Ref. Base:", value: `${Math.round(calibration.baselineDistanceCm)} cm` }] : []),
              ]}
              isPaused={isPaused}
              inactiveModule={inactiveModuleLabel("distance")}
            />

            <ErgoMetricsCard
              title="Taxa de Piscadas"
              value={blinkRate === null ? "Aguardando dados" : blinkRate.toFixed(1)}
              unit={blinkRate === null ? undefined : "piscadas/min"}
              status={blink?.status ?? "info"}
              icon={Eye}
              description="Indicador experimental de frequência de piscadas. Não constitui diagnóstico de fadiga ou olho seco."
              details={[
                { label: "Piscadas na janela:", value: `${ocularMetrics?.blinkRate.blinkCount ?? 0}` },
                { label: "Total da sessão:", value: `${sessionBlinkCount}` },
                { label: "Observação:", value: `${Math.floor((ocularMetrics?.blinkRate.observedMs ?? 0) / 1000)} s válidos` },
                { label: "Frequência:", value: blink?.status == null ? "Coletando dados" : blink.status === PostureStatus.GOOD ? "Faixa de referência" : "Reduzida" },
              ]}
              isPaused={isPaused}
              inactiveModule={inactiveModuleLabel("blink-rate")}
            />

            <ErgoMetricsCard
              title="Postura da Coluna"
              value={postureStatus === null ? "Aguardando dados" : postureStatus === "good" ? "Ereta" : "Curvada"}
              status={postureStatus ?? "info"}
              icon={UserCheck}
              progress={postureStatus === "good" ? 92 : 60}
              idealRange="Neutra"
              trend={postureStatus === "good" ? "improving" : "worsening"}
              description="Alinhamento vertical do tronco e postura espinhal."
              details={[
                { label: "Curvatura:", value: postureStatus === "good" ? "Normal" : "Acentuada" },
                { label: "Suporte:", value: "Cadeira Reclinada" },
              ]}
              isPaused={isPaused}
              inactiveModule={posturalEnabled ? null : MODULE_LABELS[Module.POSTURAL_ANALYSIS]}
            />
          </div>

          <PostureHistoryLog logs={logs} onClearLogs={() => setLogs([])} userId={userId}
            recordingStatus={recording.status} isVisible={isVisible} />
        </div>
      </div>

      <WorkspaceCalibrationModal
        isOpen={isCalibrationOpen && isVisible}
        onClose={() => setIsCalibrationOpen(false)}
        onCalibrateSubmit={handleCalibrateSubmit}
        activeStream={cameraStream}
        preferredDeviceId={moduleSettings?.webCam ?? null}
        onDeviceSelect={handleWebCamSelect}
        onPostureUpdate={handlePostureUpdate}
        onPresenceChange={handlePresenceChange}
        userId={userId}
      />
    </div>
  );
}
