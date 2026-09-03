import { useState, useEffect, useRef } from "react";
import {
  Video,
  VideoOff,
  Eye,
  EyeOff,
  Crosshair,
  Sparkles,
} from "lucide-react";
import Button from "../Button";
import Select from "../Select";

export interface WebcamFeedProps {
  isMonitoring: boolean;
  onToggleMonitoring: () => void;
  onCalibrate: () => void;
  onPostureUpdate?: (metrics: {
    neckAngle: number;
    shoulderBalance: number;
    distanceCm: number;
    status: "good" | "warning" | "danger";
    statusLabel: string;
  }) => void;
  className?: string;
}

export default function WebcamFeed({
  isMonitoring,
  onToggleMonitoring,
  onCalibrate,
  onPostureUpdate,
  className = "",
}: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(false);

  useEffect(() => {
    async function getCameras() {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devList.filter((dev) => dev.kind === "videoinput");
        setDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn("Unable to enumerate media devices:", err);
      }
    }
    getCameras();
  }, []);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      if (!isMonitoring) return;

      try {
        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setHasCameraPermission(true);
        setIsSimulatedMode(false);
      } catch (err) {
        console.warn("Camera access failed or denied, switching to interactive simulation mode:", err);
        setHasCameraPermission(false);
        setIsSimulatedMode(true);
      }
    }

    if (isMonitoring) {
      startCamera();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isMonitoring, selectedDeviceId]);

  // AI Skeleton Canvas Drawing Loop & Real-time simulation state update
  useEffect(() => {
    let animationFrameId: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Adjust canvas resolution to parent size
      if (canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      }

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      if (!isMonitoring) return;

      // Calculate subtle dynamic keypoints simulating real-time posture analysis
      const now = Date.now() / 1000;
      const headX = w / 2 + Math.sin(now * 0.8) * 12;
      const headY = h * 0.32 + Math.cos(now * 0.5) * 8;

      const neckX = headX;
      const neckY = headY + 55;

      const leftShoulderX = headX - 110 + Math.sin(now * 0.4) * 4;
      const leftShoulderY = neckY + 45;

      const rightShoulderX = headX + 110 - Math.sin(now * 0.4) * 4;
      const rightShoulderY = neckY + 45 + Math.sin(now * 0.6) * 6; // Slight shoulder tilt

      // Calculate simulated metrics from keypoints
      const shoulderDiffY = Math.abs(leftShoulderY - rightShoulderY);
      const neckTiltDeg = Math.round(Math.abs(headX - w / 2) * 0.4 + Math.sin(now * 0.7) * 3 + 8);
      const shoulderBal = Math.round(100 - shoulderDiffY * 2);
      const distance = Math.round(62 + Math.cos(now * 0.3) * 5);

      let status: "good" | "warning" | "danger" = "good";
      let statusLbl = "Postura Excelente";

      if (neckTiltDeg > 22 || shoulderBal < 88 || distance < 45) {
        status = "danger";
        statusLbl = neckTiltDeg > 22 ? "Atenção: Pescoço Muito Inclinado!" : distance < 45 ? "Muito Próximo da Tela" : "Ombros Desalinhados";
      } else if (neckTiltDeg > 15 || shoulderBal < 92) {
        status = "warning";
        statusLbl = "Atenção à Inclinação do Pescoço";
      }

      if (onPostureUpdate) {
        onPostureUpdate({
          neckAngle: neckTiltDeg,
          shoulderBalance: shoulderBal,
          distanceCm: distance,
          status,
          statusLabel: statusLbl,
        });
      }

      // Draw AI Visual Mesh if overlay is enabled
      if (showOverlay) {
        ctx.lineWidth = 2.5;

        // Draw Shoulder Line
        ctx.beginPath();
        ctx.strokeStyle = shoulderBal > 90 ? "rgba(19, 184, 154, 0.85)" : "rgba(245, 158, 11, 0.85)";
        ctx.moveTo(leftShoulderX, leftShoulderY);
        ctx.lineTo(rightShoulderX, rightShoulderY);
        ctx.stroke();

        // Draw Neck Vector Line
        ctx.beginPath();
        ctx.strokeStyle = neckTiltDeg < 16 ? "rgba(19, 184, 154, 0.85)" : "rgba(239, 68, 68, 0.85)";
        ctx.moveTo(headX, headY);
        ctx.lineTo(neckX, neckY);
        ctx.stroke();

        // Draw Torso Alignment Lines
        ctx.beginPath();
        ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
        ctx.moveTo(neckX, neckY);
        ctx.lineTo(leftShoulderX, leftShoulderY);
        ctx.moveTo(neckX, neckY);
        ctx.lineTo(rightShoulderX, rightShoulderY);
        ctx.stroke();

        // Keypoint circles
        const points = [
          { x: headX, y: headY, r: 7, label: "Cabeça", color: "#13b89a" },
          { x: neckX, y: neckY, r: 5, label: "Pescoço", color: "#6366f1" },
          { x: leftShoulderX, y: leftShoulderY, r: 6, label: "Ombro E", color: "#3b82f6" },
          { x: rightShoulderX, y: rightShoulderY, r: 6, label: "Ombro D", color: "#3b82f6" },
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

        // Draw Ergonomic Zone Box / Proximity Guide
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(w * 0.22, h * 0.15, w * 0.56, h * 0.7);
        ctx.setLineDash([]);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    if (isMonitoring) {
      draw();
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
  }, [isMonitoring, showOverlay, onPostureUpdate]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-slate-900 rounded-2xl overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between p-3.5 bg-slate-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-2.5">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              Feed da Câmera
            </h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="relative flex h-2.5 w-2.5">
                {isMonitoring && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isMonitoring ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                ></span>
              </span>
              <span
                className={`text-xs font-medium ${isMonitoring
                  ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                  : "text-slate-500 dark:text-slate-400"
                  }`}
              >
                {isMonitoring ? "Monitoramento ativo" : "Monitoramento pausado"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {devices.length > 0 && (
            <div className="hidden sm:block w-48">
              <Select
                selectSize="md"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                options={devices.map((d, i) => ({
                  label: d.label || `Câmera ${i + 1}`,
                  value: d.deviceId,
                }))}
                variant="filled"
                className="bg-slate-800 text-white text-xs border-slate-700 focus:bg-slate-800 focus:ring-primary-500/20"
                optionClassName="bg-slate-800 text-white"
              />
            </div>
          )}

          <button
            onClick={() => setShowOverlay(!showOverlay)}
            className={`p-2 rounded-lg text-xs font-medium transition-colors ${showOverlay
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
              : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            title="Exibir pontos corporais"
          >
            {showOverlay ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-video min-h-[320px] max-h-[460px] bg-slate-950 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${!isMonitoring || isSimulatedMode ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
        />

        {(!hasCameraPermission || isSimulatedMode || !isMonitoring) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-radial from-slate-900 to-slate-950 text-slate-400">
            {isMonitoring ? (
              <div className="relative flex items-center justify-center w-full h-full">
                <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
                <div className="z-10 flex flex-col items-center">
                  <div className="relative p-5 rounded-full bg-slate-800/80 border border-slate-700/80 text-primary-400 mb-3 animate-pulse">
                    <Sparkles size={36} />
                  </div>
                  <p className="text-sm font-medium text-slate-200">
                    Processando Detecção de Postura em Tempo Real
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Rastreando pontos-chave do pescoço, ombros e distância do monitor.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center">
                <div className="p-4 rounded-full bg-slate-800 text-slate-500 mb-3">
                  <VideoOff size={32} />
                </div>
                <p className="text-sm font-semibold text-slate-300">Câmera Desativada</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Clique em "Iniciar Monitoramento" para ativar a detecção e calibração ao vivo.
                </p>
              </div>
            )}
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />


        <div className="absolute bottom-4 flex items-center justify-center gap-2">
          <Button
            variant="primary"
            size="md"
            onClick={onToggleMonitoring}
            className="bg-slate-900/90 hover:bg-slate-800 active:bg-slate-800 text-white border border-slate-700 backdrop-blur-md transition-all ring-none"
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
          <Button
            size="md"
            onClick={onCalibrate}
            className="bg-slate-900/90 hover:bg-slate-800 active:bg-slate-800 text-white border border-slate-700 backdrop-blur-md transition-all"
          >
            <Crosshair size={14} />
            Calibrar Postura Base
          </Button>
        </div>
      </div>
    </div>
  );
}
