import { useState } from "react";
import Header from "../components/Header";
import Button from "../components/Button";
import Modal from "../components/Modal";
import WebcamFeed from "../components/monitoring/WebcamFeed";
import ErgoMetricsCard from "../components/monitoring/ErgoMetricsCard";
import KeyboardMonitorCard from "../components/monitoring/KeyboardMonitorCard";
import PostureHistoryLog, { LogEvent } from "../components/monitoring/PostureHistoryLog";

import {
  Compass,
  Sliders,
  Sparkles,
  UserCheck,
  CheckCircle2,
  Eye,
  Volume2,
  VolumeX,
} from "lucide-react";

export default function Monitoring() {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [neckAngle, setNeckAngle] = useState(12);
  const [shoulderBalance, setShoulderBalance] = useState(96);
  const [distanceCm, setDistanceCm] = useState(62);
  const [postureStatus, setPostureStatus] = useState<"good" | "warning" | "danger">("good");
  const [statusText, setStatusText] = useState("Postura Excelente");

  // Session logs list
  const [logs, setLogs] = useState<LogEvent[]>([
    {
      id: "1",
      timestamp: "11:34:10",
      type: "success",
      message: "Postura calibrada com sucesso",
      detail: "Referência angular definida em 0°",
    },
    {
      id: "2",
      timestamp: "11:29:45",
      type: "warning",
      message: "Atenção: Inclinando pescoço à frente",
      detail: "Ângulo médio de 18° detectado por 2 minutos",
    },
    {
      id: "3",
      timestamp: "11:22:15",
      type: "info",
      message: "Sessão de monitoramento iniciada",
      detail: "Câmera principal ativada",
    },
  ]);

  const handlePostureUpdate = (metrics: {
    neckAngle: number;
    shoulderBalance: number;
    distanceCm: number;
    status: "good" | "warning" | "danger";
    statusLabel: string;
  }) => {
    setNeckAngle(metrics.neckAngle);
    setShoulderBalance(metrics.shoulderBalance);
    setDistanceCm(metrics.distanceCm);
    setPostureStatus(metrics.status);
    setStatusText(metrics.statusLabel);
  };

  const handleCalibrateSubmit = () => {
    setIsCalibrationOpen(false);
    const newLog: LogEvent = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type: "success",
      message: "Nova postura de referência calibrada",
      detail: `Posição atual salva como referência ideal. (Pescoço: ${neckAngle}°, Ombros: ${shoulderBalance}%)`,
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  // Calculate live health score (0 - 100)
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
        (neckAngle > 15 ? (neckAngle - 15) * 2.5 : 0) -
        (100 - shoulderBalance) * 1.5 -
        (distanceCm < 50 ? (50 - distanceCm) * 2 : 0)
      )
    )
  );

  return (
    <div className="w-full h-full flex flex-col gap-6 pb-8">
      <Header
        title="Monitoramento Ao Vivo"
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <WebcamFeed
            isMonitoring={isMonitoring}
            onToggleMonitoring={() => setIsMonitoring(!isMonitoring)}
            onCalibrate={() => setIsCalibrationOpen(true)}
            onPostureUpdate={handlePostureUpdate}
          />

          <KeyboardMonitorCard
            onPauseRequested={() => {
              const newLog: LogEvent = {
                id: Date.now().toString(),
                timestamp: new Date().toLocaleTimeString(),
                type: "info",
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
                <h2 className="text-base font-bold text-white">Resumo da sua ergonômia</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${healthScore >= 85
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : healthScore >= 70
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                >
                  {healthScore >= 85 ? "Excelente" : healthScore >= 70 ? "Atenção" : "Crítico"}
                </span>
              </div>
            </div>
            <div className="flex">
              <p className="text-xs text-slate-300 mt-1 sm:pr-6">
                {healthScore >= 85
                  ? "Sua coluna e pescoço estão alinhados dentro das diretrizes ideais."
                  : "Ajuste sua inclinação do pescoço ou altura da tela para melhorar sua postura."}
              </p>

              <div className="flex items-center gap-6 text-xs text-slate-300 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-700/60 pt-3 sm:pt-0 sm:pl-6 w-full sm:w-auto justify-between sm:justify-start">
                <div className="flex flex-col">
                  <span className="text-slate-400">Status Geral:</span>
                  <span className="font-semibold text-emerald-400">{statusText}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400">Sessão:</span>
                  <span className="font-semibold text-white">42 min monitorados</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ErgoMetricsCard
              title="Inclinação do Pescoço"
              value={neckAngle}
              unit="°"
              status={neckAngle < 16 ? "good" : neckAngle < 23 ? "warning" : "danger"}
              icon={Compass}
              progress={Math.min(100, (neckAngle / 30) * 100)}
              idealRange="< 15°"
              trend={neckAngle < 16 ? "improving" : "worsening"}
              description="Ângulo de projeção da cabeça para a frente."
              details={[
                { label: "Projeção:", value: neckAngle < 16 ? "Neutra" : "Inclinada" },
                { label: "Limite Alerta:", value: "20°" },
              ]}
            />

            <ErgoMetricsCard
              title="Alinhamento Ombros"
              value={shoulderBalance}
              unit="%"
              status={shoulderBalance > 90 ? "good" : shoulderBalance > 80 ? "warning" : "danger"}
              icon={Sliders}
              progress={shoulderBalance}
              idealRange="> 95%"
              trend={shoulderBalance > 90 ? "stable" : "worsening"}
              description="Nivelamento horizontal entre ombro esquerdo e direito."
              details={[
                { label: "Desvio Y:", value: `${(100 - shoulderBalance) * 0.15}°` },
                { label: "Balanço:", value: shoulderBalance > 90 ? "Simétrico" : "Inclinado" },
              ]}
            />

            <ErgoMetricsCard
              title="Distância da Tela"
              value={distanceCm}
              unit="cm"
              status={distanceCm >= 50 && distanceCm <= 75 ? "good" : "warning"}
              icon={Eye}
              progress={Math.min(100, (distanceCm / 80) * 100)}
              idealRange="50 - 70 cm"
              trend="stable"
              description="Distância aproximada entre seus olhos e o monitor."
              details={[
                { label: "Recomendado:", value: "50-70 cm" },
                { label: "Fadiga Visual:", value: distanceCm < 50 ? "Alta" : "Baixa" },
              ]}
            />

            <ErgoMetricsCard
              title="Postura da Coluna"
              value={postureStatus === "good" ? "Ereta" : "Curvada"}
              status={postureStatus}
              icon={UserCheck}
              progress={postureStatus === "good" ? 92 : 60}
              idealRange="Neutra"
              trend={postureStatus === "good" ? "improving" : "worsening"}
              description="Alinhamento vertical do tronco e postura espinhal."
              details={[
                { label: "Curvatura:", value: postureStatus === "good" ? "Normal" : "Acentuada" },
                { label: "Suporte:", value: "Cadeira Reclinada" },
              ]}
            />
          </div>

          <PostureHistoryLog
            logs={logs}
            onClearLogs={() => setLogs([])}
          />
        </div>
      </div>

      <Modal
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        title="Calibrar Postura de Referência"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="secondary"
              onClick={() => setIsCalibrationOpen(false)}
            >
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCalibrateSubmit}>
              <CheckCircle2 size={16} /> Salvar Calibração
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sente-se de forma ergonômica, ereta e olhe para o centro da tela para definir a postura ideal benchmark.
          </p>
          <div className="p-4 rounded-xl bg-primary-50 dark:bg-primary-950/40 border border-primary-100 dark:border-primary-900/50 flex items-start gap-3">
            <Sparkles className="text-primary-500 shrink-0 mt-0.5" size={20} />
            <div className="text-xs text-slate-700 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-white mb-1">
                Instruções de Calibração Ergonômica:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                <li>Mantenha a cabeça ereta com os olhos na altura do terço superior da tela.</li>
                <li>Mantenha os ombros relaxados e na mesma linha horizontal.</li>
                <li>Certifique-se de que a iluminação do ambiente esteja adequada para a câmera.</li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-xs flex justify-between">
            <span className="text-slate-500">Ângulo Atual Capturado:</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Pescoço: {neckAngle}° | Ombros: {shoulderBalance}%
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
