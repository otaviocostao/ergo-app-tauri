import { useState, useEffect, useRef, useCallback } from "react";
import {
  Video,
  VideoOff,
  Crosshair,
  AlertCircle,
  RefreshCw,
  UserX,
  AlertTriangle,
  Camera,
} from "lucide-react";
import Button from "../Button";
import Select from "../Select";
import { poseDetector, type LandmarkPoint, POSE_LANDMARK_INDEX } from "../../services/vision";
import { calculatePoseAngles, type PoseAngles } from "../../services/vision/poseAngles";
import { calculateHeadPitch, type Point2D } from "../../services/vision/biomechanics";
import type { UserPresenceState } from "../../types/vision";

export type { UserPresenceState };

export interface WebcamFeedProps {
  isMonitoring: boolean;
  onToggleMonitoring?: () => void;
  onCalibrate?: () => void;
  onPostureUpdate?: (metrics: {
    neckAngle: number;
    shoulderBalance: number;
    distanceCm: number;
    status: "good" | "warning" | "danger";
    statusLabel: string;
    presence?: UserPresenceState;
  }) => void;
  onPresenceChange?: (presence: UserPresenceState) => void;
  onHardwareBusyChange?: (isBusy: boolean) => void;
  onStreamChange?: (stream: MediaStream | null) => void;
  className?: string;
}

/**
 * Intervalo de amostragem de inferência do loop de vídeo:
 * 90ms ≈ 11.1 FPS (atende ao requisito de 10-12 FPS para redução drástica de CPU/GPU).
 */
const INFERENCE_INTERVAL_MS = 90;

// Bridge short detection gaps without retaining stale body positions indefinitely.
const OVERLAY_MAX_AGE_MS = 300;

interface PoseOverlay {
  head: Point2D;
  leftShoulder: Point2D;
  rightShoulder: Point2D;
  detectedAt: number;
}

/**
 * Tempo de tolerância para ausência do usuário: 5 segundos.
 */
const ABSENCE_THRESHOLD_MS = 5000;

/**
 * Fator de suavização temporal (Filtro Exponencial EMA) para estabilizar oscilações angulares.
 */
const EMA_ALPHA = 0.3;

export default function WebcamFeed({
  isMonitoring,
  onToggleMonitoring,
  onCalibrate,
  onPostureUpdate,
  onPresenceChange,
  onHardwareBusyChange,
  onStreamChange,
  className = "",
}: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const hasMeasuredFrameRef = useRef(false);
  const lastOverlayRef = useRef<PoseOverlay | null>(null);

  // Estados de dispositivos e permissão
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isCameraMuted, setIsCameraMuted] = useState(false);
  const isCameraMutedRef = useRef(false);

  // Estados de concorrência de hardware (Exclusive Lock no Windows)
  const [isHardwareBusy, setIsHardwareBusy] = useState<boolean>(false);
  const [hardwareErrorMessage, setHardwareErrorMessage] = useState<string | null>(null);

  // Estados de IA e Presença
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [presenceState, setPresenceState] = useState<UserPresenceState>("PARTIALLY_OCCLUDED");
  const [showOverlay] = useState<boolean>(true);

  // Refs de controle de ciclo de inferência
  const lastInferenceTimeRef = useRef<number>(0);
  const lastLandmarksDetectedTimeRef = useRef<number>(Date.now());
  const presenceRef = useRef<UserPresenceState>("PARTIALLY_OCCLUDED");
  const isMonitoringRef = useRef<boolean>(isMonitoring);
  const isHardwareBusyRef = useRef<boolean>(false);
  const onPostureUpdateRef = useRef(onPostureUpdate);
  const onPresenceChangeRef = useRef(onPresenceChange);
  const onHardwareBusyChangeRef = useRef(onHardwareBusyChange);
  const onStreamChangeRef = useRef(onStreamChange);

  // Métricas suavizadas em memória
  const smoothedMetricsRef = useRef({
    neckAngle: 12,
    shoulderBalance: 96,
    distanceCm: 62,
  });

  // Mantém refs atualizados sem disparar re-render
  useEffect(() => {
    isMonitoringRef.current = isMonitoring;
  }, [isMonitoring]);

  useEffect(() => {
    isHardwareBusyRef.current = isHardwareBusy;
  }, [isHardwareBusy]);

  useEffect(() => {
    onPostureUpdateRef.current = onPostureUpdate;
  }, [onPostureUpdate]);

  useEffect(() => {
    onPresenceChangeRef.current = onPresenceChange;
  }, [onPresenceChange]);

  useEffect(() => {
    onHardwareBusyChangeRef.current = onHardwareBusyChange;
  }, [onHardwareBusyChange]);

  useEffect(() => {
    onStreamChangeRef.current = onStreamChange;
  }, [onStreamChange]);

  /**
   * Inicializa o detector MediaPipe WebAssembly / GPU em segundo plano.
   */
  useEffect(() => {
    let isCancelled = false;

    async function initDetector() {
      if (poseDetector.isReady()) {
        return;
      }

      setIsAiLoading(true);
      try {
        await poseDetector.initialize();
        if (!isCancelled) {
          console.info("[WebcamFeed] MediaPipe Pose/Face inicializado com sucesso.");
        }
      } catch (err) {
        console.warn("[WebcamFeed] Não foi possível carregar o detector MediaPipe; operando em modo de contingência:", err);
      } finally {
        if (!isCancelled) {
          setIsAiLoading(false);
        }
      }
    }

    initDetector();

    return () => {
      isCancelled = true;
    };
  }, []);

  /**
   * Enumeração de câmeras conectadas e listener para hotplug (plugar/desplugar webcam).
   */
  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
      }
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devList.filter((dev) => dev.kind === "videoinput");
      setDevices(videoInputs);

      if (videoInputs.length > 0) {
        setSelectedDeviceId((prev) => {
          if (prev && videoInputs.some((d) => d.deviceId === prev)) {
            return prev;
          }
          return videoInputs[0].deviceId;
        });
      }
    } catch (err) {
      console.warn("[WebcamFeed] Erro ao enumerar dispositivos de mídia:", err);
    }
  }, []);

  useEffect(() => {
    enumerateCameras();

    const handleDeviceChange = () => {
      console.info("[WebcamFeed] Dispositivo conectado ou removido; atualizando lista...");
      enumerateCameras();
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [enumerateCameras]);

  const stopCurrentStream = useCallback(() => {
    cameraRequestRef.current += 1;
    hasMeasuredFrameRef.current = false;
    lastOverlayRef.current = null;
    isCameraMutedRef.current = false;
    setIsCameraMuted(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.onmute = null;
        track.onunmute = null;
        track.stop();
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    onStreamChangeRef.current?.(null);
  }, []);

  const handleHardwareLock = useCallback(
    (reason: string) => {
      console.warn(`[WebcamFeed] Exclusive Lock do Windows acionado: ${reason}`);
      stopCurrentStream();
      setIsHardwareBusy(true);
      setHardwareErrorMessage(reason);
      presenceRef.current = "PARTIALLY_OCCLUDED";
      setPresenceState("PARTIALLY_OCCLUDED");
      onPresenceChangeRef.current?.("PARTIALLY_OCCLUDED");
      onHardwareBusyChangeRef.current?.(true);
    },
    [stopCurrentStream]
  );

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCameraPermission(false);
      setPermissionError("Seu navegador não possui suporte à API navigator.mediaDevices.");
      return;
    }

    stopCurrentStream();
    const requestId = cameraRequestRef.current;
    setIsHardwareBusy(false);
    setHardwareErrorMessage(null);
    onHardwareBusyChangeRef.current?.(false);

    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          }
          : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Release requests that finished after pause, device switching or unmount.
      if (requestId !== cameraRequestRef.current || !isMonitoringRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      onStreamChangeRef.current?.(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (isMonitoringRef.current && !isHardwareBusyRef.current) {
            handleHardwareLock(
              "A câmera foi solicitada por outro aplicativo. O monitoramento foi pausado para evitar conflitos entre os aplicativos."
            );
          }
        };

        const handleTrackMute = (muted: boolean) => {
          if (streamRef.current !== stream || !isMonitoringRef.current) return;
          isCameraMutedRef.current = muted;
          setIsCameraMuted(muted);
          hasMeasuredFrameRef.current = false;
          lastOverlayRef.current = null;
          lastLandmarksDetectedTimeRef.current = Date.now();
          // Keep metrics paused after unmute until a fresh valid frame arrives.
          if (presenceRef.current !== "PARTIALLY_OCCLUDED") {
            presenceRef.current = "PARTIALLY_OCCLUDED";
            setPresenceState("PARTIALLY_OCCLUDED");
            onPresenceChangeRef.current?.("PARTIALLY_OCCLUDED");
          }
        };
        videoTrack.onmute = () => handleTrackMute(true);
        videoTrack.onunmute = () => handleTrackMute(false);
        if (videoTrack.muted) handleTrackMute(true);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn("[WebcamFeed] Falha ao iniciar reprodução do elemento <video>:", playErr);
        }
      }

      setHasCameraPermission(true);
      setPermissionError(null);
      lastLandmarksDetectedTimeRef.current = Date.now();

      // Atualiza lista de dispositivos caso as labels estivessem anônimas antes do consentimento
      enumerateCameras();
    } catch (err: unknown) {
      if (requestId !== cameraRequestRef.current) return;
      const error = err as { name?: string; message?: string };
      console.warn("[WebcamFeed] Erro ao obter acesso à câmera:", err);

      // Bloqueio Exclusivo do Driver do Windows (NotReadableError, TrackStartError, AbortError)
      if (
        error.name === "NotReadableError" ||
        error.name === "TrackStartError" ||
        error.name === "AbortError" ||
        error.message?.toLowerCase().includes("device in use") ||
        error.message?.toLowerCase().includes("could not start video source")
      ) {
        handleHardwareLock(
          "A câmera já está sendo utilizada por outro aplicativo. O monitoramento foi pausado para liberar o dispositivo."
        );
      } else if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        setHasCameraPermission(false);
        setPermissionError("Permissão de câmera negada. Habilite a câmera nas permissões do sistema ou navegador.");
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        setHasCameraPermission(false);
        setPermissionError("Nenhuma câmera física encontrada conectada ao computador.");
      } else {
        setHasCameraPermission(false);
        setPermissionError("Não foi possível acessar a câmera. Verifique se o dispositivo está conectado e com permissões concedidas.");
      }
    }
  }, [selectedDeviceId, stopCurrentStream, handleHardwareLock, enumerateCameras]);


  useEffect(() => {
    if (isMonitoring) {
      startCamera();
    } else {
      stopCurrentStream();
    }

    return () => {
      stopCurrentStream();
    };
  }, [isMonitoring, selectedDeviceId, startCamera, stopCurrentStream]);

  /**
   * Tenta retomar a captura após o usuário encerrar a videochamada concorrente.
   */
  const handleRetryHardware = useCallback(() => {
    setIsHardwareBusy(false);
    setHardwareErrorMessage(null);
    onHardwareBusyChangeRef.current?.(false);
    startCamera();
  }, [startCamera]);

  /**
   * Loop de Vídeo com Limitação de Inferência para 10-12 FPS (intervalo de ~90ms),
   * Detecção de Ausência do Usuário (ABSENT > 5s) e Renderização Visual do Esqueleto no Canvas.
   */
  useEffect(() => {
    let animationFrameId: number;

    const processFrame = (currentTime: DOMHighResTimeStamp) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      if (!canvas) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      // Ajusta resolução do canvas para coincidir exatamente com as dimensões do container
      if (canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Limpa canvas para novo desenho
      ctx.clearRect(0, 0, w, h);

      if (!isMonitoringRef.current || isHardwareBusyRef.current || isCameraMutedRef.current) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      const now = Date.now();
      const elapsedSinceLastInference = currentTime - lastInferenceTimeRef.current;

      // -------------------------------------------------------------
      // 1. CICLO DE INFERÊNCIA LIMITADO A 10-12 FPS (~80-100ms)
      // -------------------------------------------------------------
      const shouldRunInference = elapsedSinceLastInference >= INFERENCE_INTERVAL_MS;

      let currentPoseDetected = false;
      let leftShoulderPt: LandmarkPoint | null = null;
      let rightShoulderPt: LandmarkPoint | null = null;
      let headPt: Point2D | null = null;
      let poseAngles: PoseAngles | null = null;
      let headPitch: number | null = null;

      if (shouldRunInference) {
        lastInferenceTimeRef.current = currentTime - (elapsedSinceLastInference % INFERENCE_INTERVAL_MS);

        if (poseDetector.isReady() && video && video.readyState >= 2) {
          // Inferência real através do MediaPipe WebGL / WebAssembly
          try {
            const detection = poseDetector.detectFrame(video);
            headPitch = detection.hasFace ? calculateHeadPitch(detection.faceTransformationMatrix) : null;
            if (detection.hasPose && detection.poseLandmarks && detection.poseLandmarks.length >= 13) {
              const nose = detection.poseLandmarks[POSE_LANDMARK_INDEX.NOSE];
              const leftShoulder = detection.poseLandmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
              const rightShoulder = detection.poseLandmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];

              // Confirmação de confiança anatômica mínima
              const hasConfidence = [nose, leftShoulder, rightShoulder].every((point) =>
                point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
                (point.visibility ?? 1) > 0.35 && (point.presence ?? 1) > 0.35
              );

              if (hasConfidence) {
                currentPoseDetected = true;
                poseAngles = calculatePoseAngles(detection.poseLandmarks, video.videoWidth, video.videoHeight);
                headPt = poseAngles?.headCenter ?? nose;
                leftShoulderPt = leftShoulder;
                rightShoulderPt = rightShoulder;
              }
            }
          } catch (detectionErr) {
            console.warn("[WebcamFeed] Erro ao processar frame de detecção:", detectionErr);
          }
        }

        // -------------------------------------------------------------
        // 2. TRATAMENTO DE AUSÊNCIA DO USUÁRIO (ABSENT > 5s)
        // -------------------------------------------------------------
        if (currentPoseDetected) {
          lastLandmarksDetectedTimeRef.current = now;

          const nextPresence = poseAngles && headPitch !== null ? "ACTIVE" : "PARTIALLY_OCCLUDED";
          if (presenceRef.current !== nextPresence) {
            presenceRef.current = nextPresence;
            setPresenceState(nextPresence);
            onPresenceChangeRef.current?.(nextPresence);
          }
        } else {
          const timeSinceLastDetection = now - lastLandmarksDetectedTimeRef.current;

          if (timeSinceLastDetection >= ABSENCE_THRESHOLD_MS) {
            if (presenceRef.current !== "ABSENT") {
              presenceRef.current = "ABSENT";
              setPresenceState("ABSENT");
              onPresenceChangeRef.current?.("ABSENT");

              // Pausa o cômputo de má postura e avisa a página de monitoramento
              onPostureUpdateRef.current?.({
                neckAngle: Math.round(smoothedMetricsRef.current.neckAngle),
                shoulderBalance: Math.round(smoothedMetricsRef.current.shoulderBalance),
                distanceCm: Math.round(smoothedMetricsRef.current.distanceCm),
                status: "good",
                statusLabel: "Usuário Ausente (Pausado)",
                presence: "ABSENT",
              });
            }
          } else if (timeSinceLastDetection > 1000 && presenceRef.current === "ACTIVE") {
            // Breve intervalo transitório de oclusão parcial
            presenceRef.current = "PARTIALLY_OCCLUDED";
            setPresenceState("PARTIALLY_OCCLUDED");
            onPresenceChangeRef.current?.("PARTIALLY_OCCLUDED");
          }
        }

        // Paused tracking must not blend pre-gap posture into the first new measurement.
        if (presenceRef.current !== "ACTIVE") hasMeasuredFrameRef.current = false;

        // -------------------------------------------------------------
        // 3. EXTRAÇÃO DE ÂNGULOS BIOMECÂNICOS & ATUALIZAÇÃO DE MÉTRICAS
        // -------------------------------------------------------------
        if (currentPoseDetected && poseAngles && headPitch !== null && leftShoulderPt && rightShoulderPt) {
          lastOverlayRef.current = {
            head: { ...poseAngles.headCenter },
            leftShoulder: { x: leftShoulderPt.x, y: leftShoulderPt.y },
            rightShoulder: { x: rightShoulderPt.x, y: rightShoulderPt.y },
            detectedAt: currentTime,
          };
          // Keep both upward and downward deviations; opposite signs must not
          // cancel in the EMA, nor hide behind a centered image-plane vector.
          const rawNeckAngle = Math.max(poseAngles.neckAngle, Math.abs(headPitch));
          const rawShoulderBalance = poseAngles.shoulderBalance;

          // Estimativa de distância proporcional à largura dos ombros normalizada
          const shoulderWidthNorm = Math.sqrt(
            Math.pow(rightShoulderPt.x - leftShoulderPt.x, 2) + Math.pow(rightShoulderPt.y - leftShoulderPt.y, 2)
          );
          const rawDistanceCm = Math.max(
            35,
            Math.min(95, Math.round(60 * (0.32 / Math.max(0.12, shoulderWidthNorm))))
          );

          // Suavização temporal (EMA) para estabilizar oscilações
          // Keep fractional values in the filter; round only when publishing to UI.
          const alpha = hasMeasuredFrameRef.current ? EMA_ALPHA : 1;
          const smoothedNeck = alpha * rawNeckAngle + (1 - alpha) * smoothedMetricsRef.current.neckAngle;
          const smoothedShoulder = alpha * rawShoulderBalance + (1 - alpha) * smoothedMetricsRef.current.shoulderBalance;
          const smoothedDist = alpha * rawDistanceCm + (1 - alpha) * smoothedMetricsRef.current.distanceCm;
          hasMeasuredFrameRef.current = true;

          smoothedMetricsRef.current = {
            neckAngle: smoothedNeck,
            shoulderBalance: smoothedShoulder,
            distanceCm: smoothedDist,
          };

          // Classificação de risco ergonômico
          let postureStatus: "good" | "warning" | "danger" = "good";
          let postureLabel = "Postura Excelente";

          if (smoothedNeck > 20 || smoothedShoulder < 85 || smoothedDist < 45) {
            postureStatus = "danger";
            postureLabel =
              smoothedNeck > 20
                ? "Atenção: Pescoço Muito Inclinado!"
                : smoothedDist < 45
                  ? "Muito Próximo da Tela"
                  : "Ombros Desalinhados";
          } else if (smoothedNeck > 14 || smoothedShoulder < 92) {
            postureStatus = "warning";
            postureLabel = smoothedNeck > 14
              ? "Atenção à Inclinação do Pescoço"
              : "Atenção ao Alinhamento dos Ombros";
          }

          onPostureUpdateRef.current?.({
            neckAngle: Math.round(smoothedNeck),
            shoulderBalance: Math.round(smoothedShoulder),
            distanceCm: Math.round(smoothedDist),
            status: postureStatus,
            statusLabel: postureLabel,
            presence: "ACTIVE",
          });
        }
      }

      // -------------------------------------------------------------
      // 4. DESENHO DO ESQUELETO ERGONÔMICO NO CANVAS
      // -------------------------------------------------------------
      const overlay = lastOverlayRef.current;
      if (overlay && currentTime - overlay.detectedAt > OVERLAY_MAX_AGE_MS) {
        lastOverlayRef.current = null;
      }
      if (showOverlay && presenceRef.current !== "ABSENT") {
        // Redraw the latest valid pose on every animation frame, between inferences.
        if (lastOverlayRef.current) {
          const { head: headPt, leftShoulder: leftShoulderPt, rightShoulder: rightShoulderPt } = lastOverlayRef.current;
          // Match the video's centered object-cover crop and horizontal mirror.
          const frameWidth = !isSimulatedMode && video?.videoWidth ? video.videoWidth : w;
          const frameHeight = !isSimulatedMode && video?.videoHeight ? video.videoHeight : h;
          const scale = Math.max(w / frameWidth, h / frameHeight);
          const renderedWidth = frameWidth * scale;
          const renderedHeight = frameHeight * scale;
          const offsetX = (w - renderedWidth) / 2;
          const offsetY = (h - renderedHeight) / 2;
          const project = (point: Point2D) => ({
            x: (1 - point.x) * renderedWidth + offsetX,
            y: point.y * renderedHeight + offsetY,
          });
          const { x: headCanvasX, y: headCanvasY } = project(headPt);
          const { x: leftShoulderCanvasX, y: leftShoulderCanvasY } = project(leftShoulderPt);
          const { x: rightShoulderCanvasX, y: rightShoulderCanvasY } = project(rightShoulderPt);

          const neckCanvasX = (leftShoulderCanvasX + rightShoulderCanvasX) / 2;
          const neckCanvasY = (leftShoulderCanvasY + rightShoulderCanvasY) / 2;

          ctx.lineWidth = 2.5;

          // Linha Biacromial dos Ombros
          ctx.beginPath();
          ctx.strokeStyle =
            smoothedMetricsRef.current.shoulderBalance >= 90
              ? "rgba(16, 185, 129, 0.85)"
              : "rgba(245, 158, 11, 0.85)";
          ctx.moveTo(leftShoulderCanvasX, leftShoulderCanvasY);
          ctx.lineTo(rightShoulderCanvasX, rightShoulderCanvasY);
          ctx.stroke();

          // Vetor Cervical (Pescoço -> Cabeça)
          ctx.beginPath();
          ctx.strokeStyle =
            smoothedMetricsRef.current.neckAngle <= 14
              ? "rgba(16, 185, 129, 0.85)"
              : smoothedMetricsRef.current.neckAngle <= 20
                ? "rgba(245, 158, 11, 0.85)"
                : "rgba(239, 68, 68, 0.85)";
          ctx.moveTo(neckCanvasX, neckCanvasY);
          ctx.lineTo(headCanvasX, headCanvasY);
          ctx.stroke();

          // Alinhamento Escapular com o Tronco
          ctx.beginPath();
          ctx.strokeStyle = "rgba(99, 102, 241, 0.55)";
          ctx.moveTo(neckCanvasX, neckCanvasY);
          ctx.lineTo(leftShoulderCanvasX, leftShoulderCanvasY);
          ctx.moveTo(neckCanvasX, neckCanvasY);
          ctx.lineTo(rightShoulderCanvasX, rightShoulderCanvasY);
          ctx.stroke();

          // Pontos articulares com halo suave
          const points = [
            { x: headCanvasX, y: headCanvasY, r: 7, color: "#10b981" },
            { x: neckCanvasX, y: neckCanvasY, r: 5, color: "#6366f1" },
            { x: leftShoulderCanvasX, y: leftShoulderCanvasY, r: 6, color: "#3b82f6" },
            { x: rightShoulderCanvasX, y: rightShoulderCanvasY, r: 6, color: "#3b82f6" },
          ];

          points.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
          });
        }

        // Guia Ergonômico de Enquadramento Facial / Distância
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(w * 0.22, h * 0.15, w * 0.56, h * 0.7);
        ctx.setLineDash([]);
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    if (isMonitoring) {
      animationFrameId = requestAnimationFrame(processFrame);
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isMonitoring, showOverlay]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl ${className}`}
    >
      <div className="flex items-center justify-between p-3.5 bg-slate-900/95 backdrop-blur-md z-20 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Feed da Câmera</h3>
              {isAiLoading && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <RefreshCw size={10} className="animate-spin" /> Carregando IA...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1.5">
              <span className="relative flex h-2.5 w-2.5">
                {isMonitoring && !isHardwareBusy && presenceState === "ACTIVE" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${!isMonitoring
                    ? "bg-slate-600"
                    : isHardwareBusy
                      ? "bg-amber-500"
                      : presenceState === "ABSENT"
                        ? "bg-slate-500"
                        : presenceState === "PARTIALLY_OCCLUDED"
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                    }`}
                ></span>
              </span>

              <span
                className={`text-xs font-medium ${!isMonitoring
                  ? "text-slate-400"
                  : isHardwareBusy
                    ? "text-amber-400 font-semibold"
                    : presenceState === "ABSENT"
                      ? "text-slate-400"
                      : presenceState === "PARTIALLY_OCCLUDED"
                        ? "text-amber-300"
                        : "text-emerald-400 font-semibold"
                  }`}
              >
                {!isMonitoring
                  ? "Monitoramento pausado"
                  : isHardwareBusy
                    ? "Conflito de hardware (Pausado)"
                    : isCameraMuted
                      ? "Câmera temporariamente indisponível (Pausado)"
                      : presenceState === "ABSENT"
                        ? "Usuário ausente"
                        : presenceState === "PARTIALLY_OCCLUDED"
                          ? "Ajuste o enquadramento"
                          : "Monitoramento ativo"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {devices.length > 0 && !isHardwareBusy && (
            <div className="hidden sm:block w-48">
              <Select
                selectSize="sm"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                options={devices.map((d, i) => ({
                  label: d.label || `Câmera ${i + 1}`,
                  value: d.deviceId,
                }))}
                variant="filled"
                className="!bg-slate-800 !text-white text-xs !border-slate-700 focus:!bg-slate-800 focus:ring-primary-500/20"
                optionClassName="!bg-slate-800 !text-white"
              />
            </div>
          )}
        </div>
      </div>

      <div className="relative w-full aspect-video min-h-[320px] max-h-[460px] flex items-center justify-center overflow-hidden bg-slate-950">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${!isMonitoring || isHardwareBusy || !hasCameraPermission
            ? "opacity-0 pointer-events-none"
            : "opacity-100"
            }`}
        />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none z-10 transition-opacity duration-300 ${isHardwareBusy || !isMonitoring ? "opacity-0" : "opacity-100"
            }`}
        />

        {isMonitoring && !isHardwareBusy && hasCameraPermission && presenceState === "ABSENT" && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300 text-xs shadow-lg backdrop-blur-md animate-fadeIn">
            <UserX size={15} className="text-amber-400 animate-pulse" />
            <span>Nenhum usuário detectado há mais de 5s — métricas pausadas</span>
          </div>
        )}

        {isMonitoring && !isHardwareBusy && hasCameraPermission && presenceState === "PARTIALLY_OCCLUDED" && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs shadow-lg backdrop-blur-md animate-fadeIn">
            <AlertTriangle size={15} />
            <span>{isCameraMuted
              ? "Câmera temporariamente indisponível. A análise será retomada automaticamente."
              : "Posicione cabeça e ombros dentro da área pontilhada"}</span>
          </div>
        )}

        {isMonitoring && isHardwareBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-sm z-20 text-slate-200 animate-fadeIn">
            <div className="p-4 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 mb-3 animate-pulse">
              <AlertCircle size={36} />
            </div>
            <h4 className="text-base font-semibold text-white">Câmera em Uso por Outro Aplicativo</h4>
            <p className="text-xs text-slate-300 mt-2 max-w-md leading-relaxed">
              {hardwareErrorMessage ||
                "O Windows aloca acesso exclusivo à câmera para um software por vez. Detectamos conflito com uma videochamada (ex.: Google Meet, Microsoft Teams ou Zoom)."}
            </p>

            <div className="flex items-center gap-3 mt-5">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRetryHardware}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                Retomar Monitoramento
              </Button>
            </div>
          </div>
        )}

        {isMonitoring && !isHardwareBusy && hasCameraPermission === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 z-20 text-slate-300">
            <div className="p-4 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 mb-3">
              <Camera size={36} />
            </div>
            <h4 className="text-base font-semibold text-white">Falha no Acesso à Câmera</h4>
            <p className="text-xs text-slate-300 mt-2 max-w-sm">
              {permissionError || "Não foi possível iniciar o feed de vídeo da webcam."}
            </p>

            <div className="flex items-center gap-3 mt-5">
              <Button
                variant="primary"
                size="sm"
                onClick={() => startCamera()}
                className="bg-primary-600 hover:bg-primary-500 text-white"
              >
                <RefreshCw size={14} /> Tentar Novamente
              </Button>
            </div>
          </div>
        )}

        {!isMonitoring && !isHardwareBusy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-400 z-10">
            <div className="p-4 rounded-full bg-slate-800 text-slate-500 mb-3">
              <VideoOff size={32} />
            </div>
            <p className="text-sm font-semibold text-slate-300">Câmera Desativada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Clique em "Iniciar Monitoramento" para ativar a captura e inferência postural ao vivo.
            </p>
          </div>
        )}

        {(onToggleMonitoring || onCalibrate) && (
          <div className="absolute bottom-4 flex items-center justify-center gap-2 z-20">
            {onToggleMonitoring && (
              <Button
                variant="primary"
                size="md"
                onClick={onToggleMonitoring}
                className="bg-slate-900/90 hover:bg-slate-800 active:bg-slate-800 text-white  backdrop-blur-md transition-all shadow-lg"
              >
                {isMonitoring ? (
                  <>
                    <VideoOff size={16} /> Pausar Monitoramento
                  </>
                ) : (
                  <>
                    <Video size={16} /> Iniciar Monitoramento
                  </>
                )}
              </Button>
            )}

            {onCalibrate && (
              <Button
                size="md"
                onClick={onCalibrate}
                className="bg-slate-900/90 hover:bg-slate-800 active:bg-slate-800 text-white backdrop-blur-md transition-all shadow-lg"
              >
                <Crosshair size={14} />
                Calibrar Postura Base
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

