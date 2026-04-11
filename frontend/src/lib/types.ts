export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface TerraformConfig {
  project_name: string;
  environment: string;
  cluster_name: string;
  kubernetes_version: string;
  cluster_admin_principal_arns: string[];
  enable_custom_runtime_policies: boolean;
  analysis_subjects: Record<string, Record<string, JsonValue>>;
  ward_applications: Record<string, JsonValue>[];
}

export interface PlanSummary {
  create: number;
  update: number;
  delete: number;
  replace: number;
  addresses: string[];
}

export type RunStatus = "pending" | "running" | "planned" | "applying" | "applied" | "failed";

export interface TerraformRun {
  id: string;
  kind: "plan" | "apply";
  status: RunStatus;
  created_at: string;
  updated_at: string;
  command: string[];
  plan_path?: string | null;
  log_path?: string | null;
  error?: string | null;
  plan_summary?: PlanSummary | null;
  outputs?: Record<string, JsonValue> | null;
}
