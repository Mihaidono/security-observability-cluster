export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface SubjectResourceQuota {
  pods?: string;
  requests_cpu?: string;
  requests_memory?: string;
  limits_cpu?: string;
  limits_memory?: string;
}

export interface AnalysisSubject {
  tier?: string;
  description?: string;
  labels?: Record<string, string>;
  resource_quota?: SubjectResourceQuota;
}

export interface ServiceConfig {
  enabled?: boolean;
  type?: string;
  port?: number;
  target_port?: number;
  annotations?: Record<string, string>;
}

export interface IngressConfig {
  enabled?: boolean;
  class_name?: string;
  host?: string;
  path?: string;
  path_type?: string;
  tls_secret_name?: string;
  annotations?: Record<string, string>;
}

export interface ConfigMapConfig {
  enabled?: boolean;
  mount_path?: string;
  data?: Record<string, string>;
}

export interface ProbeConfig {
  enabled?: boolean;
  path?: string;
  port?: number;
  initial_delay_seconds?: number;
  period_seconds?: number;
}

export interface VolumeMountConfig {
  name: string;
  mount_path: string;
  sub_path?: string;
  read_only?: boolean;
}

export interface ResourcesConfig {
  requests_cpu?: string;
  requests_memory?: string;
  limits_cpu?: string;
  limits_memory?: string;
}

export interface ContainerSecurityContext {
  run_as_user?: number;
  run_as_group?: number;
  read_only_root_filesystem?: boolean;
}

export interface ContainerConfig {
  name: string;
  image: string;
  image_pull_policy?: string;
  port?: number;
  command?: string[];
  args?: string[];
  env?: Record<string, string>;
  env_from_secret_names?: string[];
  probes?: {
    readiness?: ProbeConfig;
    liveness?: ProbeConfig;
    startup?: ProbeConfig;
  };
  resources?: ResourcesConfig;
  volume_mounts?: VolumeMountConfig[];
  security_context?: ContainerSecurityContext;
}

export interface VolumeConfig {
  name: string;
  empty_dir?: boolean;
  secret_name?: string;
  config_map_name?: string;
}

export interface NetworkPolicyPort {
  port: number;
  protocol?: string;
}

export interface NetworkPolicyPeer {
  pod_selector?: Record<string, string>;
  namespace_selector?: Record<string, string>;
  ip_block?: {
    cidr?: string;
    except?: string[];
  };
}

export interface NetworkPolicyRule {
  ports?: NetworkPolicyPort[];
  from?: NetworkPolicyPeer[];
  to?: NetworkPolicyPeer[];
}

export interface NetworkPolicyConfig {
  ingress?: NetworkPolicyRule[];
  egress?: NetworkPolicyRule[];
}

export interface WardApplication {
  name: string;
  namespace: string;
  replicas?: number;
  pod_labels?: Record<string, string>;
  pod_annotations?: Record<string, string>;
  automount_service_account_token?: boolean;
  allow_same_namespace_ingress?: boolean;
  service?: ServiceConfig;
  ingress?: IngressConfig;
  config_map?: ConfigMapConfig;
  containers?: ContainerConfig[];
  volumes?: VolumeConfig[];
  network_policy?: NetworkPolicyConfig;
}

export interface TerraformConfig {
  project_name: string;
  environment: string;
  cluster_name: string;
  kubernetes_version: string;
  cluster_log_retention_in_days: number;
  cluster_admin_principal_arns: string[];
  analysis_subjects: Record<string, AnalysisSubject>;
  ward_applications: WardApplication[];
}

export type RunStage = "core" | "platform" | "policies";

export interface PlanSummary {
  create: number;
  update: number;
  delete: number;
  replace: number;
  addresses: string[];
}

export type RunStatus =
  | "queued"
  | "running"
  | "planned"
  | "applying"
  | "applied"
  | "destroying"
  | "destroyed"
  | "canceling"
  | "canceled"
  | "failed";

export interface TerraformRun {
  id: string;
  stage: RunStage;
  kind: "plan" | "apply" | "destroy";
  status: RunStatus;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  command: string[];
  plan_path?: string | null;
  log_path?: string | null;
  error?: string | null;
  plan_summary?: PlanSummary | null;
  outputs?: Record<string, JsonValue> | null;
  source_run_id?: string | null;
  queue_position?: number | null;
}

export interface HealthResponse {
  status: string;
  active_run_id?: string | null;
  worker_running: boolean;
  managed_tfvars_present: boolean;
  queue_depth: number;
  auth_enabled: boolean;
  stages: RunStage[];
}

export interface StateLockInfo {
  id: string;
  path?: string | null;
  operation?: string | null;
  who?: string | null;
  version?: string | null;
  created?: string | null;
  info?: string | null;
}

export interface UnlockStateResponse {
  stage: RunStage;
  unlocked: boolean;
  detail: string;
  lock: StateLockInfo;
  source_run_id?: string | null;
}

export interface RunEventSnapshot {
  type: "run.snapshot";
  run: TerraformRun;
  logs: string[];
}

export interface RunPruneResponse {
  items: TerraformRun[];
  deleted_count: number;
  kept_count: number;
}

export interface RunEventUpdated {
  type: "run.updated";
  run: TerraformRun;
}

export interface RunEventLogs {
  type: "run.logs";
  lines: string[];
}

export type RunEvent = RunEventSnapshot | RunEventUpdated | RunEventLogs;
