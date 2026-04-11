import type { HealthResponse, RunStage, TerraformConfig, TerraformRun } from "./types";

const tokenStorageKey = "kubeguardian-api-token";

export function getApiToken(): string {
  return window.localStorage.getItem(tokenStorageKey) ?? import.meta.env.VITE_API_TOKEN ?? "dev-token";
}

export function setApiToken(token: string): void {
  window.localStorage.setItem(tokenStorageKey, token);
}

function authHeaders(headers?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${getApiToken()}`,
    ...(headers ?? {}),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: authHeaders({
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    }),
    ...init,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function buildRunEventsUrl(runId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  const token = encodeURIComponent(getApiToken());
  return `${protocol}://${host}/api/runs/${runId}/events?token=${token}`;
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
  startPlan: (stage: RunStage) => request<TerraformRun>(`/api/runs/plan/${stage}`, { method: "POST" }),
  startApply: (runId: string) => request<TerraformRun>(`/api/runs/${runId}/apply`, { method: "POST" }),
  cancelRun: (runId: string) => request<TerraformRun>(`/api/runs/${runId}/cancel`, { method: "POST" }),
  getOutputs: () => request<{ outputs: Record<string, unknown> }>("/api/outputs"),
  getHealth: () => request<HealthResponse>("/api/health"),
};
