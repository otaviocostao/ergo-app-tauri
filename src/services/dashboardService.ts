import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DashboardData, DashboardFilter } from "../types/dashboard";

export const dashboardService = {
  async getData(filter: DashboardFilter): Promise<DashboardData> {
    if (!isTauri()) throw new Error("Abra o aplicativo Ergo para consultar seu histórico local.");
    return invoke<DashboardData>("get_dashboard_data", { filter });
  },
};
