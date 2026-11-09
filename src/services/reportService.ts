import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ReportData, ReportFilter } from "../types/report";

export const reportService = {
  async getData(filter: ReportFilter): Promise<ReportData> {
    if (!isTauri()) throw new Error("Abra o aplicativo Ergo para consultar os relatórios do seu monitoramento.");
    return invoke<ReportData>("get_report_data", { filter });
  },
};
