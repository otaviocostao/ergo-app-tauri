import { MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { formatDuration, formatMinutes, type PostureReport } from "../data/reports";

export default function TypingReport({ report }: { report: PostureReport }) {
  const summary = report.summary.typing;
  if (!summary.summaries) return <Panel title="Sem resumos de digitação" subtitle="Os dados aparecem após o monitoramento salvar resumos de digitação."><p className="text-sm text-slate-500 dark:text-slate-400">A coleta depende do módulo de digitação estar habilitado durante a sessão.</p></Panel>;
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const cards = [
    ["Teclas registradas", number(summary.keystrokes), "Quantidade de acionamentos salva nos resumos."],
    ["Cadência média", `${number(summary.averageCpm)} CPM`, "Média das cadências, ponderada pela duração de cada resumo."],
    ["Maior cadência", `${number(summary.peakCpm)} CPM`, "Maior pico de cadência registrado no período."],
    ["Tempo com digitação", formatDuration(summary.activeSeconds), "Soma dos segundos em que houve acionamento de teclas."],
    ["Micropausas de digitação", number(summary.microPauses), "Pequenos intervalos sem teclas identificados nos resumos."],
    ["Maior sequência contínua", summary.longestContinuousMinutes === null ? "—" : formatMinutes(summary.longestContinuousMinutes), "Maior contador de minutos contínuos salvo no período."],
  ];
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([title, value, description]) => <MetricCard key={title} title={title} value={value} description={description} />)}</div>
    <Panel title="Leituras de digitação" subtitle={`${summary.summaries} resumos salvos, abrangendo ${formatDuration(summary.windowSeconds)} de observação.`}>
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">CPM representa acionamentos de teclas por minuto. O cálculo respeita a duração de cada resumo, incluindo janelas parciais. As micropausas representam intervalos detectados na atividade do teclado. A maior sequência contínua é o contador observado nos resumos, que pode ter começado antes do período selecionado.</p>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Continuidade da digitação: {summary.warningSummaries} resumos em atenção e {summary.dangerSummaries} em risco.</p>
    </Panel>
  </div>;
}
