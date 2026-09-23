import { useState, useEffect, useRef } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Select from "../Select";
import {
  CheckCircle2,
  Image as ImageIcon,
  Laptop,
  Monitor,
  Sparkles,
} from "lucide-react";

export interface WorkspaceCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrateSubmit: () => void;
  isNotebookUser?: boolean;
  neckAngle?: number;
  shoulderBalance?: number;
}

export interface SetupStep {
  id: number;
  title: string;
  description: string;
  imageSrc?: string;
  imageAlt?: string;
}

export default function WorkspaceCalibrationModal({
  isOpen,
  onClose,
  onCalibrateSubmit,
  neckAngle = 12,
  shoulderBalance = 96,
}: WorkspaceCalibrationModalProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  const [deviceType, setDeviceType] = useState<"desktop" | "notebook">("notebook");
  const [hasExternalKeyboard, setHasExternalKeyboard] = useState<boolean>(true);
  const [hasExternalMouse, setHasExternalMouse] = useState<boolean>(true);
  const [hasWebcam] = useState<boolean>(true);
  const [isWebcamFront, setIsWebcamFront] = useState<boolean>(true);
  const [adjustableDesk, setAdjustableDesk] = useState<boolean>(false);
  const [adjustableChair, setAdjustableChair] = useState<boolean>(true);
  const [adjustableMonitor, setAdjustableMonitor] = useState<boolean>(true);

  useEffect(() => {
    if (deviceType === "desktop") {
      setHasExternalKeyboard(true);
      setHasExternalMouse(true);
    }
  }, [deviceType]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isSimulatedMode, setIsSimulatedMode] = useState<boolean>(false);

  const baseSteps: SetupStep[] = [
    {
      id: 1,
      title: "1. Ajuste da Cadeira",
      description:
        "O primeiro passo para começar a ajustar seu ambiente de trabalho é certificar-se de que sua cadeira está na altura ideal. O esperado é que a altura dela permita que seus pés toquem o chão ou a base de apoio, formando um ângulo de 90 graus nos seus joelhos. Isso fará com que você fique bem apoiado.",
    },
    {
      id: 2,
      title: "2. Altura da Mesa e Cotovelos",
      description:
        "O segundo passo é avaliar a altura da mesa. O ideal é que seus cotovelos formem um ângulo de 90 graus. Se possível, ajuste a altura da mesa; caso não consiga, ajuste a altura da cadeira para cima ou para baixo. Se a cadeira ficar alta para atingir a angulação ideal, utilize um apoio para os pés.",
    },
    {
      id: 3,
      title: "3. Altura do Monitor",
      description:
        "O terceiro passo é ajustar a altura do seu monitor. O ideal é que a parte superior da tela fique na altura dos seus olhos; para isso, ajuste a base para cima ou para baixo. Caso você utilize notebook no seu ambiente de trabalho, recomendamos utilizar uma base para não deixá-lo muito baixo.",
    },
    {
      id: 4,
      title: "4. Distância do Monitor",
      description:
        "O quarto passo é ajustar a distância do seu monitor. O ideal é que ele fique a um braço de distância de você (cerca de 50 a 70 centímetros). Ajuste-o para a frente ou para trás na sua mesa ou mova o suporte articulado para a distância recomendada.",
    },
  ];

  const notebookStep: SetupStep = {
    id: 5,
    title: "Recomendação para Notebook",
    description:
      "Como você utiliza um notebook/laptop para trabalhar, recomendamos utilizar teclado e mouse externos. Também é recomendado utilizar um suporte para apoiar e regular a altura ou conectar a um monitor externo.",
  };

  const poorlyPositionedWebcamStep: SetupStep = {
    id: 6,
    title: "Posicionamento da Webcam",
    description:
      "Você informou que sua webcam não está em frente a você. Isso pode dificultar a análise postural. Se possível, ajuste a posição da sua câmera para que ela fique alinhada diretamente em frente a você.",
  };

  const steps = isWebcamFront
    ? deviceType === "notebook"
      ? [notebookStep, ...baseSteps]
      : baseSteps
    : [poorlyPositionedWebcamStep, ...baseSteps];
  const totalInformativeSteps = steps.length;

  const isFormStep = currentStepIndex === 0;
  const isFinalWebcamStep = currentStepIndex === totalInformativeSteps + 1;

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startWebcam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setHasCameraPermission(true);
        setIsSimulatedMode(false);
      } catch (err) {
        console.warn("Camera access in calibration modal unavailable, using fallback:", err);
        setHasCameraPermission(false);
        setIsSimulatedMode(true);
      }
    }

    if (isOpen && isFinalWebcamStep) {
      startWebcam();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const s = videoRef.current.srcObject as MediaStream;
        s.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, isFinalWebcamStep]);

  useEffect(() => {
    if (!isOpen || !isFinalWebcamStep) return;

    let animationFrameId: number;

    const drawOverlay = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

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

      const now = Date.now() / 1000;
      const headX = w / 2 + Math.sin(now * 0.8) * 8;
      const headY = h * 0.35 + Math.cos(now * 0.5) * 5;
      const neckX = headX;
      const neckY = headY + 45;
      const leftShoulderX = headX - 85;
      const leftShoulderY = neckY + 35;
      const rightShoulderX = headX + 85;
      const rightShoulderY = neckY + 37;

      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(19, 184, 154, 0.85)";
      ctx.moveTo(leftShoulderX, leftShoulderY);
      ctx.lineTo(rightShoulderX, rightShoulderY);
      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(19, 184, 154, 0.85)";
      ctx.moveTo(headX, headY);
      ctx.lineTo(neckX, neckY);
      ctx.stroke();

      const points = [
        { x: headX, y: headY, r: 6, color: "#13b89a" },
        { x: neckX, y: neckY, r: 5, color: "#6366f1" },
        { x: leftShoulderX, y: leftShoulderY, r: 5, color: "#3b82f6" },
        { x: rightShoulderX, y: rightShoulderY, r: 5, color: "#3b82f6" },
      ];

      points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      });

      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(w * 0.2, h * 0.15, w * 0.6, h * 0.7);
      ctx.setLineDash([]);

      animationFrameId = requestAnimationFrame(drawOverlay);
    };

    drawOverlay();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, isFinalWebcamStep]);

  const handleNext = () => {
    if (currentStepIndex <= totalInformativeSteps) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const currentStep = !isFormStep && !isFinalWebcamStep ? steps[currentStepIndex - 1] : null;

  const yesNoOptions = [
    { label: "Sim", value: "sim" },
    { label: "Não", value: "não" },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Calibrar dispositivo"
      maxWidth="3xl"
    >
      <div className="py-2 space-y-4">
        {isFormStep && (
          <div className="h-[490px] flex flex-col justify-between space-y-4 animate-in fade-in duration-200">
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 font-normal shrink-0">
                Para iniciar o processo de calibração, é importante que seu ambiente esteja organizado da maneira correta. Para entendermos melhor suas necessidades, responda a algumas perguntas sobre o seu ambiente de trabalho e dispositivo.
              </p>

              <div className="space-y-4 text-xs overflow-y-auto pr-1 flex-1 min-h-0">
                <div className="space-y-2">
                  <label className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">
                    Qual seu dispositivo?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeviceType("desktop")}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${deviceType === "desktop"
                        ? "bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-900 dark:text-primary-200 ring-2 ring-primary-500/20"
                        : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${deviceType === "desktop"
                          ? "bg-primary-500 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                          }`}
                      >
                        <Monitor size={18} />
                      </div>
                      <div>
                        <div className="font-semibold">Computador de Mesa</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Desktop tradicional
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeviceType("notebook")}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all cursor-pointer text-left ${deviceType === "notebook"
                        ? "bg-primary-50 dark:bg-primary-950/40 border-primary-500 text-primary-900 dark:text-primary-200 ring-2 ring-primary-500/20"
                        : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                    >
                      <div
                        className={`p-2 rounded-lg ${deviceType === "notebook"
                          ? "bg-primary-500 text-white"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                          }`}
                      >
                        <Laptop size={18} />
                      </div>
                      <div>
                        <div className="font-semibold">Notebook / Laptop</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Computador portátil
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {hasWebcam && (
                  <Select
                    label="Sua webcam está posicionada em frente a você?"
                    value={isWebcamFront ? "sim" : "não"}
                    onChange={(e) => setIsWebcamFront(e.target.value === "sim")}
                    options={yesNoOptions}
                  />
                )}

                {deviceType === "notebook" && (
                  <Select
                    label="Você utiliza um teclado externo?"
                    value={hasExternalKeyboard ? "sim" : "não"}
                    onChange={(e) => setHasExternalKeyboard(e.target.value === "sim")}
                    options={yesNoOptions}
                  />
                )}

                {deviceType === "notebook" && (
                  <Select
                    label="Você utiliza um mouse externo?"
                    value={hasExternalMouse ? "sim" : "não"}
                    onChange={(e) => setHasExternalMouse(e.target.value === "sim")}
                    options={yesNoOptions}
                  />
                )}

                <Select
                  label="Sua mesa possui regulagem de altura?"
                  value={adjustableDesk ? "sim" : "não"}
                  onChange={(e) => setAdjustableDesk(e.target.value === "sim")}
                  options={yesNoOptions}
                />

                <Select
                  label="Sua cadeira possui regulagem de altura?"
                  value={adjustableChair ? "sim" : "não"}
                  onChange={(e) => setAdjustableChair(e.target.value === "sim")}
                  options={yesNoOptions}
                />

                <Select
                  label="Seu monitor possui regulagem de altura?"
                  value={adjustableMonitor ? "sim" : "não"}
                  onChange={(e) => setAdjustableMonitor(e.target.value === "sim")}
                  options={yesNoOptions}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <Button variant="secondary" size="md" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" size="md" onClick={handleNext}>
                Próximo
              </Button>
            </div>
          </div>
        )}

        {!isFormStep && !isFinalWebcamStep && currentStep && (
          <div className="min-h-[490px] flex flex-col justify-between space-y-4 animate-in fade-in duration-150">
            <div className="space-y-4 flex-1 flex flex-col">
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 font-normal">
                {currentStep.description}
              </p>

              <div className="w-full flex-1 min-h-[300px] max-h-[350px] bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-300/70 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner">
                {currentStep.imageSrc ? (
                  <img
                    src={currentStep.imageSrc}
                    alt={currentStep.imageAlt || currentStep.title}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2.5 text-slate-400 dark:text-slate-500 p-6 text-center select-none">
                    <div className="p-3.5 rounded-full bg-slate-300/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                      <ImageIcon size={32} />
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Imagem / GIF Informativo ({currentStep.title})
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs">
                      Demonstração visual do ajuste ideal de postura e ergonomia
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 flex flex-col gap-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-center gap-2">
                {Array.from({ length: totalInformativeSteps }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentStepIndex(idx + 1)}
                    className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${currentStepIndex === idx + 1
                      ? "w-6 bg-emerald-500"
                      : "w-2.5 bg-slate-300 hover:bg-slate-400"
                      }`}
                    aria-label={`Ir para passo ${idx + 1}`}
                  />
                ))}
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button variant="secondary" size="md" onClick={handlePrev}>
                  Voltar
                </Button>
                <Button variant="primary" size="md" onClick={handleNext}>
                  Próximo
                </Button>
              </div>
            </div>
          </div>
        )}

        {isFinalWebcamStep && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              Agora que seu ambiente de trabalho está ajustado, vamos calibrar o aplicativo para identificar os pontos anatômicos corretos do seu corpo. Siga as instruções exibidas na tela.
            </p>

            <div className="relative w-full aspect-video min-h-[260px] max-h-[310px] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-md flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 ${isSimulatedMode ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
              />

              {(isSimulatedMode || hasCameraPermission === false) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900 text-slate-400">
                  <div className="p-3 rounded-full bg-slate-800 text-emerald-400 mb-2 animate-pulse">
                    <Sparkles size={28} />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">
                    Sintonizando Feed de Calibração da Câmera
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Sentado de forma ereta, olhe para o centro do monitor para fixar os pontos de referência.
                  </p>
                </div>
              )}

              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
              />
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Métricas de Referência Capturadas:
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                Pescoço: {neckAngle}° | Ombros: {shoulderBalance}%
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="secondary" size="md" onClick={handlePrev}>
                Voltar
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  onCalibrateSubmit();
                  onClose();
                }}
                className="flex items-center gap-1.5"
              >
                <CheckCircle2 size={16} /> Salvar Calibração
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
