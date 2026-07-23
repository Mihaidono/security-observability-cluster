import type {
  AuthConfigResponse,
  AuthExchangeRequest,
  HealthResponse,
  LogoutResponse,
  RunPruneResponse,
  RunStage,
  SessionResponse,
  TerraformConfig,
  TerraformRun,
  UnlockStateResponse,
} from "./types";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(
  /\/$/,
  "",
);

function getApiBaseUrl(): string {
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (window.location.port === "5173") {
    return `${window.location.protocol}//${window.location.host}`;
  }

  return window.location.origin;
}

function parseErrorPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) {
    return "Request failed.";
  }

  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
    // Fall through to text cleanup below.
  }

  return trimmed;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(
      parseErrorPayload(payload) ||
        `Request failed with status ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

export function buildRunEventsUrl(runId: string): string {
  const apiBaseUrl = new URL(getApiBaseUrl());
  const protocol = apiBaseUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${apiBaseUrl.host}/api/runs/${runId}/events`;
}

export const api = {
  getAuthConfig: () => request<AuthConfigResponse>("/api/auth/config"),
  getSession: () => request<SessionResponse>("/api/auth/session"),
  exchangeAuthCode: (payload: AuthExchangeRequest) =>
    request<SessionResponse>("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<LogoutResponse>("/api/auth/logout", {
      method: "POST",
    }),
  getConfig: () => request<TerraformConfig>("/api/config"),
  saveConfig: (config: TerraformConfig) =>
    request<TerraformConfig>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    }),
  resetConfig: () =>
    request<TerraformConfig>("/api/config/reset", { method: "POST" }),
  listRuns: () => request<{ items: TerraformRun[] }>("/api/runs"),
  getRun: (runId: string) => request<TerraformRun>(`/api/runs/${runId}`),
  getRunLogs: (runId: string) =>
    request<{ run_id: string; logs: string[] }>(`/api/runs/${runId}/logs`),
  startPlan: (stage: RunStage) =>
    request<TerraformRun>(`/api/runs/plan/${stage}`, { method: "POST" }),
  startApply: (runId: string) =>
    request<TerraformRun>(`/api/runs/${runId}/apply`, { method: "POST" }),
  startDestroy: (stage: RunStage) =>
    request<TerraformRun>(`/api/runs/destroy/${stage}`, { method: "POST" }),
  unlockState: (stage: RunStage) =>
    request<UnlockStateResponse>(`/api/state/unlock/${stage}`, {
      method: "POST",
    }),
  cancelRun: (runId: string) =>
    request<TerraformRun>(`/api/runs/${runId}/cancel`, { method: "POST" }),
  pruneRuns: (keep: number) =>
    request<RunPruneResponse>(
      `/api/runs/prune?keep=${encodeURIComponent(String(keep))}`,
      { method: "POST" },
    ),
  getOutputs: () =>
    request<{ outputs: Record<string, unknown> }>("/api/outputs"),
  getHealth: () => request<HealthResponse>("/api/health"),
};
