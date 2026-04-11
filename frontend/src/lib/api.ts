import type { TerraformConfig, TerraformRun } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getConfig: () => request<TerraformConfig>("/api/config"),
  saveConfig: (config: TerraformConfig) =>
    request<TerraformConfig>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  resetConfig: () => request<TerraformConfig>("/api/config/reset", { method: "POST" }),
  listRuns: () => request<{ items: TerraformRun[] }>("/api/runs"),
  getRun: (runId: string) => request<TerraformRun>(`/api/runs/${runId}`),
  getRunLogs: (runId: string) => request<{ run_id: string; logs: string[] }>(`/api/runs/${runId}/logs`),
  startPlan: () => request<TerraformRun>("/api/runs/plan", { method: "POST" }),
  startApply: (runId: string) => request<TerraformRun>(`/api/runs/${runId}/apply`, { method: "POST" }),
  getOutputs: () => request<{ outputs: Record<string, unknown> }>("/api/outputs"),
  getHealth: () => request<{ status: string; active_run_id?: string | null }>("/api/health"),
};
