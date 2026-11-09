import { MetricCard, Panel } from "../components/dashboard/DashboardWidgets";
import { PeriodComparison, ReportChart } from "../components/reports/ReportWidgets";
import { formatPercent, formatScore, type PostureReport } from "../data/reports";

export default function ErgonomicIndex({ report }: { report: PostureReport }) {
  const { summary } = report;
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard title="Score postural médio" value={formatScore(summary.averageScore)} description="Média do score salvo, ponderada pelo número de amostras válidas." />
      <MetricCard title="Resumos adequados" value={formatPercent(summary.adequateSummaryPercentage)} description={`${summary.goodSummaries} de ${summary.validSummaries} resumos válidos com classificação predominante adequada.`} progress={summary.adequateSummaryPercentage ?? undefined} />
      <MetricCard title="Resumos em atenção ou risco" value={summary.warningSummaries + summary.dangerSummaries} description={`${summary.warningSummaries} em atenção e ${summary.dangerSummaries} em risco.`} danger />
    </div>
    <div className="grid items-start gap-5 xl:grid-cols-[2fr_1fr]"><ReportChart report={report} /><PeriodComparison report={report} /></div>
    <Panel title="Como interpretar os indicadores" subtitle="O score e a classificação predominante descrevem aspectos diferentes dos resumos salvos.">
      <div className="space-y-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        <p>O score postural varia de 0 a 100 e usa os desvios de pescoço, alinhamento dos ombros e distância da tela disponíveis durante a coleta. Resumos com mais amostras têm mais peso na média.</p>
        <p>A proporção de resumos adequados conta os resumos cuja classificação predominante foi adequada. Cada resumo válido tem o mesmo peso nessa proporção. A classificação também reflete as medições disponíveis no módulo ocular. Ausência e medição indisponível ficam fora dos dois indicadores.</p>
      </div>
    </Panel>
  </div>;
}
