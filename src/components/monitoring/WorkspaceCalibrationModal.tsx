import { useState, useEffect, useRef } from "react";
import Modal from "../Modal";
import Button from "../Button";
import Select from "../Select";
import WebcamFeed, { type WebcamFeedProps } from "./WebcamFeed";
import chairHeightGif from "../../assets/calibration/chair-height.gif";
import chairHeightStill from "../../assets/calibration/chair-height-still.png";
import notebookSetupGif from "../../assets/calibration/notebook-setup.gif";
import notebookSetupStill from "../../assets/calibration/notebook-setup-still.png";
import deskHeightGif from "../../assets/calibration/desk-height.gif";
import deskHeightStill from "../../assets/calibration/desk-height-still.png";
import monitorHeightGif from "../../assets/calibration/monitor-height.gif";
import monitorHeightStill from "../../assets/calibration/monitor-height-still.png";
import monitorDistanceGif from "../../assets/calibration/monitor-distance.gif";
import monitorDistanceStill from "../../assets/calibration/monitor-distance-still.png";
import webcamPositionGif from "../../assets/calibration/webcam-position.gif";
import webcamPositionStill from "../../assets/calibration/webcam-position-still.png";
import { workspaceService, type CreateWorkspacePayload } from "../../services/workspaceService";
import { postureService } from "../../services/postureService";
import { validateCalibrationIPD, type IPDCalibrationValidationResult } from "../../services/vision";
import type { PostureCalibrationDTO, SaveCalibrationPayload } from "../../types/postureCalibration";
import {
  CheckCircle2,
  Image as ImageIcon,
  Laptop,
  Monitor,
  Play,
  RotateCcw,
  Timer,
  AlertTriangle,
} from "lucide-react";

export const DEFAULT_REFERENCE_DISTANCE_CM = 60;
export const CALIBRATION_DURATION_SECONDS = 5;

export interface WorkspaceCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrateSubmit: (calibration?: PostureCalibrationDTO | null) => void;
  activeStream?: MediaStream | null;
  isNotebookUser?: boolean;
  onPostureUpdate?: WebcamFeedProps["onPostureUpdate"];
  onPresenceChange?: WebcamFeedProps["onPresenceChange"];
}

export interface SetupStep {
  id: number;
  title: string;
  description: string;
  imageSrc?: string;
  imageStillSrc?: string;
  imageAlt?: string;
}

export interface CalibratedBaseline {
  baselineNeckAngle: number;
  baselineShoulderBalance: number;
  baselineDistanceCm: number;
  baselineEyeDistancePx: number;
}

interface CalibrationSample {
  neckAngle: number;
  shoulderBalance: number;
  distanceCm: number;
  ipdPx: number;
}

export default function WorkspaceCalibrationModal({
  isOpen,
  onClose,
  onCalibrateSubmit,
  onPostureUpdate,
  onPresenceChange,
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
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const [liveMetrics, setLiveMetrics] = useState<{ neckAngle: number; shoulderBalance: number } | null>(null);

  // Estados de Calibração da Postura Neutra (Baseline)
  const [calibrationStatus, setCalibrationStatus] = useState<"idle" | "countdown" | "completed">("idle");
  const [countdownRemaining, setCountdownRemaining] = useState<number>(CALIBRATION_DURATION_SECONDS);
  const [calibratedBaseline, setCalibratedBaseline] = useState<CalibratedBaseline | null>(null);
  const [calibrationError, setCalibrationError] = useState<string | null>(null);
  const [distanceWarning, setDistanceWarning] = useState<IPDCalibrationValidationResult | null>(null);
  const [allowOverrideWarning, setAllowOverrideWarning] = useState<boolean>(false);

  const samplesRef = useRef<CalibrationSample[]>([]);
  const isCalibratingRef = useRef(false);
  const autoSaveOnCompleteRef = useRef(false);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestFrameWidthRef = useRef<number>(1280);

  const latestPostureRef = useRef<{
    neckAngle: number;
    shoulderBalance: number;
    distanceCm: number | null;
  } | null>(null);

  const latestOcularRef = useRef<{
    ipdPx: number | null;
    distanceCm: number | null;
  } | null>(null);

  const baseSteps: SetupStep[] = [
    {
      id: 1,
      title: "1. Ajuste da Cadeira",
      imageSrc: chairHeightGif,
      imageStillSrc: chairHeightStill,
      imageAlt:
        "Ajuste da altura da cadeira: pessoa vista de lado, com os pés apoiados no chão e os joelhos formando um ângulo de 90 graus.",
      description:
        "O primeiro passo para começar a ajustar seu ambiente de trabalho é certificar-se de que sua cadeira está na altura ideal. O esperado é que a altura dela permita que seus pés toquem o chão ou a base de apoio, formando um ângulo de 90 graus nos seus joelhos. Isso fará com que você fique bem apoiado.",
    },
    {
      id: 2,
      title: "2. Altura da Mesa e Cotovelos",
      imageSrc: deskHeightGif,
      imageStillSrc: deskHeightStill,
      imageAlt:
        "Ajuste da mesa ou da cadeira para manter os cotovelos a 90 graus, com apoio para os pés quando a cadeira é elevada.",
      description:
        "O segundo passo é avaliar a altura da mesa. O ideal é que seus cotovelos formem um ângulo de 90 graus. Se possível, ajuste a altura da mesa; caso não consiga, ajuste a altura da cadeira para cima ou para baixo. Se a cadeira ficar alta para atingir a angulação ideal, utilize um apoio para os pés.",
    },
    {
      id: 3,
      title: "3. Altura do Monitor",
      imageSrc: monitorHeightGif,
      imageStillSrc: monitorHeightStill,
      imageAlt:
        "Monitor ou notebook sobre suporte sendo elevado até o topo da tela se alinhar à altura dos olhos.",
      description:
        "O terceiro passo é ajustar a altura do seu monitor. O ideal é que a parte superior da tela fique na altura dos seus olhos; para isso, ajuste a base para cima ou para baixo. Caso você utilize notebook no seu ambiente de trabalho, recomendamos utilizar uma base para não deixá-lo muito baixo.",
    },
    {
      id: 4,
      title: "4. Distância do Monitor",
      imageSrc: monitorDistanceGif,
      imageStillSrc: monitorDistanceStill,
      imageAlt:
        "Monitor afastado sobre a mesa ou aproximado por um suporte articulado até ficar a cerca de um braço de distância, entre 50 e 70 centímetros.",
      description:
        "O quarto passo é ajustar a distância do seu monitor. O ideal é que ele fique a um braço de distância de você (cerca de 50 a 70 centímetros). Ajuste-o para a frente ou para trás na sua mesa ou mova o suporte articulado para a distância recomendada.",
    },
  ];

  const notebookStep: SetupStep = {
    id: 5,
    title: "Recomendação para Notebook",
    imageSrc: notebookSetupGif,
    imageStillSrc: notebookSetupStill,
    imageAlt:
      "Notebook elevado sobre um suporte, com teclado e mouse externos apoiados na mesa.",
    description:
      "Como você utiliza um notebook/laptop para trabalhar, recomendamos utilizar teclado e mouse externos. Também é recomendado utilizar um suporte para apoiar e regular a altura ou conectar a um monitor externo.",
  };

  const poorlyPositionedWebcamStep: SetupStep = {
    id: 6,
    title: "Posicionamento da Webcam",
    imageSrc: webcamPositionGif,
    imageStillSrc: webcamPositionStill,
    imageAlt:
      "Webcam movida da lateral para o centro do monitor, alinhada ao rosto da pessoa, com cabeça e ombros enquadrados na prévia.",
    description:
      "Você informou que sua webcam não está em frente a você. Isso pode dificultar a análise postural. Se possível, ajuste a posição da sua câmera para que ela fique alinhada diretamente em frente a você.",
  };

  const steps = isWebcamFront
    ? deviceType === "notebook"
      ? [notebookStep, ...baseSteps]
      : baseSteps
    : deviceType === "notebook"
      ? [poorlyPositionedWebcamStep, notebookStep, ...baseSteps]
      : [poorlyPositionedWebcamStep, ...baseSteps];

  const totalInformativeSteps = steps.length;

  const isFormStep = currentStepIndex === 0;
  const isFinalWebcamStep = currentStepIndex === totalInformativeSteps + 1;

  const cancelCalibration = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    isCalibratingRef.current = false;
    autoSaveOnCompleteRef.current = false;
    setCalibrationStatus("idle");
    setCalibrationError(null);
    setDistanceWarning(null);
    setAllowOverrideWarning(false);
  };

  const handleSave = async (baselineToPersist?: CalibratedBaseline | null) => {
    if (savingRef.current || isLoadingWorkspace || loadError || !isFinalWebcamStep) return;

    if (distanceWarning && distanceWarning !== "valid" && !allowOverrideWarning) {
      setCalibrationError("Ajuste a distância para a faixa ideal ou confirme que deseja manter assim mesmo.");
      return;
    }

    const baseline = baselineToPersist ?? calibratedBaseline;

    if (!baseline) {
      if (liveMetrics) {
        startCalibration(true);
        return;
      } else {
        setCalibrationError("Aguardando detecção confiável da câmera para calibrar.");
        return;
      }
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    const payload: Required<CreateWorkspacePayload> = {
      deviceType,
      isWebcamFront,
      hasExternalKeyboard,
      hasExternalMouse,
      adjustableDesk,
      adjustableChair,
      adjustableMonitor,
    };

    try {
      const workspace = workspaceId
        ? await workspaceService.update({ id: workspaceId, ...payload })
        : await workspaceService.create(payload);
      setWorkspaceId(workspace.id);

      const calibrationPayload: SaveCalibrationPayload = {
        baselineNeckAngle: baseline.baselineNeckAngle,
        baselineShoulderBalance: baseline.baselineShoulderBalance,
        baselineDistanceCm: baseline.baselineDistanceCm,
        baselineEyeDistancePx: baseline.baselineEyeDistancePx,
        isActive: true,
      };

      const savedCalibration = await postureService.saveCalibration(calibrationPayload);
      onCalibrateSubmit(savedCalibration);
      onClose();
    } catch (error) {
      console.error("Failed to save workspace configuration or posture calibration:", error);
      setSaveError("Não foi possível salvar seu ambiente de trabalho ou a calibração de postura. Tente novamente.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const finishCalibration = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    isCalibratingRef.current = false;
    const samples = samplesRef.current;

    if (samples.length === 0 && latestPostureRef.current) {
      samples.push({
        neckAngle: latestPostureRef.current.neckAngle,
        shoulderBalance: latestPostureRef.current.shoulderBalance,
        distanceCm: latestPostureRef.current.distanceCm ?? DEFAULT_REFERENCE_DISTANCE_CM,
        ipdPx: latestOcularRef.current?.ipdPx ?? 60.0,
      });
    }

    if (samples.length === 0) {
      setCalibrationError(
        "Nenhuma postura estável detectada durante o intervalo. Certifique-se de que a câmera esteja enquadrando seu rosto e ombros."
      );
      setCalibrationStatus("idle");
      autoSaveOnCompleteRef.current = false;
      return;
    }

    const count = samples.length;
    const avgNeck = Number((samples.reduce((acc, s) => acc + s.neckAngle, 0) / count).toFixed(1));
    const avgShoulder = Number((samples.reduce((acc, s) => acc + s.shoulderBalance, 0) / count).toFixed(1));
    const avgDist = Number((samples.reduce((acc, s) => acc + s.distanceCm, 0) / count).toFixed(1));
    const avgIpd = Number((samples.reduce((acc, s) => acc + s.ipdPx, 0) / count).toFixed(1));

    const validation = validateCalibrationIPD(avgIpd, latestFrameWidthRef.current);
    setDistanceWarning(validation);
    setAllowOverrideWarning(false);

    const baseline: CalibratedBaseline = {
      baselineNeckAngle: avgNeck,
      baselineShoulderBalance: avgShoulder,
      baselineDistanceCm: avgDist,
      baselineEyeDistancePx: avgIpd,
    };

    setCalibratedBaseline(baseline);
    setCalibrationStatus("completed");
    setCalibrationError(null);

    if (autoSaveOnCompleteRef.current) {
      autoSaveOnCompleteRef.current = false;
      if (validation === "valid") {
        void handleSave(baseline);
      }
    }
  };

  const startCalibration = (autoSave = false) => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    setCalibrationError(null);
    setDistanceWarning(null);
    setAllowOverrideWarning(false);
    samplesRef.current = [];
    isCalibratingRef.current = true;
    autoSaveOnCompleteRef.current = autoSave;
    setCountdownRemaining(CALIBRATION_DURATION_SECONDS);
    setCalibrationStatus("countdown");

    countdownTimerRef.current = setInterval(() => {
      setCountdownRemaining((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          finishCalibration();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStepIndex(0);
      setLiveMetrics(null);
      cancelCalibration();
      setCalibratedBaseline(null);
      return;
    }

    let cancelled = false;
    setCurrentStepIndex(0);
    setIsLoadingWorkspace(true);
    setLoadError(null);
    setSaveError(null);
    setWorkspaceId(null);
    setLiveMetrics(null);
    cancelCalibration();
    setCalibratedBaseline(null);

    async function loadWorkspace() {
      try {
        const [workspace] = await workspaceService.getAll();
        if (cancelled) return;

        setWorkspaceId(workspace?.id ?? null);
        setDeviceType(workspace?.deviceType ?? "notebook");
        setIsWebcamFront(workspace?.isWebcamFront ?? true);
        setHasExternalKeyboard(workspace?.hasExternalKeyboard ?? true);
        setHasExternalMouse(workspace?.hasExternalMouse ?? true);
        setAdjustableDesk(workspace?.adjustableDesk ?? false);
        setAdjustableChair(workspace?.adjustableChair ?? true);
        setAdjustableMonitor(workspace?.adjustableMonitor ?? true);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load workspace configuration:", error);
        setLoadError("Não foi possível carregar seu ambiente de trabalho. Tente novamente.");
      } finally {
        if (!cancelled) setIsLoadingWorkspace(false);
      }
    }

    void loadWorkspace();
    return () => { cancelled = true; };
  }, [isOpen, loadAttempt]);

  const handleNext = () => {
    if (isLoadingWorkspace || loadError || savingRef.current || isCalibratingRef.current) return;
    if (currentStepIndex <= totalInformativeSteps) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (savingRef.current || isCalibratingRef.current) return;
    cancelCalibration();
    setSaveError(null);
    setCalibrationError(null);
    setLiveMetrics(null);
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleClose = () => {
    if (!savingRef.current && !isCalibratingRef.current) {
      cancelCalibration();
      onClose();
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
      onClose={handleClose}
      title="Calibrar dispositivo"
      maxWidth="3xl"
    >
      <div className="py-2 space-y-4">
        {isLoadingWorkspace && (
          <p role="status" className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Carregando ambiente de trabalho...
          </p>
        )}

        {loadError && (
          <div className="space-y-4 py-4">
            <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
              <Button onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Tentar novamente</Button>
            </div>
          </div>
        )}

        {saveError && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{saveError}</p>
        )}

        {isFormStep && !isLoadingWorkspace && !loadError && (
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
                      onClick={() => {
                        setDeviceType("desktop");
                        setHasExternalKeyboard(true);
                        setHasExternalMouse(true);
                      }}
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
              <Button variant="secondary" size="md" onClick={handleClose}>
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

              <div className={`w-full flex-1 min-h-[300px] max-h-[350px] ${currentStep.imageSrc ? "bg-[#f5faf9]" : "bg-slate-200 dark:bg-slate-800"} rounded-xl border border-slate-300/70 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden group shadow-inner`}>
                {currentStep.imageSrc ? (
                  <picture className="absolute inset-0 block">
                    {currentStep.imageStillSrc && (
                      <source
                        media="(prefers-reduced-motion: reduce)"
                        srcSet={currentStep.imageStillSrc}
                      />
                    )}
                    <img
                      src={currentStep.imageSrc}
                      alt={currentStep.imageAlt || currentStep.title}
                      className="w-full h-full object-contain rounded-xl"
                    />
                  </picture>
                ) : (
                  <div className="flex flex-col items-center gap-2.5 text-slate-400 dark:text-slate-500 p-6 text-center select-none">
                    <div className="p-3.5 rounded-full bg-slate-300/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                      <ImageIcon size={32} />
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Imagem / GIF Informativo ({currentStep.title})
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
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
              Enquadre rosto e ombros e observe os pontos acompanhando seus movimentos. Mantenha a câmera de frente, aproximadamente na altura dos olhos.
            </p>

            <WebcamFeed
              isMonitoring={isOpen}
              onPostureUpdate={(metrics) => {
                const isReliable = metrics.presence === "ACTIVE";
                setLiveMetrics(isReliable ? metrics : null);
                if (isReliable) {
                  latestPostureRef.current = metrics;
                  if (isCalibratingRef.current) {
                    samplesRef.current.push({
                      neckAngle: metrics.neckAngle,
                      shoulderBalance: metrics.shoulderBalance,
                      distanceCm: metrics.distanceCm ?? DEFAULT_REFERENCE_DISTANCE_CM,
                      ipdPx: latestOcularRef.current?.ipdPx ?? 60.0,
                    });
                  }
                } else {
                  latestPostureRef.current = null;
                }
                onPostureUpdate?.(metrics);
              }}
              onPresenceChange={(presence) => {
                if (presence !== "ACTIVE") {
                  setLiveMetrics(null);
                  latestPostureRef.current = null;
                }
                onPresenceChange?.(presence);
              }}
              onOcularUpdate={(ocular) => {
                if (ocular?.frameWidth) {
                  latestFrameWidthRef.current = ocular.frameWidth;
                }
                if (ocular?.available && ocular.ipd) {
                  latestOcularRef.current = {
                    ipdPx: ocular.ipd.distancePx,
                    distanceCm: ocular.distanceCm,
                  };
                } else {
                  latestOcularRef.current = null;
                }
              }}
            />

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 shadow-sm space-y-3">
              {calibrationStatus === "idle" && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        Calibração da Postura
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Mantenha-se na postura ideal a um braço de distância (aproximadamente 60 cm) e inicie a contagem de 5 segundos para registrar seu baseline.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Mantenha-se enquadrado e com ombros nivelados.
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => startCalibration(false)}
                      disabled={!liveMetrics}
                      className="flex items-center gap-1.5"
                    >
                      <Play size={13} className="fill-current" />
                      Iniciar Calibração (5s)
                    </Button>
                  </div>
                </div>
              )}

              {calibrationStatus === "countdown" && (
                <div className="py-2 flex flex-col items-center justify-center space-y-3 text-center animate-in fade-in">
                  <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                    <Timer size={18} className="animate-pulse" />
                    <span className="text-xs font-semibold tracking-wider uppercase">
                      Gravando postura de referência
                    </span>
                  </div>

                  <div className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-950/60 border-2 border-primary-500 shadow-inner">
                    <span className="text-3xl font-extrabold text-primary-600 dark:text-primary-300 animate-in zoom-in-75 duration-200">
                      {countdownRemaining}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Mantenha sua postura ereta e olhe para o centro da tela
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Amostras capturadas: {samplesRef.current.length} leituras
                    </p>
                  </div>

                  <div className="w-full max-w-xs bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-primary-500 h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{
                        width: `${Math.max(5, Math.round(((CALIBRATION_DURATION_SECONDS - countdownRemaining) / CALIBRATION_DURATION_SECONDS) * 100))}%`,
                      }}
                    />
                  </div>

                  <Button variant="secondary" size="sm" onClick={cancelCalibration}>
                    Cancelar
                  </Button>
                </div>
              )}

              {calibrationStatus === "completed" && calibratedBaseline && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <span className="text-sm uppercase font-bold ">
                        Postura Calibrada
                      </span>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => startCalibration(false)}
                      className="flex items-center gap-1 text-xs"
                    >
                      <RotateCcw size={12} />
                      Recalibrar
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Ângulo do Pescoço
                      </div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                        {calibratedBaseline.baselineNeckAngle}°
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Balanceamento dos Ombros
                      </div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                        {calibratedBaseline.baselineShoulderBalance}%
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Distância de Referência
                      </div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                        {calibratedBaseline.baselineDistanceCm} cm
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Distância de Olhos
                      </div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                        {calibratedBaseline.baselineEyeDistancePx} px
                      </div>
                    </div>
                  </div>

                  {distanceWarning === "too-close" && !allowOverrideWarning && (
                    <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 space-y-2.5 animate-in fade-in">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <h5 className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                            Você parece estar muito próximo da tela:
                          </h5>
                          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                            Afaste-se para a distância de mais ou menos 60cm para que os alertas de postura funcionem com precisão.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                        <button
                          type="button"
                          onClick={() => setAllowOverrideWarning(true)}
                          className="text-xs text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100 transition-colors cursor-pointer"
                        >
                          Desejo manter assim mesmo
                        </button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => startCalibration(false)}
                          className="flex items-center gap-1.5 text-xs shadow-sm"
                        >
                          <RotateCcw size={12} />
                          Recalibrar (5s)
                        </Button>
                      </div>
                    </div>
                  )}

                  {distanceWarning === "too-far" && !allowOverrideWarning && (
                    <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 space-y-2.5 animate-in fade-in">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                        <div className="space-y-1">
                          <h5 className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                            Você parece estar muito distante da tela:
                          </h5>
                          <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                            Aproxime-se para a distância de mais ou menos 60cm para que os alertas de postura funcionem com precisão.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                        <button
                          type="button"
                          onClick={() => setAllowOverrideWarning(true)}
                          className="text-xs text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100 transition-colors cursor-pointer"
                        >
                          Desejo manter assim mesmo
                        </button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => startCalibration(false)}
                          className="flex items-center gap-1.5 text-xs shadow-sm"
                        >
                          <RotateCcw size={12} />
                          Recalibrar (5s)
                        </Button>
                      </div>
                    </div>
                  )}

                  {(distanceWarning === "valid" || allowOverrideWarning) && (
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-between gap-3 text-xs text-emerald-800 dark:text-emerald-200 animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-semibold block text-emerald-900 dark:text-emerald-100">
                            Distância Óptica Confirmada:
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-300">
                            {allowOverrideWarning
                              ? "Distância mantida conforme sua preferência manual."
                              : "Referência pupilar calibrada dentro da faixa ideal (60 cm)."}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {calibrationError && (
                <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{calibrationError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handlePrev}
                disabled={isSaving || calibrationStatus === "countdown"}
              >
                Voltar
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => handleSave()}
                isLoading={isSaving}
                disabled={
                  calibrationStatus === "countdown" ||
                  Boolean(distanceWarning && distanceWarning !== "valid" && !allowOverrideWarning)
                }
                className="flex items-center gap-1.5"
              >
                {!isSaving && <CheckCircle2 size={16} />}
                {isSaving ? "Salvando..." : "Salvar Calibração"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
