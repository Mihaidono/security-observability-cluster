import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { api, buildObservabilityLaunchUrl, buildRunEventsUrl, getApiToken } from "./lib/api";
import type {
  AnalysisSubject,
  ContainerConfig,
  IngressConfig,
  ObservabilityLinksResponse,
  NetworkPolicyPeer,
  NetworkPolicyPort,
  NetworkPolicyRule,
  ProbeConfig,
  RunStage,
  TerraformConfig,
  TerraformRun,
  VolumeConfig,
  VolumeMountConfig,
  WardApplication,
} from "./lib/types";

type Direction = "ingress" | "egress";
type AppTab = "overview" | "assets" | "activity" | "settings";
type DemoScenarioId = "public-python-api" | "internal-python-api" | "static-site";

type AppReview = {
  errors: string[];
  warnings: string[];
  hints: string[];
  resources: string[];
  secretDependencies: string[];
};

function kubeSafeName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

  return normalized.slice(0, 63) || "app";
}

function defaultProbeSet(port: number, path: string) {
  return {
    readiness: {
      ...emptyProbe(),
      enabled: true,
      path,
      port,
      initial_delay_seconds: 5,
      period_seconds: 10,
    },
    liveness: {
      ...emptyProbe(),
      enabled: true,
      path,
      port,
      initial_delay_seconds: 15,
      period_seconds: 20,
    },
    startup: {
      ...emptyProbe(),
      enabled: false,
      path,
      port,
      initial_delay_seconds: 5,
      period_seconds: 10,
    },
  };
}

function pythonApiSource(mode: "public" | "internal"): string {
  return [
    "from fastapi import FastAPI, Request",
    "from fastapi.responses import JSONResponse",
    "",
    "import os",
    "import socket",
    "import urllib.error",
    "import urllib.request",
    "",
    'app = FastAPI(title=os.getenv("APP_DISPLAY_NAME", "Isolens Demo API"))',
    "",
    "",
    '@app.get("/health")',
    "def health():",
    "    return {",
    '        "status": "ok",',
    '        "scenario": os.getenv("SCENARIO_NAME", "demo"),',
    '        "hostname": socket.gethostname(),',
    "    }",
    "",
    "",
    '@app.get("/")',
    "def root():",
    "    return {",
    '        "message": "Isolens demo workload is live",',
    '        "scenario": os.getenv("SCENARIO_NAME", "demo"),',
    '        "profile": os.getenv("SCENARIO_PROFILE", "baseline"),',
    "    }",
    "",
    "",
    '@app.get("/headers")',
    "def headers(request: Request):",
    "    selected_headers = {}",
    '    for key, value in request.headers.items():',
    '        if key.lower() in {"host", "user-agent", "x-forwarded-for", "x-forwarded-proto"}:',
    "            selected_headers[key] = value",
    "    return {",
    '        "scenario": os.getenv("SCENARIO_NAME", "demo"),',
    '        "headers": selected_headers,',
    "    }",
    "",
    "",
    '@app.get("/egress-check")',
    'def egress_check(url: str = os.getenv("DEMO_EGRESS_URL", "https://example.com")):',
    "    try:",
    "        with urllib.request.urlopen(url, timeout=5) as response:",
    "            return {",
    '                "ok": True,',
    '                "target": url,',
    '                "status": response.status,',
    '                "scenario": os.getenv("SCENARIO_NAME", "demo"),',
    "            }",
    "    except (urllib.error.URLError, TimeoutError, ValueError) as exc:",
    "        return JSONResponse(",
    "            status_code=502,",
    "            content={",
    '                "ok": False,',
    '                "target": url,',
    '                "scenario": os.getenv("SCENARIO_NAME", "demo"),',
    '                "error": str(exc),',
    "            },",
    "        )",
    "",
    "",
    `# Scenario mode: ${mode}`,
  ].join("\n");
}

function staticSiteHtml(appName: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    `    <title>${appName}</title>`,
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    "    <style>",
    "      body { font-family: 'Space Grotesk', system-ui, sans-serif; padding: 3rem; background: #f3f0f8; color: #383f51; }",
    "      .shell { max-width: 720px; margin: 0 auto; padding: 2rem; border-radius: 28px; background: rgba(255,255,255,0.82); box-shadow: 0 24px 80px rgba(56, 63, 81, 0.14); }",
    "      code { font-family: 'IBM Plex Mono', monospace; }",
    "    </style>",
    "  </head>",
    "  <body>",
    '    <div class="shell">',
    `      <h1>${appName}</h1>`,
    "      <p>This app is managed through the Isolens interface and is designed to be safe to deploy as a first cluster workload.</p>",
    "      <p>Use it when you want a quick ingress and service sanity check before moving to a more dynamic workload.</p>",
    "      <p><code>/</code> should return this page through the service and ingress path.</p>",
    "    </div>",
    "  </body>",
    "</html>",
  ].join("\n");
}

function makePublicPythonApiApp(namespace: string): WardApplication {
  return {
    name: "public-python-api",
    namespace,
    replicas: 2,
    pod_labels: {
      app_role: "api",
      scenario: "public",
      expose_class: "web",
    },
    service: {
      enabled: true,
      type: "ClusterIP",
      port: 80,
      target_port: 80,
      annotations: {},
    },
    ingress: {
      enabled: true,
      class_name: "nginx",
      host: "public-python-api.lab.internal",
      path: "/",
      path_type: "Prefix",
      annotations: {
        "nginx.ingress.kubernetes.io/ssl-redirect": "false",
      },
    },
    config_map: {
      enabled: true,
      mount_path: "/app",
      data: {
        "main.py": pythonApiSource("public"),
      },
    },
    containers: [
      {
        name: "api",
        image: "tiangolo/uvicorn-gunicorn-fastapi:python3.11-slim",
        image_pull_policy: "IfNotPresent",
        port: 80,
        env: {
          APP_DISPLAY_NAME: "Public Python API",
          SCENARIO_NAME: "public-python-api",
          SCENARIO_PROFILE: "internet-egress",
          DEMO_EGRESS_URL: "https://example.com",
        },
        env_from_secret_names: [],
        probes: defaultProbeSet(80, "/health"),
        resources: {
          requests_cpu: "150m",
          requests_memory: "192Mi",
          limits_cpu: "500m",
          limits_memory: "256Mi",
        },
        volume_mounts: [],
        security_context: {
          run_as_user: 101,
          run_as_group: 101,
          read_only_root_filesystem: false,
        },
      },
    ],
    volumes: [],
    network_policy: {
      ingress: [
        {
          ports: [{ port: 80, protocol: "TCP" }],
          from: [
            {
              namespace_selector: {
                "kubernetes.io/metadata.name": "ingress-nginx",
              },
            },
            {
              namespace_selector: {
                "kubernetes.io/metadata.name": "monitoring-zone",
              },
            },
          ],
        },
      ],
      egress: [
        {
          ports: [{ port: 443, protocol: "TCP" }],
          to: [{ ip_block: { cidr: "0.0.0.0/0" } }],
        },
      ],
    },
  };
}

function makeInternalPythonApiApp(namespace: string): WardApplication {
  return {
    name: "internal-python-api",
    namespace,
    replicas: 1,
    pod_labels: {
      app_role: "api",
      scenario: "internal",
      expose_class: "cluster",
    },
    service: {
      enabled: true,
      type: "ClusterIP",
      port: 80,
      target_port: 80,
      annotations: {},
    },
    ingress: {
      enabled: false,
      class_name: "nginx",
      host: "",
      path: "/",
      path_type: "Prefix",
      annotations: {},
    },
    config_map: {
      enabled: true,
      mount_path: "/app",
      data: {
        "main.py": pythonApiSource("internal"),
      },
    },
    containers: [
      {
        name: "api",
        image: "tiangolo/uvicorn-gunicorn-fastapi:python3.11-slim",
        image_pull_policy: "IfNotPresent",
        port: 80,
        env: {
          APP_DISPLAY_NAME: "Internal Python API",
          SCENARIO_NAME: "internal-python-api",
          SCENARIO_PROFILE: "restricted",
          DEMO_EGRESS_URL: "https://example.com",
        },
        env_from_secret_names: [],
        probes: defaultProbeSet(80, "/health"),
        resources: {
          requests_cpu: "100m",
          requests_memory: "160Mi",
          limits_cpu: "400m",
          limits_memory: "256Mi",
        },
        volume_mounts: [],
        security_context: {
          run_as_user: 101,
          run_as_group: 101,
          read_only_root_filesystem: false,
        },
      },
    ],
    volumes: [],
    network_policy: {
      ingress: [
        {
          ports: [{ port: 80, protocol: "TCP" }],
          from: [
            {
              namespace_selector: {
                "kubernetes.io/metadata.name": "monitoring-zone",
              },
            },
          ],
        },
      ],
      egress: [],
    },
  };
}

function makeStaticSiteApp(namespace: string): WardApplication {
  return {
    name: "static-site-probe",
    namespace,
    replicas: 1,
    pod_labels: {
      app_role: "web",
      scenario: "static",
      expose_class: "web",
    },
    service: {
      enabled: true,
      type: "ClusterIP",
      port: 8080,
      target_port: 8080,
      annotations: {},
    },
    ingress: {
      enabled: true,
      class_name: "nginx",
      host: "static-site-probe.lab.internal",
      path: "/",
      path_type: "Prefix",
      annotations: {
        "nginx.ingress.kubernetes.io/ssl-redirect": "false",
      },
    },
    config_map: {
      enabled: true,
      mount_path: "/usr/share/nginx/html",
      data: {
        "index.html": staticSiteHtml("static-site-probe"),
      },
    },
    containers: [
      {
        name: "web",
        image: "nginxinc/nginx-unprivileged:1.27-alpine",
        image_pull_policy: "IfNotPresent",
        port: 8080,
        env: {
          APP_DISPLAY_NAME: "Static Site Probe",
        },
        env_from_secret_names: [],
        probes: defaultProbeSet(8080, "/"),
        resources: {
          requests_cpu: "100m",
          requests_memory: "128Mi",
          limits_cpu: "300m",
          limits_memory: "192Mi",
        },
        volume_mounts: [],
        security_context: {
          run_as_user: 101,
          run_as_group: 101,
          read_only_root_filesystem: false,
        },
      },
    ],
    volumes: [],
    network_policy: {
      ingress: [
        {
          ports: [{ port: 8080, protocol: "TCP" }],
          from: [
            {
              namespace_selector: {
                "kubernetes.io/metadata.name": "ingress-nginx",
              },
            },
            {
              namespace_selector: {
                "kubernetes.io/metadata.name": "monitoring-zone",
              },
            },
          ],
        },
      ],
      egress: [],
    },
  };
}

function emptySubject(): AnalysisSubject {
  return {
    tier: "template",
    description: "",
    labels: {},
    resource_quota: {
      pods: "10",
      requests_cpu: "2",
      requests_memory: "4Gi",
      limits_cpu: "4",
      limits_memory: "8Gi",
    },
  };
}

function emptyProbe(): ProbeConfig {
  return {
    enabled: false,
    path: "/",
    port: 8080,
    initial_delay_seconds: 5,
    period_seconds: 10,
  };
}

function emptyContainer(): ContainerConfig {
  return {
    name: "app",
    image: "nginxinc/nginx-unprivileged:1.27-alpine",
    image_pull_policy: "IfNotPresent",
    port: 8080,
    command: [],
    args: [],
    env: {},
    env_from_secret_names: [],
    probes: {
      readiness: emptyProbe(),
      liveness: emptyProbe(),
      startup: emptyProbe(),
    },
    resources: {
      requests_cpu: "100m",
      requests_memory: "128Mi",
      limits_cpu: "500m",
      limits_memory: "256Mi",
    },
    volume_mounts: [],
    security_context: {
      run_as_user: 101,
      run_as_group: 101,
      read_only_root_filesystem: false,
    },
  };
}

function emptyVolume(): VolumeConfig {
  return {
    name: "shared-data",
    empty_dir: true,
  };
}

function emptyPolicyPort(): NetworkPolicyPort {
  return {
    port: 8080,
    protocol: "TCP",
  };
}

function emptyPolicyPeer(): NetworkPolicyPeer {
  return {
    pod_selector: {},
    namespace_selector: {},
  };
}

function emptyPolicyRule(direction: Direction): NetworkPolicyRule {
  return {
    ports: [emptyPolicyPort()],
    [direction === "ingress" ? "from" : "to"]: [emptyPolicyPeer()],
  };
}

function emptyAppTemplate(namespace: string): WardApplication {
  return {
    name: "new-template-app",
    namespace,
    replicas: 1,
    pod_labels: {
      app_role: "api",
    },
    pod_annotations: {},
    automount_service_account_token: false,
    allow_same_namespace_ingress: true,
    service: {
      enabled: true,
      type: "ClusterIP",
      port: 8080,
      target_port: 8080,
      annotations: {},
    },
    ingress: {
      enabled: false,
      class_name: "nginx",
      host: "",
      path: "/",
      path_type: "Prefix",
      annotations: {},
    },
    config_map: {
      enabled: false,
      mount_path: "/usr/share/nginx/html",
      data: {},
    },
    containers: [emptyContainer()],
    volumes: [],
    network_policy: {
      ingress: [],
      egress: [],
    },
  };
}

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function prettyPrint(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatTerraformOutputValue(entry: unknown) {
  if (
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    ("value" in entry || "sensitive" in entry || "type" in entry)
  ) {
    const record = entry as { value?: unknown; sensitive?: unknown; type?: unknown };
    return {
      value: record.value,
      sensitive: Boolean(record.sensitive),
      type: record.type,
      wrapped: true,
    };
  }

  return {
    value: entry,
    sensitive: false,
    type: undefined,
    wrapped: false,
  };
}

function normalizeTerraformOutputs(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function hasTerraformOutputs(value: Record<string, unknown> | null): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

type ParsedLogLine = {
  kind: "plain" | "structured";
  message: string;
  detail?: string;
  level?: string;
  timestamp?: string;
  source?: string;
  address?: string;
};

type GroupedRunLogEntry =
  | {
      kind: "plain";
      startLineNumber: number;
      endLineNumber: number;
      message: string;
    }
  | {
      kind: "structured";
      startLineNumber: number;
      endLineNumber: number;
      entry: ParsedLogLine;
    };

function parseLogLine(line: string): ParsedLogLine {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    if (!parsed || Array.isArray(parsed)) {
      return { kind: "plain", message: line };
    }

    const diagnostic = typeof parsed.diagnostic === "object" && parsed.diagnostic ? (parsed.diagnostic as Record<string, unknown>) : null;
    const snippet = typeof diagnostic?.snippet === "object" && diagnostic.snippet ? (diagnostic.snippet as Record<string, unknown>) : null;
    const message =
      (typeof diagnostic?.summary === "string" && diagnostic.summary) ||
      (typeof parsed["@message"] === "string" && parsed["@message"]) ||
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.summary === "string" && parsed.summary) ||
      (typeof parsed.type === "string" && parsed.type) ||
      line;

    const detail =
      (typeof diagnostic?.detail === "string" && diagnostic.detail) ||
      (typeof parsed.detail === "string" && parsed.detail) ||
      undefined;

    const level =
      (typeof parsed["@level"] === "string" && parsed["@level"]) ||
      (typeof parsed.level === "string" && parsed.level) ||
      undefined;

    const timestamp =
      (typeof parsed["@timestamp"] === "string" && parsed["@timestamp"]) ||
      (typeof parsed.timestamp === "string" && parsed.timestamp) ||
      (typeof parsed.time === "string" && parsed.time) ||
      undefined;

    const source =
      (typeof snippet?.context === "string" && snippet.context) ||
      (typeof parsed.type === "string" && parsed.type) ||
      (typeof parsed.hook === "string" && parsed.hook) ||
      undefined;

    const address =
      (typeof diagnostic?.address === "string" && diagnostic.address) ||
      undefined;

    return {
      kind: "structured",
      message,
      detail,
      level,
      timestamp,
      source,
      address,
    };
  } catch {
    return { kind: "plain", message: line };
  }
}

function parseRunErrorText(errorText: string): ParsedLogLine[] {
  return errorText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => {
      if (!line.trim()) {
        return false;
      }
      if (line === "Recent Terraform output:") {
        return false;
      }
      if (index === 0 && line.includes(" failed with exit code ")) {
        return false;
      }
      return true;
    })
    .map((line) => parseLogLine(line));
}

function normalizeRunLogLines(lines: string[]): string[] {
  const normalized: string[] = [];
  let previousBlank = false;

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const isBlank = line.trim() === "";
    if (isBlank) {
      if (!previousBlank) {
        previousBlank = true;
      }
      return;
    }
    previousBlank = false;
    normalized.push(line);
  });

  return normalized;
}

function isPlainLogContinuationLine(line: string): boolean {
  return /^\s/.test(line) || /^[│╵╷]/.test(line);
}

function groupRunLogLines(lines: string[]): GroupedRunLogEntry[] {
  const grouped: GroupedRunLogEntry[] = [];
  let currentPlainLines: string[] = [];
  let currentPlainStartIndex = 0;

  function flushPlainGroup() {
    if (currentPlainLines.length === 0) {
      return;
    }

    grouped.push({
      kind: "plain",
      startLineNumber: currentPlainStartIndex + 1,
      endLineNumber: currentPlainStartIndex + currentPlainLines.length,
      message: currentPlainLines.join("\n"),
    });
    currentPlainLines = [];
  }

  lines.forEach((line, index) => {
    const parsed = parseLogLine(line);
    if (parsed.kind === "structured") {
      flushPlainGroup();
      grouped.push({
        kind: "structured",
        startLineNumber: index + 1,
        endLineNumber: index + 1,
        entry: parsed,
      });
      return;
    }

    if (currentPlainLines.length === 0) {
      currentPlainStartIndex = index;
      currentPlainLines = [line];
      return;
    }

    if (isPlainLogContinuationLine(line)) {
      currentPlainLines.push(line);
      return;
    }

    flushPlainGroup();
    currentPlainStartIndex = index;
    currentPlainLines = [line];
  });

  flushPlainGroup();
  return grouped;
}

function formatRunErrorText(errorText: string): string {
  return parseRunErrorText(errorText)
    .map((entry) => [entry.message, entry.detail].filter(Boolean).join("\n"))
    .filter((entry) => entry.trim() !== "")
    .join("\n\n");
}

function logLevelTone(level?: string): string {
  const normalized = level?.toLowerCase();
  if (normalized === "error" || normalized === "fatal") return "border-warning/40 bg-warning/16 text-foreground";
  if (normalized === "warn" || normalized === "warning") return "border-[#ab9f9d]/60 bg-[#ab9f9d]/20 text-foreground";
  if (normalized === "debug" || normalized === "trace") return "border-border/70 bg-card/70 text-foreground/80";
  return "border-accent/30 bg-accent/12 text-accent";
}

function sortRuns(runs: TerraformRun[]): TerraformRun[] {
  return [...runs].sort((left, right) => right.created_at.localeCompare(left.created_at));
}

function uniqueName(base: string, existing: string[]): string {
  let index = 1;
  let candidate = base;
  while (existing.includes(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function compactRecord(value?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([key, entryValue]) => key.trim() !== "" || String(entryValue).trim() !== ""),
  );
}

function primaryContainer(app: WardApplication | null | undefined): ContainerConfig | null {
  return app?.containers?.[0] ?? null;
}

function appSecretDependencies(app: WardApplication | null | undefined): string[] {
  if (!app) return [];

  const secretRefs = new Set<string>();

  for (const container of app.containers ?? []) {
    for (const secretName of container.env_from_secret_names ?? []) {
      if (secretName.trim()) {
        secretRefs.add(secretName.trim());
      }
    }
  }

  for (const volume of app.volumes ?? []) {
    if (volume.secret_name?.trim()) {
      secretRefs.add(volume.secret_name.trim());
    }
  }

  if (app.ingress?.tls_secret_name?.trim()) {
    secretRefs.add(app.ingress.tls_secret_name.trim());
  }

  return [...secretRefs];
}

function hasIngressNamespaceAccess(app: WardApplication | null | undefined): boolean {
  if (!app?.ingress?.enabled) return true;

  return (app.network_policy?.ingress ?? []).some((rule) =>
    (rule.from ?? []).some(
      (peer) => peer.namespace_selector?.["kubernetes.io/metadata.name"] === "ingress-nginx",
    ),
  );
}

function buildAppReview(app: WardApplication | null | undefined, subjectNames: string[]): AppReview {
  if (!app) {
    return {
      errors: [],
      warnings: [],
      hints: [],
      resources: [],
      secretDependencies: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const hints: string[] = [];
  const resources: string[] = [];
  const secretDependencies = appSecretDependencies(app);

  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(app.name)) {
    errors.push("Application name must be a valid Kubernetes name using lowercase letters, numbers, and hyphens.");
  }

  if (!subjectNames.includes(app.namespace)) {
    errors.push("Application namespace must point to an existing ward.");
  }

  if ((app.containers ?? []).length === 0) {
    errors.push("At least one container is required.");
  }

  const firstContainer = primaryContainer(app);
  if (firstContainer) {
    if (!firstContainer.image?.trim()) {
      errors.push("Primary container image is required.");
    }

    if (!firstContainer.port) {
      errors.push("Primary container port is required.");
    }

    if ((firstContainer.probes?.readiness?.enabled || firstContainer.probes?.liveness?.enabled) && !firstContainer.probes?.readiness?.path) {
      warnings.push("Health probes are enabled, but the readiness path is empty.");
    }

    if ((firstContainer.env_from_secret_names ?? []).length > 0) {
      warnings.push("Secret env sources are referenced here, but the interface does not create those secrets for you.");
    }
  }

  if (app.service?.enabled !== false) {
    resources.push("Service");
    if (!app.service?.port || !app.service?.target_port) {
      errors.push("Service-backed apps need both a service port and a target port.");
    }
  }

  if (app.ingress?.enabled) {
    resources.push("Ingress");
    if (app.service?.enabled === false) {
      errors.push("Ingress needs the service to stay enabled.");
    }
    if (!app.ingress.host?.trim()) {
      errors.push("Ingress is enabled, but the host is empty.");
    }
    if (!app.ingress.class_name?.trim()) {
      errors.push("Ingress is enabled, but the ingress class is empty.");
    }
    if (!hasIngressNamespaceAccess(app)) {
      warnings.push("Ingress is enabled, but the app-level network policy does not appear to allow traffic from the ingress-nginx namespace.");
    }
  }

  if (app.config_map?.enabled) {
    resources.push("ConfigMap");
    if (!app.config_map.mount_path?.trim()) {
      errors.push("ConfigMap is enabled, but the mount path is empty.");
    }
    if (Object.keys(app.config_map.data ?? {}).length === 0) {
      errors.push("ConfigMap is enabled, but no files are defined.");
    }
  }

  if ((app.network_policy?.ingress ?? []).length > 0 || (app.network_policy?.egress ?? []).length > 0) {
    resources.push("Network policies");
  }

  const volumeNames = new Set((app.volumes ?? []).map((volume) => volume.name));
  for (const container of app.containers ?? []) {
    for (const mount of container.volume_mounts ?? []) {
      if (!volumeNames.has(mount.name)) {
        errors.push(`Container "${container.name}" mounts volume "${mount.name}", but that volume is not defined.`);
      }
      if (!mount.mount_path?.trim()) {
        errors.push(`Container "${container.name}" has a volume mount without a mount path.`);
      }
    }
  }

  if (secretDependencies.length > 0) {
    warnings.push("This app depends on existing Kubernetes secrets. Make sure they already exist before you deploy.");
  }

  if ((app.containers ?? []).length > 1) {
    hints.push("Only the first container automatically gets the generated ConfigMap mount from the simple builder path.");
  }

  if (app.service?.enabled !== false && app.allow_same_namespace_ingress === false) {
    warnings.push("Same-namespace ingress is disabled, so service reachability will rely entirely on your explicit network policy rules.");
  }

  if (errors.length === 0 && warnings.length === 0) {
    hints.push("This app looks deployable from the interface without extra manual cluster objects.");
  }

  return {
    errors,
    warnings,
    hints,
    resources,
    secretDependencies,
  };
}

function displayImageName(image?: string): string {
  if (!image) return "Not configured";
  const parts = image.split("/");
  return parts[parts.length - 1] || image;
}

function displayExposureSummary(app: WardApplication | null | undefined): string {
  if (!app) return "Not configured";
  if (app.ingress?.enabled) {
    return app.ingress.host?.trim() || "Ingress enabled";
  }
  return "Cluster-internal";
}

function KeyValueEditor({
  label,
  value,
  onChange,
  addLabel = "Add row",
}: {
  label: string;
  value?: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
}) {
  const entries = Object.entries(value ?? {});

  function updateRow(index: number, nextKey: string, nextValue: string) {
    const rows = entries.map(([key, currentValue], rowIndex) =>
      rowIndex === index ? [nextKey, nextValue] : [key, currentValue],
    );
    onChange(Object.fromEntries(rows.filter(([key, currentValue]) => key.trim() !== "" || currentValue.trim() !== "")));
  }

  function addRow() {
    const nextKey = uniqueName("key", entries.map(([key]) => key));
    onChange({
      ...(value ?? {}),
      [nextKey]: "",
    });
  }

  function removeRow(index: number) {
    const rows = entries.filter((_, rowIndex) => rowIndex !== index);
    onChange(Object.fromEntries(rows));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={addRow}>
          {addLabel}
        </Button>
      </div>
      {entries.length === 0 ? <p className="text-sm text-neutral-500">No entries.</p> : null}
      <div className="grid gap-2">
        {entries.map(([entryKey, entryValue], index) => (
          <div key={`${entryKey}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input value={entryKey} onChange={(event) => updateRow(index, event.target.value, entryValue)} placeholder="Key" />
            <Input value={entryValue} onChange={(event) => updateRow(index, entryKey, event.target.value)} placeholder="Value" />
            <Button variant="danger" type="button" onClick={() => removeRow(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StringListEditor({
  label,
  value,
  onChange,
  addLabel = "Add item",
}: {
  label: string;
  value?: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
}) {
  const items = value ?? [];

  function updateItem(index: number, nextValue: string) {
    const next = items.map((item, itemIndex) => (itemIndex === index ? nextValue : item));
    onChange(next.filter((item) => item.trim() !== ""));
  }

  function addItem() {
    onChange([...items, ""]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={addItem}>
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-neutral-500">No entries.</p> : null}
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
            <Input value={item} onChange={(event) => updateItem(index, event.target.value)} />
            <Button variant="danger" type="button" onClick={() => removeItem(index)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProbeEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: ProbeConfig;
  onChange: (next: ProbeConfig) => void;
}) {
  const probe = value ?? emptyProbe();

  return (
    <div className="rounded-2xl border border-border bg-muted/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{label}</p>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={probe.enabled ?? false}
            onChange={(event) => onChange({ ...probe, enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Path</span>
          <Input value={probe.path ?? ""} onChange={(event) => onChange({ ...probe, path: event.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Port</span>
          <Input
            type="number"
            value={String(probe.port ?? 8080)}
            onChange={(event) => onChange({ ...probe, port: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Initial delay</span>
          <Input
            type="number"
            value={String(probe.initial_delay_seconds ?? 5)}
            onChange={(event) => onChange({ ...probe, initial_delay_seconds: Number(event.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Period</span>
          <Input
            type="number"
            value={String(probe.period_seconds ?? 10)}
            onChange={(event) => onChange({ ...probe, period_seconds: Number(event.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

function VolumeMountEditor({
  value,
  onChange,
}: {
  value?: VolumeMountConfig[];
  onChange: (next: VolumeMountConfig[]) => void;
}) {
  const mounts = value ?? [];

  function updateMount(index: number, next: VolumeMountConfig) {
    onChange(mounts.map((mount, mountIndex) => (mountIndex === index ? next : mount)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Volume mounts</p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...mounts, { name: "shared-data", mount_path: "/data" }])}
        >
          Add mount
        </Button>
      </div>
      {mounts.length === 0 ? <p className="text-sm text-neutral-500">No mounts.</p> : null}
      <div className="grid gap-2">
        {mounts.map((mount, index) => (
          <div key={`${mount.name}-${index}`} className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3">
            <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_160px_auto]">
            <Input value={mount.name} onChange={(event) => updateMount(index, { ...mount, name: event.target.value })} placeholder="Volume name" />
            <Input
              value={mount.mount_path}
              onChange={(event) => updateMount(index, { ...mount, mount_path: event.target.value })}
              placeholder="/mount/path"
            />
              <Input
                value={mount.sub_path ?? ""}
                onChange={(event) => updateMount(index, { ...mount, sub_path: event.target.value || undefined })}
                placeholder="subPath (optional)"
              />
              <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={mount.read_only ?? true}
                  onChange={(event) => updateMount(index, { ...mount, read_only: event.target.checked })}
                />
                Read only
              </label>
            <Button variant="danger" type="button" onClick={() => onChange(mounts.filter((_, mountIndex) => mountIndex !== index))}>
              Remove
            </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkPortsEditor({
  value,
  onChange,
}: {
  value?: NetworkPolicyPort[];
  onChange: (next: NetworkPolicyPort[]) => void;
}) {
  const ports = value ?? [];

  function updatePort(index: number, next: NetworkPolicyPort) {
    onChange(ports.map((port, portIndex) => (portIndex === index ? next : port)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">Ports</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...ports, emptyPolicyPort()])}>
          Add port
        </Button>
      </div>
      {ports.length === 0 ? <p className="text-sm text-neutral-500">No ports.</p> : null}
      <div className="grid gap-2">
        {ports.map((port, index) => (
          <div key={`${port.port}-${index}`} className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_160px_auto]">
            <Input
              type="number"
              value={String(port.port)}
              onChange={(event) => updatePort(index, { ...port, port: Number(event.target.value) })}
            />
            <Input value={port.protocol ?? "TCP"} onChange={(event) => updatePort(index, { ...port, protocol: event.target.value })} />
            <Button variant="danger" type="button" onClick={() => onChange(ports.filter((_, portIndex) => portIndex !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkPeersEditor({
  direction,
  value,
  onChange,
}: {
  direction: Direction;
  value?: NetworkPolicyPeer[];
  onChange: (next: NetworkPolicyPeer[]) => void;
}) {
  const peers = value ?? [];

  function updatePeer(index: number, next: NetworkPolicyPeer) {
    onChange(peers.map((peer, peerIndex) => (peerIndex === index ? next : peer)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {direction === "ingress" ? "Sources" : "Destinations"}
        </p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...peers, emptyPolicyPeer()])}>
          Add peer
        </Button>
      </div>
      {peers.length === 0 ? <p className="text-sm text-neutral-500">No peers.</p> : null}
      <div className="grid gap-3">
        {peers.map((peer, index) => (
          <div key={index} className="rounded-2xl border border-border bg-muted/60 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Peer {index + 1}</p>
              <Button variant="danger" type="button" onClick={() => onChange(peers.filter((_, peerIndex) => peerIndex !== index))}>
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <KeyValueEditor
                label="Pod selector"
                value={peer.pod_selector ?? {}}
                onChange={(next) => updatePeer(index, { ...peer, pod_selector: compactRecord(next) })}
                addLabel="Add label"
              />
              <KeyValueEditor
                label="Namespace selector"
                value={peer.namespace_selector ?? {}}
                onChange={(next) => updatePeer(index, { ...peer, namespace_selector: compactRecord(next) })}
                addLabel="Add label"
              />
              <label className="grid gap-1 text-sm">
                <span>IP block CIDR</span>
                <Input
                  value={peer.ip_block?.cidr ?? ""}
                  placeholder="0.0.0.0/0"
                  onChange={(event) =>
                    updatePeer(index, {
                      ...peer,
                      ip_block: event.target.value.trim() === "" ? undefined : { cidr: event.target.value },
                    })
                  }
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NetworkRulesEditor({
  direction,
  value,
  onChange,
}: {
  direction: Direction;
  value?: NetworkPolicyRule[];
  onChange: (next: NetworkPolicyRule[]) => void;
}) {
  const rules = value ?? [];

  function updateRule(index: number, next: NetworkPolicyRule) {
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? next : rule)));
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">{direction === "ingress" ? "Ingress rules" : "Egress rules"}</p>
        <Button variant="ghost" type="button" className="px-3 py-1.5 text-xs" onClick={() => onChange([...rules, emptyPolicyRule(direction)])}>
          Add rule
        </Button>
      </div>
      {rules.length === 0 ? <p className="text-sm text-neutral-500">No rules.</p> : null}
      <div className="grid gap-4">
        {rules.map((rule, index) => (
          <div key={index} className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Rule {index + 1}</p>
              <Button variant="danger" type="button" onClick={() => onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))}>
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <NetworkPortsEditor
                value={rule.ports}
                onChange={(ports) => updateRule(index, { ...rule, ports })}
              />
              <NetworkPeersEditor
                direction={direction}
                value={direction === "ingress" ? rule.from : rule.to}
                onChange={(peers) =>
                  updateRule(index, {
                    ...rule,
                    [direction === "ingress" ? "from" : "to"]: peers,
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContainerEditor({
  container,
  onChange,
  onRemove,
  index,
}: {
  container: ContainerConfig;
  onChange: (next: ContainerConfig) => void;
  onRemove: () => void;
  index: number;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Container {index + 1}</p>
          <p className="text-sm text-neutral-500">{container.name}</p>
        </div>
        <Button variant="danger" type="button" onClick={onRemove}>
          Remove
        </Button>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-3 xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Name</span>
            <Input value={container.name} onChange={(event) => onChange({ ...container, name: event.target.value })} />
          </label>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span>Image</span>
            <Input value={container.image} onChange={(event) => onChange({ ...container, image: event.target.value })} />
          </label>
        </div>

        <div className="grid gap-3 2xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Port</span>
            <Input
              type="number"
              value={String(container.port ?? 8080)}
              onChange={(event) => onChange({ ...container, port: Number(event.target.value) })}
            />
          </label>
          <StringListEditor label="Command" value={container.command} onChange={(command) => onChange({ ...container, command })} addLabel="Add command" />
          <StringListEditor label="Args" value={container.args} onChange={(args) => onChange({ ...container, args })} addLabel="Add arg" />
        </div>

        <KeyValueEditor
          label="Environment variables"
          value={container.env ?? {}}
          onChange={(env) => onChange({ ...container, env: compactRecord(env) })}
          addLabel="Add env"
        />

        <StringListEditor
          label="Secret env sources"
          value={container.env_from_secret_names}
          onChange={(env_from_secret_names) => onChange({ ...container, env_from_secret_names })}
          addLabel="Add secret"
        />

        <div className="grid gap-4 2xl:grid-cols-3">
          <ProbeEditor
            label="Readiness probe"
            value={container.probes?.readiness}
            onChange={(readiness) =>
              onChange({
                ...container,
                probes: { ...container.probes, readiness },
              })
            }
          />
          <ProbeEditor
            label="Liveness probe"
            value={container.probes?.liveness}
            onChange={(liveness) =>
              onChange({
                ...container,
                probes: { ...container.probes, liveness },
              })
            }
          />
          <ProbeEditor
            label="Startup probe"
            value={container.probes?.startup}
            onChange={(startup) =>
              onChange({
                ...container,
                probes: { ...container.probes, startup },
              })
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <label className="grid gap-1 text-sm">
            <span>Image pull policy</span>
            <Input
              value={container.image_pull_policy ?? "IfNotPresent"}
              onChange={(event) => onChange({ ...container, image_pull_policy: event.target.value })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPU request</span>
            <Input
              value={container.resources?.requests_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, requests_cpu: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Memory request</span>
            <Input
              value={container.resources?.requests_memory ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, requests_memory: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPU limit</span>
            <Input
              value={container.resources?.limits_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, limits_cpu: event.target.value },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Memory limit</span>
            <Input
              value={container.resources?.limits_memory ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: { ...container.resources, limits_memory: event.target.value },
                })
              }
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Run as user</span>
            <Input
              type="number"
              value={String(container.security_context?.run_as_user ?? 101)}
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    run_as_user: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Run as group</span>
            <Input
              type="number"
              value={String(container.security_context?.run_as_group ?? 101)}
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    run_as_group: Number(event.target.value),
                  },
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={container.security_context?.read_only_root_filesystem ?? false}
              onChange={(event) =>
                onChange({
                  ...container,
                  security_context: {
                    ...container.security_context,
                    read_only_root_filesystem: event.target.checked,
                  },
                })
              }
            />
            Read-only root filesystem
          </label>
        </div>

        <VolumeMountEditor
          value={container.volume_mounts}
          onChange={(volume_mounts) => onChange({ ...container, volume_mounts })}
        />
      </div>
    </div>
  );
}

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#383f51]/48 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function statusTone(status?: TerraformRun["status"]): "primary" | "secondary" | "ghost" | "danger" {
  if (status === "planned" || status === "applied" || status === "destroyed") return "primary";
  if (status === "failed" || status === "canceled") return "danger";
  if (status === "running" || status === "applying" || status === "destroying" || status === "canceling") return "secondary";
  return "ghost";
}

function stageLabel(stage: RunStage): string {
  if (stage === "core") return "Core";
  if (stage === "platform") return "Platform";
  return "Policies";
}

function isTerminalRunStatus(status?: TerraformRun["status"]): boolean {
  return status === "planned" || status === "applied" || status === "destroyed" || status === "failed" || status === "canceled";
}

function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-2 text-sm text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function ReviewItems({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "error" | "warning" | "hint";
  items: string[];
}) {
  if (items.length === 0) return null;

  const toneClass =
    tone === "error"
      ? "border-warning/35 bg-warning/10 text-warning"
      : tone === "warning"
        ? "border-[#ab9f9d]/55 bg-[#ab9f9d]/14 text-foreground"
        : "border-accent/25 bg-accent/10 text-foreground";

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.22em]">{title}</p>
      <div className="mt-3 space-y-2 text-sm leading-6">
        {items.map((item, index) => (
          <p key={`${tone}-${index}`}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function ScenarioTile({
  title,
  description,
  tag,
  actionLabel = "Apply to selected application",
  onApply,
}: {
  title: string;
  description: string;
  tag: string;
  actionLabel?: string;
  onApply: () => void;
}) {
  return (
    <div className="flex min-h-[232px] min-w-[280px] max-w-[280px] shrink-0 snap-start flex-col justify-between rounded-[1.5rem] border border-border/80 bg-card/80 p-4">
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-2 inline-flex rounded-full border border-border/75 bg-muted/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          {tag}
        </p>
        <p className="mt-3 text-sm leading-6 text-neutral-500">{description}</p>
      </div>
      <Button className="mt-5 self-start" variant="secondary" type="button" onClick={onApply}>
        {actionLabel}
      </Button>
    </div>
  );
}

function EditorSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border p-4">
      <button
        type="button"
        className="w-full rounded-[1.4rem] bg-muted/55 px-4 py-4 text-left transition hover:bg-muted/75"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            <p className="mt-2 text-sm leading-6 text-neutral-500">{summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:justify-self-end">
            <Badge>Advanced</Badge>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card/80 text-lg leading-none text-foreground/70">
              {isOpen ? "−" : "+"}
            </span>
          </div>
        </div>
      </button>
      {isOpen ? <div className="mt-5 grid gap-4">{children}</div> : null}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">{label}</p>
      <p className="mt-3 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function StageAction({
  disabledReason,
  children,
}: {
  disabledReason?: string;
  children: ReactNode;
}) {
  if (!disabledReason) {
    return <>{children}</>;
  }

  return (
    <div className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-0 z-20 hidden w-56 rounded-[0.95rem] border border-[#ab9f9d]/40 bg-[#383f51] px-3 py-2 text-left text-xs leading-5 text-[#f6f4fb] shadow-[0_16px_40px_rgba(56,63,81,0.22)] group-hover:block">
        {disabledReason}
      </div>
    </div>
  );
}

function formatRunTimestamp(value: string | null | undefined) {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export default function App() {
  const [config, setConfig] = useState<TerraformConfig | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("overview");
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [runs, setRuns] = useState<TerraformRun[]>([]);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("");
  const [selectedAppIndex, setSelectedAppIndex] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<TerraformRun | null>(null);
  const [selectedRunLogs, setSelectedRunLogs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [observabilityLinks, setObservabilityLinks] = useState<ObservabilityLinksResponse | null>(null);
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [armedDestroyStage, setArmedDestroyStage] = useState<RunStage | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showCopiedLogsHint, setShowCopiedLogsHint] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const selectedRunStatusRef = useRef<TerraformRun["status"] | undefined>(undefined);
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const logsViewportRef = useRef<HTMLDivElement | null>(null);
  const copiedLogsHintTimerRef = useRef<number | null>(null);

  const subjectKeys = useMemo(() => Object.keys(config?.analysis_subjects ?? {}), [config?.analysis_subjects]);
  const selectedSubject = useMemo(() => {
    if (!config || !selectedSubjectKey) return null;
    return config.analysis_subjects[selectedSubjectKey] ?? null;
  }, [config, selectedSubjectKey]);
  const appsForSelectedSubject = useMemo(
    () =>
      (config?.ward_applications ?? [])
        .map((application, index) => ({ application, index }))
        .filter(({ application }) => application.namespace === selectedSubjectKey),
    [config?.ward_applications, selectedSubjectKey],
  );
  const selectedApp = useMemo(() => {
    if (!config) return null;

    const current = config.ward_applications[selectedAppIndex] ?? null;
    if (current && current.namespace === selectedSubjectKey) {
      return current;
    }

    return appsForSelectedSubject[0]?.application ?? null;
  }, [appsForSelectedSubject, config, selectedAppIndex, selectedSubjectKey]);
  const selectedAppPrimaryContainer = useMemo(() => primaryContainer(selectedApp), [selectedApp]);
  const selectedAppReview = useMemo(() => buildAppReview(selectedApp, subjectKeys), [selectedApp, subjectKeys]);
  const selectedAppPrimaryConfigFile = useMemo<[string, string]>(() => {
    const entries = Object.entries(selectedApp?.config_map?.data ?? {});
    return entries[0] ?? ["main.py", ""];
  }, [selectedApp?.config_map?.data]);
  const latestCoreRun = useMemo(() => runs.find((run) => run.stage === "core") ?? null, [runs]);
  const latestPlatformRun = useMemo(() => runs.find((run) => run.stage === "platform") ?? null, [runs]);
  const latestPoliciesRun = useMemo(() => runs.find((run) => run.stage === "policies") ?? null, [runs]);
  const hasAppliedCoreRun = useMemo(
    () => runs.some((run) => run.stage === "core" && run.kind === "apply" && run.status === "applied"),
    [runs],
  );
  const hasAppliedPlatformRun = useMemo(
    () => runs.some((run) => run.stage === "platform" && run.kind === "apply" && run.status === "applied"),
    [runs],
  );
  const hasAdminAccess = useMemo(
    () => (config?.cluster_admin_principal_arns ?? []).some((arn) => arn.trim() !== ""),
    [config?.cluster_admin_principal_arns],
  );
  const sourcePlanRun = useMemo(() => {
    if (!selectedRun?.source_run_id) return null;
    return runs.find((run) => run.id === selectedRun.source_run_id) ?? null;
  }, [runs, selectedRun?.source_run_id]);
  const displayedPlanSummary = useMemo(() => {
    if (!selectedRun) return null;
    if (selectedRun.kind === "destroy") {
      return null;
    }
    if (selectedRun.kind === "plan") {
      return selectedRun.plan_summary ?? null;
    }
    return sourcePlanRun?.plan_summary ?? null;
  }, [selectedRun, sourcePlanRun]);
  const planSummaryLabel = selectedRun?.kind === "apply" ? "Plan behind this apply" : "Planned changes";
  const apiTokenValue = getApiToken();
  const totalAppsWithIngress = useMemo(
    () => config?.ward_applications.filter((application) => application.ingress?.enabled).length ?? 0,
    [config?.ward_applications],
  );
  const totalAppsWithService = useMemo(
    () => config?.ward_applications.filter((application) => application.service?.enabled !== false).length ?? 0,
    [config?.ward_applications],
  );
  const totalContainers = useMemo(
    () => config?.ward_applications.reduce((count, application) => count + (application.containers?.length ?? 0), 0) ?? 0,
    [config?.ward_applications],
  );
  const groupedSelectedRunLogs = useMemo(() => groupRunLogLines(selectedRunLogs), [selectedRunLogs]);
  const configuredAdminArnsCount = useMemo(
    () => config?.cluster_admin_principal_arns.filter((arn) => arn.trim() !== "").length ?? 0,
    [config?.cluster_admin_principal_arns],
  );
  const adminAccessDisabledReason = !hasAdminAccess
    ? "Add at least one IAM principal ARN in Settings -> Admin Access before running this action."
    : undefined;
  const platformLockedReason = !hasAppliedCoreRun ? "Apply core first to unlock the platform stage." : undefined;
  const policiesLockedReason = !hasAppliedPlatformRun ? "Apply platform first to unlock the policies stage." : undefined;
  const coreActionDisabledReason = adminAccessDisabledReason;
  const platformActionDisabledReason = adminAccessDisabledReason ?? platformLockedReason;
  const policiesActionDisabledReason = adminAccessDisabledReason ?? policiesLockedReason;

  useEffect(() => {
    selectedRunStatusRef.current = selectedRun?.status;
  }, [selectedRun?.status]);

  useEffect(() => {
    if (!armedDestroyStage) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-destroy-arm]")) {
        return;
      }
      setArmedDestroyStage(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setArmedDestroyStage(null);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [armedDestroyStage]);

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    return () => {
      if (copiedLogsHintTimerRef.current !== null) {
        window.clearTimeout(copiedLogsHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;

    let isClosed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    async function hydrateSelectedRun() {
      try {
        const [runResponse, logsResponse] = await Promise.all([api.getRun(selectedRunId), api.getRunLogs(selectedRunId)]);
        if (isClosed) return;
        setRunInState(runResponse);
        setSelectedRun(runResponse);
        setSelectedRunLogs(normalizeRunLogLines(logsResponse.logs));
        setOutputs(normalizeTerraformOutputs(runResponse.outputs));
      } catch {
        if (!isClosed) {
          setErrorMessage("Unable to refresh run details.");
        }
      }
    }

    function connectToRunStream() {
      if (isClosed) return;

      socket = new WebSocket(buildRunEventsUrl(selectedRunId));
      socket.onopen = () => {
        if (!isClosed) {
          setStatusMessage("Live run stream connected.");
          setErrorMessage("");
        }
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as
          | { type: "run.snapshot"; run: TerraformRun; logs: string[] }
          | { type: "run.updated"; run: TerraformRun }
          | { type: "run.logs"; lines: string[] };

        if (payload.type === "run.snapshot") {
          setRunInState(payload.run);
          setSelectedRun(payload.run);
          setSelectedRunLogs(normalizeRunLogLines(payload.logs));
          setOutputs(normalizeTerraformOutputs(payload.run.outputs));
        }

        if (payload.type === "run.updated") {
          setRunInState(payload.run);
          setSelectedRun(payload.run);
          setOutputs(normalizeTerraformOutputs(payload.run.outputs));
        }

        if (payload.type === "run.logs") {
          setSelectedRunLogs((current) => normalizeRunLogLines([...current, ...payload.lines]));
        }
      };

      socket.onerror = () => {
        if (!isClosed) {
          setStatusMessage("Live run stream interrupted.");
        }
      };

      socket.onclose = () => {
        if (isClosed) return;
        if (isTerminalRunStatus(selectedRunStatusRef.current)) return;
        setStatusMessage("Reconnecting to live run stream...");
        reconnectTimer = window.setTimeout(() => {
          void hydrateSelectedRun();
          connectToRunStream();
        }, 1500);
      };
    }

    void hydrateSelectedRun();
    connectToRunStream();

    return () => {
      isClosed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [selectedRunId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSubjectModalOpen(false);
        setIsAppModalOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const hasOpenModal = isSubjectModalOpen || isAppModalOpen;
    if (!hasOpenModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isSubjectModalOpen, isAppModalOpen]);

  useEffect(() => {
    workspaceScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    if (!autoScrollLogs) return;
    const viewport = logsViewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [selectedRunLogs, autoScrollLogs]);

  useEffect(() => {
    if (!config || !selectedSubjectKey) return;

    const current = config.ward_applications[selectedAppIndex] ?? null;
    if (current && current.namespace === selectedSubjectKey) {
      return;
    }

    const firstMatchingAppIndex = config.ward_applications.findIndex((application) => application.namespace === selectedSubjectKey);
    if (firstMatchingAppIndex >= 0 && firstMatchingAppIndex !== selectedAppIndex) {
      setSelectedAppIndex(firstMatchingAppIndex);
    }
  }, [config, selectedAppIndex, selectedSubjectKey]);

  async function loadInitial() {
    try {
      const [loadedConfig, runResponse, health, links] = await Promise.all([
        api.getConfig(),
        api.listRuns(),
        api.getHealth(),
        api.getObservabilityLinks(),
      ]);
      setConfig(loadedConfig);
      setRuns(sortRuns(runResponse.items));
      setObservabilityLinks(links);
      const firstSubjectKey = Object.keys(loadedConfig.analysis_subjects)[0] ?? "";
      const firstAppIndex = loadedConfig.ward_applications.findIndex((application) => application.namespace === firstSubjectKey);
      setSelectedSubjectKey(firstSubjectKey);
      setSelectedAppIndex(firstAppIndex >= 0 ? firstAppIndex : 0);
      setStatusMessage(
        health.worker_running
          ? `Ready. Queue depth ${health.queue_depth}.`
          : `Backend worker is down. Queue depth ${health.queue_depth}. Restart the backend before launching runs.`,
      );

      if (runResponse.items[0]) {
        setSelectedRunId(runResponse.items[0].id);
        setSelectedRun(runResponse.items[0]);
      } else {
        await refreshOutputs();
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  function openHubbleUi() {
    window.open(buildObservabilityLaunchUrl("hubble-ui"), "_blank", "noopener,noreferrer");
  }

  async function refreshOutputs() {
    try {
      const response = await api.getOutputs();
      setOutputs(normalizeTerraformOutputs(response.outputs));
    } catch {
      setOutputs(null);
    }
  }

  function setRunInState(run: TerraformRun) {
    setRuns((current) => {
      const withoutCurrent = current.filter((item) => item.id !== run.id);
      return sortRuns([run, ...withoutCurrent]);
    });
  }

  function updateConfig(mutator: (current: TerraformConfig) => TerraformConfig) {
    setConfig((current) => (current ? mutator(current) : current));
  }

  function updateSelectedSubject(mutator: (current: AnalysisSubject) => AnalysisSubject) {
    if (!selectedSubjectKey) return;
    updateConfig((current) => ({
      ...current,
      analysis_subjects: {
        ...current.analysis_subjects,
        [selectedSubjectKey]: mutator(current.analysis_subjects[selectedSubjectKey] ?? emptySubject()),
      },
    }));
  }

  function updateSelectedApp(mutator: (current: WardApplication) => WardApplication) {
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications[selectedAppIndex] = mutator(next.ward_applications[selectedAppIndex] ?? emptyAppTemplate(selectedSubjectKey || "ward-template-app"));
      return next;
    });
  }

  function updateSelectedPrimaryContainer(mutator: (current: ContainerConfig) => ContainerConfig) {
    updateSelectedApp((current) => {
      const containers = [...(current.containers ?? [emptyContainer()])];
      containers[0] = mutator(containers[0] ?? emptyContainer());
      return {
        ...current,
        containers,
      };
    });
  }

  function updateSelectedPrimaryConfigFile(nextName: string, nextContent: string) {
    updateSelectedApp((current) => {
      const entries = Object.entries(current.config_map?.data ?? {});
      const [, existingContent] = entries[0] ?? ["main.py", ""];
      const remainder = Object.fromEntries(entries.slice(1));
      const primaryName = nextName.trim() || "main.py";

      return {
        ...current,
        config_map: {
          ...current.config_map,
          enabled: true,
          data: {
            [primaryName]: nextContent ?? existingContent,
            ...remainder,
          },
        },
      };
    });
  }

  function renameSubject(currentKey: string, nextKey: string) {
    const trimmed = nextKey.trim();
    if (!config || trimmed === "" || trimmed === currentKey || config.analysis_subjects[trimmed]) {
      return;
    }

    updateConfig((current) => {
      const next = structuredClone(current);
      const subject = next.analysis_subjects[currentKey];
      delete next.analysis_subjects[currentKey];
      next.analysis_subjects[trimmed] = subject;
      next.ward_applications = next.ward_applications.map((application) =>
        application.namespace === currentKey ? { ...application, namespace: trimmed } : application,
      );
      return next;
    });
    setSelectedSubjectKey(trimmed);
  }

  function addSubject() {
    if (!config) return;
    const nextKey = uniqueName("ward-new-subject", subjectKeys);
    updateConfig((current) => ({
      ...current,
      analysis_subjects: {
        ...current.analysis_subjects,
        [nextKey]: emptySubject(),
      },
    }));
    setSelectedSubjectKey(nextKey);
  }

  function removeSelectedSubject() {
    if (!config || subjectKeys.length <= 1 || !selectedSubjectKey) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      delete next.analysis_subjects[selectedSubjectKey];
      next.ward_applications = next.ward_applications.filter((application) => application.namespace !== selectedSubjectKey);
      if (next.ward_applications.length === 0) {
        const fallbackNamespace = Object.keys(next.analysis_subjects)[0] ?? "ward-template-app";
        const fallbackApp = makeInternalPythonApiApp(fallbackNamespace);
        fallbackApp.name = kubeSafeName(uniqueName(fallbackApp.name, next.ward_applications.map((application) => application.name)));
        next.ward_applications.push(fallbackApp);
      }
      return next;
    });
    const remainingKeys = subjectKeys.filter((key) => key !== selectedSubjectKey);
    setSelectedSubjectKey(remainingKeys[0] ?? "");
    setSelectedAppIndex(0);
  }

  function selectSubject(subjectKey: string) {
    setSelectedSubjectKey(subjectKey);
    const firstAppIndex = config?.ward_applications.findIndex((application) => application.namespace === subjectKey) ?? -1;
    if (firstAppIndex >= 0) {
      setSelectedAppIndex(firstAppIndex);
    }
  }

  function addApp() {
    if (!config) return;
    const namespace = selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    const template = makeInternalPythonApiApp(namespace);
    template.name = kubeSafeName(uniqueName(template.name, config.ward_applications.map((application) => application.name)));
    updateConfig((current) => ({
      ...current,
      ward_applications: [...current.ward_applications, template],
    }));
    setSelectedAppIndex(config.ward_applications.length);
  }

  function addDemoScenario(scenario: DemoScenarioId) {
    if (!config) return;

    const namespace = selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    const app =
      scenario === "public-python-api"
        ? makePublicPythonApiApp(namespace)
        : scenario === "internal-python-api"
          ? makeInternalPythonApiApp(namespace)
          : makeStaticSiteApp(namespace);
    app.name = kubeSafeName(uniqueName(app.name, config.ward_applications.map((existing) => existing.name)));
    if (app.ingress?.enabled) {
      app.ingress.host = `${app.name}.lab.internal`;
    }

    updateConfig((current) => ({
      ...current,
      ward_applications: [...current.ward_applications, app],
    }));
    setSelectedSubjectKey(namespace);
    setSelectedAppIndex(config.ward_applications.length);
    setStatusMessage(
      scenario === "public-python-api"
        ? `Added public API app to ${namespace}.`
        : scenario === "internal-python-api"
          ? `Added internal API app to ${namespace}.`
          : `Added static site probe app to ${namespace}.`,
    );
    setErrorMessage("");
  }

  function removeSelectedApp() {
    if (!config || config.ward_applications.length <= 1) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications.splice(selectedAppIndex, 1);
      return next;
    });
    setSelectedAppIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }

  function addClusterAdminArn() {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: [...current.cluster_admin_principal_arns, ""],
    }));
  }

  function updateClusterAdminArn(index: number, value: string) {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: current.cluster_admin_principal_arns.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }));
  }

  function removeClusterAdminArn(index: number) {
    updateConfig((current) => ({
      ...current,
      cluster_admin_principal_arns: current.cluster_admin_principal_arns.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function saveManagedConfig() {
    if (!config) return false;
    setIsBusy(true);
    try {
      const normalized: TerraformConfig = {
        ...config,
        analysis_subjects: Object.fromEntries(
          Object.entries(config.analysis_subjects).map(([key, subject]) => [
            key,
            {
              ...subject,
              labels: compactRecord(subject.labels),
            },
          ]),
        ),
        ward_applications: config.ward_applications.map((application) => ({
          ...application,
          pod_labels: compactRecord(application.pod_labels),
          service: application.service
            ? {
                ...application.service,
                annotations: compactRecord(application.service.annotations),
              }
            : undefined,
          ingress: application.ingress
            ? {
                ...application.ingress,
                annotations: compactRecord(application.ingress.annotations),
              }
            : undefined,
          config_map: application.config_map
            ? {
                ...application.config_map,
                data: compactRecord(application.config_map.data),
              }
            : undefined,
          containers: (application.containers ?? []).map((container) => ({
            ...container,
            env: compactRecord(container.env),
            volume_mounts: container.volume_mounts?.filter((mount) => mount.name.trim() && mount.mount_path.trim()) ?? [],
          })),
          volumes: (application.volumes ?? []).filter((volume) => volume.name.trim() !== ""),
          network_policy: {
            ingress: application.network_policy?.ingress ?? [],
            egress: application.network_policy?.egress ?? [],
          },
        })),
      };

      const saved = await api.saveConfig(normalized);
      setConfig(saved);
      setStatusMessage("Managed config saved.");
      setErrorMessage("");
      return true;
    } catch (error) {
      setErrorMessage((error as Error).message);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function resetConfig() {
    setIsBusy(true);
    try {
      const reset = await api.resetConfig();
      setConfig(reset);
      const firstSubjectKey = Object.keys(reset.analysis_subjects)[0] ?? "";
      const firstAppIndex = reset.ward_applications.findIndex((application) => application.namespace === firstSubjectKey);
      setSelectedSubjectKey(firstSubjectKey);
      setSelectedAppIndex(firstAppIndex >= 0 ? firstAppIndex : 0);
      setStatusMessage("Managed config reset.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  function latestPlanRun(stage: RunStage): TerraformRun | null {
    return runs.find((run) => run.stage === stage && run.kind === "plan") ?? null;
  }

  function canQueueApplyFromPlan(stage: RunStage): boolean {
    const planRun = latestPlanRun(stage);
    if (!planRun) return false;
    return planRun.status === "queued" || planRun.status === "running" || planRun.status === "planned";
  }

  async function startPlan(stage: RunStage) {
    const didSave = await saveManagedConfig();
    if (!didSave) return;

    setIsBusy(true);
    try {
      const run = await api.startPlan(stage);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(`${stageLabel(stage)} plan queued.`);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startApply(stage: RunStage) {
    const planRun = latestPlanRun(stage);
    if (!planRun || !canQueueApplyFromPlan(stage)) {
      setErrorMessage(
        `Queue a ${stageLabel(stage).toLowerCase()} plan first. Apply can only be queued from the most recent plan when it is queued, running, or planned.`,
      );
      return;
    }

    setIsBusy(true);
    try {
      const run = await api.startApply(planRun.id);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(
        planRun.status === "planned"
          ? `${stageLabel(stage)} apply queued from the latest saved plan.`
          : `${stageLabel(stage)} apply queued behind the latest plan and will only run if that plan succeeds.`,
      );
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startDestroy(stage: RunStage) {
    if (armedDestroyStage !== stage) {
      setArmedDestroyStage(stage);
      setErrorMessage("");
      return;
    }

    const didSave = await saveManagedConfig();
    if (!didSave) {
      setArmedDestroyStage(null);
      return;
    }

    setIsBusy(true);
    try {
      const run = await api.startDestroy(stage);
      setRunInState(run);
      setSelectedRun(run);
      setSelectedRunId(run.id);
      setSelectedRunLogs([]);
      setStatusMessage(`${stageLabel(stage)} destroy queued.`);
      setErrorMessage("");
      setArmedDestroyStage(null);
      if (stage === "core") {
        setOutputs(null);
      }
    } catch (error) {
      setStatusMessage(`${stageLabel(stage)} destroy was not queued.`);
      setErrorMessage((error as Error).message);
      setArmedDestroyStage(null);
    } finally {
      setIsBusy(false);
    }
  }

  async function unlockState(stage: RunStage) {
    setIsBusy(true);
    try {
      const response = await api.unlockState(stage);
      setStatusMessage(`${stageLabel(stage)} state lock cleared.`);
      setErrorMessage("");

      if (response.source_run_id) {
        const sourceRun = runs.find((run) => run.id === response.source_run_id);
        if (sourceRun) {
          setSelectedRun(sourceRun);
          setSelectedRunId(sourceRun.id);
        }
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function copySelectedRunLogs() {
    if (selectedRunLogs.length === 0) {
      setErrorMessage("No logs available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedRunLogs.join("\n"));
      setErrorMessage("");
      setShowCopiedLogsHint(true);
      if (copiedLogsHintTimerRef.current !== null) {
        window.clearTimeout(copiedLogsHintTimerRef.current);
      }
      copiedLogsHintTimerRef.current = window.setTimeout(() => {
        setShowCopiedLogsHint(false);
        copiedLogsHintTimerRef.current = null;
      }, 1600);
    } catch {
      setErrorMessage("Unable to copy logs from this browser session.");
    }
  }

  async function cancelSelectedRun() {
    if (!selectedRun) return;
    setIsBusy(true);
    try {
      const run = await api.cancelRun(selectedRun.id);
      setRunInState(run);
      setSelectedRun(run);
      setStatusMessage("Cancel requested.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  if (!config) {
    return (
      <div className="app-shell">
        <div className="mx-auto max-w-7xl">
          <Card>
            <CardContent className="py-10 text-sm text-neutral-600">Loading control plane state...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AppTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "assets", label: "Assets" },
    { id: "activity", label: "Activity" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-[1560px] space-y-6">
        <Card className="overflow-hidden">
          <CardContent className="space-y-6 px-6 py-6">
            <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
              <div className="space-y-3">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Cluster Flow</p>
                  <h2 className="text-3xl font-semibold tracking-tight">Keep the important context visible while you work.</h2>
                </div>
                <p className="max-w-3xl text-sm leading-7 text-neutral-400">
                  Shape workloads, stage Terraform safely, and hand off to native observability tools without losing the current cluster context.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Status" value={statusMessage || "Ready"} />
                <MetricTile
                  label="Queue"
                  value={selectedRun?.queue_position ? `#${selectedRun.queue_position}` : "Idle"}
                  hint={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No active run"}
                />
                <MetricTile label="Applications" value={config.ward_applications.length} />
                <MetricTile label="Containers" value={totalContainers} />
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-[1.4rem] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-[1.6rem] border border-border/80 bg-muted/45 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <ReadOnlyField label="Selected Ward" value={selectedSubjectKey || "None"} />
                  <ReadOnlyField label="Selected Application" value={selectedApp?.name ?? "None"} />
                  <ReadOnlyField label="API Token" value={apiTokenValue || "Not set"} />
                </div>
              </div>
              <div className="rounded-[1.6rem] border border-border/80 bg-muted/45 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Current Run</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No selected run"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedRun ? `Status: ${selectedRun.status}` : "Move to Activity to inspect queued and completed work."}
                    </p>
                  </div>
                  {selectedRun ? <Badge>{selectedRun.status}</Badge> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="px-0 py-0">
            <div className="sticky top-0 z-20 border-b border-border/80 bg-card/96 px-5 py-4 backdrop-blur-2xl">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Operator Console</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight">Isolens</h1>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{selectedSubjectKey || "No ward"}</Badge>
                    <Badge>{selectedApp?.name ?? "No application"}</Badge>
                    <Badge>{selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.status}` : "No active run"}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void saveManagedConfig()} disabled={isBusy}>
                    Save config
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => void cancelSelectedRun()}
                    disabled={isBusy || !selectedRun || ["running", "applying", "destroying", "queued", "canceling"].includes(selectedRun.status) === false}
                  >
                    Cancel run
                  </Button>
                  <Button variant="ghost" onClick={() => void resetConfig()} disabled={isBusy}>
                    Reset config
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={classNames(
                      "rounded-full border px-4 py-2.5 text-sm font-medium transition",
                      activeTab === tab.id
                        ? "border-accent/70 bg-accent text-accentForeground"
                        : "border-border/80 bg-card/70 text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={workspaceScrollRef} className="themed-scrollbar h-[calc(100vh-12.5rem)] overflow-y-auto px-5 py-5">
        <div className="grid h-full gap-6">
            {activeTab === "overview" ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Overview Snapshot</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">Overview</p>
                        <h2 className="text-3xl font-semibold tracking-tight">Operate the cluster in the order it actually wants to be used.</h2>
                        <p className="max-w-3xl text-sm leading-7 text-neutral-400">
                          Start with core, move into platform once the cluster is real, then layer policies on top. This area should make the next step obvious before you drill into assets or logs.
                        </p>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <MetricTile label="Wards" value={subjectKeys.length} />
                        <MetricTile label="Applications" value={config.ward_applications.length} />
                        <MetricTile label="Service-backed" value={totalAppsWithService} />
                        <MetricTile label="Ingress-enabled" value={totalAppsWithIngress} />
                      </div>
                    </div>

                    <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                      <p className="text-xs uppercase tracking-[0.28em] text-neutral-500">Current Focus</p>
                      <p className="mt-4 text-xl font-semibold">{selectedApp?.name ?? "No selected application"}</p>
                      <p className="mt-2 text-sm text-neutral-400">
                        {selectedApp
                          ? `${selectedApp.namespace} • ${selectedApp.containers?.length ?? 0} containers • ${selectedApp.replicas ?? 1} replicas`
                          : "Move to Assets to choose a ward and application before editing."}
                      </p>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <MetricTile label="Current Run" value={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "Idle"} />
                        <MetricTile label="Run Status" value={selectedRun?.status ?? "Ready"} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <Card className="overflow-visible">
                    <CardHeader>
                      <CardTitle>Deployment Stages</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Core</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              VPC, EKS, node access, and the cluster foundation that everything else depends on.
                            </p>
                          </div>
                          <Badge>{latestCoreRun ? latestCoreRun.status : "idle"}</Badge>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <MetricTile label="Admin ARNs" value={configuredAdminArnsCount} />
                          <MetricTile label="Wards Planned" value={subjectKeys.length} />
                          <MetricTile label="Apps Planned" value={config.ward_applications.length} />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <StageAction disabledReason={coreActionDisabledReason}>
                            <Button onClick={() => void startPlan("core")} disabled={isBusy || !hasAdminAccess}>Plan core</Button>
                          </StageAction>
                          <StageAction disabledReason={coreActionDisabledReason}>
                            <Button variant="secondary" onClick={() => void startApply("core")} disabled={isBusy || !hasAdminAccess || !canQueueApplyFromPlan("core")}>
                              Apply core
                            </Button>
                          </StageAction>
                          <div data-destroy-arm>
                            <StageAction disabledReason={coreActionDisabledReason}>
                              <Button
                                variant={armedDestroyStage === "core" ? "danger" : "ghost"}
                                className={armedDestroyStage === "core" ? "border-[#b24c63]/80 bg-[#b24c63] text-white hover:bg-[#9f4157]" : ""}
                                onClick={() => void startDestroy("core")}
                                disabled={isBusy || !hasAdminAccess}
                              >
                                Destroy core
                              </Button>
                            </StageAction>
                          </div>
                          <Button variant="ghost" onClick={() => void unlockState("core")} disabled={isBusy}>
                            Unlock state
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Platform</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              Namespaces, Helm add-ons, workloads, ingress, and the operator-facing outputs for the live lab.
                            </p>
                          </div>
                          <Badge>{latestPlatformRun ? latestPlatformRun.status : "idle"}</Badge>
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                          {hasAppliedCoreRun ? "Core applied, platform stage unlocked" : "Apply core first to unlock this stage"}
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <MetricTile label="Wards" value={subjectKeys.length} />
                          <MetricTile label="Apps" value={config.ward_applications.length} />
                          <MetricTile label="Services" value={totalAppsWithService} />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <StageAction disabledReason={platformActionDisabledReason}>
                            <Button onClick={() => void startPlan("platform")} disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun}>Plan platform</Button>
                          </StageAction>
                          <StageAction disabledReason={platformActionDisabledReason}>
                            <Button
                              variant="secondary"
                              onClick={() => void startApply("platform")}
                              disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun || !canQueueApplyFromPlan("platform")}
                            >
                              Apply platform
                            </Button>
                          </StageAction>
                          <div data-destroy-arm>
                            <StageAction disabledReason={platformActionDisabledReason}>
                              <Button
                                variant={armedDestroyStage === "platform" ? "danger" : "ghost"}
                                className={armedDestroyStage === "platform" ? "border-[#b24c63]/80 bg-[#b24c63] text-white hover:bg-[#9f4157]" : ""}
                                onClick={() => void startDestroy("platform")}
                                disabled={isBusy || !hasAdminAccess || !hasAppliedCoreRun}
                              >
                                Destroy platform
                              </Button>
                            </StageAction>
                          </div>
                          <Button variant="ghost" onClick={() => void unlockState("platform")} disabled={isBusy}>
                            Unlock state
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Policies</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              Kyverno and Tetragon custom resources applied only after the platform layer is healthy.
                            </p>
                          </div>
                          <Badge>{latestPoliciesRun ? latestPoliciesRun.status : "idle"}</Badge>
                        </div>
                        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-neutral-500">
                          {hasAppliedPlatformRun ? "Platform applied, policy stage unlocked" : "Apply platform first to unlock this stage"}
                        </p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <MetricTile label="Selected Run" value={selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "None"} />
                          <MetricTile label="Queue Depth" value={selectedRun?.queue_position ?? 0} />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <StageAction disabledReason={policiesActionDisabledReason}>
                            <Button onClick={() => void startPlan("policies")} disabled={isBusy || !hasAdminAccess || !hasAppliedPlatformRun}>Plan policies</Button>
                          </StageAction>
                          <StageAction disabledReason={policiesActionDisabledReason}>
                            <Button
                              variant="secondary"
                              onClick={() => void startApply("policies")}
                              disabled={isBusy || !hasAdminAccess || !hasAppliedPlatformRun || !canQueueApplyFromPlan("policies")}
                            >
                              Apply policies
                            </Button>
                          </StageAction>
                          <div data-destroy-arm>
                            <StageAction disabledReason={policiesActionDisabledReason}>
                              <Button
                                variant={armedDestroyStage === "policies" ? "danger" : "ghost"}
                                className={armedDestroyStage === "policies" ? "border-[#b24c63]/80 bg-[#b24c63] text-white hover:bg-[#9f4157]" : ""}
                                onClick={() => void startDestroy("policies")}
                                disabled={isBusy || !hasAdminAccess || !hasAppliedPlatformRun}
                              >
                                Destroy policies
                              </Button>
                            </StageAction>
                          </div>
                          <Button variant="ghost" onClick={() => void unlockState("policies")} disabled={isBusy}>
                            Unlock state
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Observability Handoff</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold">Hubble UI</p>
                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                              Keep flow analysis in the native UI instead of flattening it into this dashboard.
                            </p>
                          </div>
                          <Badge>{observabilityLinks?.hubble_available ? "Ready" : "Needs URL"}</Badge>
                        </div>

                        <div className="mt-4 rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Target</p>
                          <p className="mt-3 break-all text-sm font-medium">
                            {observabilityLinks?.hubble_ui_url ?? "Set ISOLENS_HUBBLE_UI_URL in backend/.env"}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button onClick={openHubbleUi} disabled={!observabilityLinks?.hubble_available}>Open Hubble UI</Button>
                          <Button variant="ghost" onClick={() => void loadInitial()} disabled={isBusy}>Refresh status</Button>
                        </div>
                        <p className="mt-3 text-xs text-neutral-500">
                          Local path: `kubectl -n kube-system port-forward svc/hubble-ui 12000:80`
                        </p>
                      </div>

                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}

            {activeTab === "assets" ? (
              <div className="grid gap-6">
                <Card className="overflow-hidden">
                  <CardHeader>
                    <CardTitle>Ward Studio</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_340px]">
                    <div className="rounded-[2rem] border border-border/80 bg-muted/55 p-6">
                      <p className="text-xs uppercase tracking-[0.28em] text-neutral-500">Selected ward</p>
                      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                          <p className="text-3xl font-semibold tracking-tight">{selectedSubjectKey || "No ward selected"}</p>
                          <p className="max-w-3xl text-sm leading-7 text-neutral-500">
                            {selectedSubject?.description || "Choose a ward to inspect namespace settings and the applications inside it."}
                          </p>
                        </div>
                        {selectedSubject ? <Button onClick={() => setIsSubjectModalOpen(true)}>Edit ward</Button> : null}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Badge>{selectedSubject?.tier ?? "ward"}</Badge>
                        <Badge>{appsForSelectedSubject.length} app{appsForSelectedSubject.length === 1 ? "" : "s"}</Badge>
                        <Badge>{Object.keys(selectedSubject?.labels ?? {}).length} label{Object.keys(selectedSubject?.labels ?? {}).length === 1 ? "" : "s"}</Badge>
                      </div>
                      {Object.entries(selectedSubject?.labels ?? {}).length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {Object.entries(selectedSubject?.labels ?? {}).map(([labelKey, labelValue]) => (
                            <span
                              key={`${labelKey}-${labelValue}`}
                              className="rounded-full border border-border/70 bg-card/75 px-3 py-1.5 text-xs text-foreground/75"
                            >
                              {labelKey}: {labelValue}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <MetricTile label="Pods quota" value={selectedSubject?.resource_quota?.pods ?? "-"} />
                      <MetricTile label="CPU request" value={selectedSubject?.resource_quota?.requests_cpu ?? "-"} />
                      <MetricTile label="CPU limit" value={selectedSubject?.resource_quota?.limits_cpu ?? "-"} />
                      <MetricTile label="Memory limit" value={selectedSubject?.resource_quota?.limits_memory ?? "-"} />
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-6 2xl:grid-cols-[290px_minmax(0,1fr)_390px] 2xl:items-start">
                  <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden">
                    <CardHeader>
                      <CardTitle>Wards</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                      <p className="text-sm leading-6 text-neutral-500">Pick the ward you want to work in. Each ward maps to one Kubernetes namespace.</p>
                      <div className="themed-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {subjectKeys.map((subjectKey) => (
                          <button
                            key={subjectKey}
                            className={classNames(
                              "w-full rounded-[1.5rem] border px-4 py-4 text-left transition",
                              subjectKey === selectedSubjectKey
                                ? "border-accent/70 bg-accent/10"
                                : "border-border/80 bg-card/72 hover:bg-muted/70",
                            )}
                            onClick={() => selectSubject(subjectKey)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{subjectKey}</p>
                                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                                  {config.analysis_subjects[subjectKey]?.tier ?? "ward"}
                                </p>
                              </div>
                              <Badge>{config.ward_applications.filter((application) => application.namespace === subjectKey).length}</Badge>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="grid gap-2 pt-1">
                        <Button variant="secondary" onClick={addSubject}>Add ward</Button>
                        <Button variant="danger" onClick={removeSelectedSubject} disabled={subjectKeys.length <= 1}>Remove ward</Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 min-w-0">
                    <Card className="overflow-hidden">
                      <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <CardTitle>Applications In This Ward</CardTitle>
                          <p className="mt-2 text-sm leading-6 text-neutral-500">Choose an application, then inspect and edit it on the right.</p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-[14rem] xl:w-[14rem] xl:self-center">
                          <Button className="w-full" variant="secondary" onClick={addApp}>Add application</Button>
                          <Button className="w-full" variant="danger" onClick={removeSelectedApp} disabled={config.ward_applications.length <= 1}>Remove selected app</Button>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        {appsForSelectedSubject.length === 0 ? (
                          <div className="rounded-[1.6rem] border border-dashed border-border/80 bg-muted/45 px-5 py-6 text-sm text-neutral-500">
                            No applications in this ward yet. Start with a scenario below or add one manually.
                          </div>
                        ) : null}
                        <div className="themed-scrollbar flex gap-4 overflow-x-auto pb-2">
                          {appsForSelectedSubject.map(({ application, index }) => {
                            const applicationReview = buildAppReview(application, subjectKeys);
                            const applicationPrimaryContainer = primaryContainer(application);

                            return (
                              <button
                                key={`${application.name}-${index}`}
                                className={classNames(
                                  "min-w-[320px] max-w-[320px] shrink-0 rounded-[1.7rem] border p-5 text-left transition",
                                  index === selectedAppIndex
                                    ? "border-accent/70 bg-accent/10"
                                    : "border-border/80 bg-card/80 hover:bg-muted/65",
                                )}
                                onClick={() => setSelectedAppIndex(index)}
                              >
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-lg font-semibold tracking-tight">{application.name}</p>
                                    <p className="mt-2 text-xs uppercase tracking-[0.22em] text-neutral-500">
                                      {application.containers?.length ?? 0} containers • {application.replicas ?? 1} replicas
                                    </p>
                                  </div>
                                  <Badge>{application.ingress?.enabled ? "Public" : "Internal"}</Badge>
                                </div>
                                <div className="mt-4 grid gap-2 text-sm text-foreground/80">
                                  <p className="truncate" title={applicationPrimaryContainer?.image ?? "No image"}>
                                    Image: {displayImageName(applicationPrimaryContainer?.image)}
                                  </p>
                                  <p className="truncate" title={displayExposureSummary(application)}>
                                    Exposure: {displayExposureSummary(application)}
                                  </p>
                                  <p>
                                    Status: {applicationReview.errors.length > 0
                                      ? `${applicationReview.errors.length} issue${applicationReview.errors.length === 1 ? "" : "s"}`
                                      : applicationReview.warnings.length > 0
                                        ? `${applicationReview.warnings.length} warning${applicationReview.warnings.length === 1 ? "" : "s"}`
                                        : "Ready"}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="overflow-hidden">
                      <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                          <CardTitle>Scenario Library</CardTitle>
                          <p className="mt-2 text-sm leading-6 text-neutral-500">Create a new demo application in this ward from a safe, working starting point.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>Demo-ready</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="themed-scrollbar flex gap-4 overflow-x-auto pb-2">
                          <ScenarioTile
                            title="Public Python API"
                            description="Ingress-exposed FastAPI with a built-in egress check."
                            tag="Public traffic"
                            actionLabel="Add to this ward"
                            onApply={() => addDemoScenario("public-python-api")}
                          />
                          <ScenarioTile
                            title="Internal Python API"
                            description="Cluster-only FastAPI for a quieter comparison case."
                            tag="Internal traffic"
                            actionLabel="Add to this ward"
                            onApply={() => addDemoScenario("internal-python-api")}
                          />
                          <ScenarioTile
                            title="Static Site Probe"
                            description="Minimal web probe for service and ingress validation."
                            tag="Smoke test"
                            actionLabel="Add to this ward"
                            onApply={() => addDemoScenario("static-site")}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="overflow-hidden">
                    <CardHeader>
                      <CardTitle>Application Inspector</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-[1.9rem] border border-border/80 bg-muted/55 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Selected application</p>
                            <p className="mt-3 truncate text-2xl font-semibold tracking-tight" title={selectedApp?.name || "None"}>{selectedApp?.name || "None"}</p>
                            <p className="mt-3 text-sm leading-6 text-neutral-500">
                              {selectedApp
                                ? `${selectedApp.namespace} • ${selectedApp.containers?.length ?? 0} containers • ${selectedApp.replicas ?? 1} replicas`
                                : "Choose an application to inspect runtime and rollout readiness."}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {selectedApp ? (
                              <Badge className={selectedAppReview.errors.length > 0 ? "border-warning/35 bg-warning/10 text-warning" : ""}>
                                {selectedAppReview.errors.length > 0
                                  ? `${selectedAppReview.errors.length} blocking issue${selectedAppReview.errors.length === 1 ? "" : "s"}`
                                  : selectedAppReview.warnings.length > 0
                                    ? `${selectedAppReview.warnings.length} warning${selectedAppReview.warnings.length === 1 ? "" : "s"}`
                                    : "Ready to deploy"}
                              </Badge>
                            ) : null}
                            {selectedApp ? <Button onClick={() => setIsAppModalOpen(true)}>Open builder</Button> : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <MetricTile label="Replicas" value={selectedApp?.replicas ?? 0} />
                        <MetricTile label="Containers" value={selectedApp?.containers?.length ?? 0} />
                        <MetricTile label="Volumes" value={selectedApp?.volumes?.length ?? 0} />
                        <MetricTile label="Secrets" value={selectedAppReview.secretDependencies.length} />
                      </div>

                      <div className="grid gap-3">
                        <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Runtime</p>
                          <div className="mt-3 space-y-2 text-sm text-foreground/80">
                            <p className="truncate" title={selectedAppPrimaryContainer?.image ?? "Not configured"}>
                              Image: {displayImageName(selectedAppPrimaryContainer?.image)}
                            </p>
                            <p>Port: {selectedAppPrimaryContainer?.port ?? "-"}</p>
                            <p>Health path: {selectedAppPrimaryContainer?.probes?.readiness?.path ?? "/"}</p>
                          </div>
                        </div>
                        <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Exposure</p>
                          <div className="mt-3 space-y-2 text-sm text-foreground/80">
                            <p>Service type: {selectedApp?.service?.type ?? "ClusterIP"}</p>
                            <p>Port: {selectedApp?.service?.port ?? "-"}</p>
                            <p className="break-all">Ingress host: {selectedApp?.ingress?.host || "Not configured"}</p>
                          </div>
                        </div>
                        <div className="rounded-[1.4rem] border border-border/80 bg-card/85 p-4">
                          <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">Terraform resources</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-foreground/75">Deployment</span>
                            {selectedAppReview.resources.map((resource) => (
                              <span key={resource} className="rounded-full border border-border/70 bg-muted/60 px-3 py-1 text-xs text-foreground/75">
                                {resource}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <ReviewItems title="Blocking issues" tone="error" items={selectedAppReview.errors} />
                      <ReviewItems title="Warnings" tone="warning" items={selectedAppReview.warnings} />
                      <ReviewItems title="Helpful notes" tone="hint" items={selectedAppReview.hints} />
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <div className="grid h-full min-h-0 gap-6 2xl:grid-cols-[340px_minmax(0,1fr)] 2xl:items-stretch">
                <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle>Runs</CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="themed-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {runs.length === 0 ? <p className="text-sm text-neutral-500">No runs.</p> : null}
                      {runs.map((run) => (
                        <button
                          key={run.id}
                          className={classNames(
                            "w-full rounded-[1.4rem] border px-4 py-4 text-left transition",
                            selectedRunId === run.id ? "border-accent/70 bg-accent/10" : "border-border/80 bg-card/75 hover:bg-muted/70",
                          )}
                          onClick={() => {
                            setSelectedRunId(run.id);
                            setSelectedRun(run);
                            setSelectedRunLogs([]);
                            setOutputs(normalizeTerraformOutputs(run.outputs));
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{stageLabel(run.stage)} {run.kind}</p>
                              <p className="mt-1 text-xs text-neutral-500">{run.id}</p>
                            </div>
                            <Badge className={statusTone(run.status) === "danger" ? "border-warning/30 bg-warning/10 text-warning" : ""}>
                              {run.status}
                              {run.queue_position ? ` #${run.queue_position}` : ""}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid min-w-0 gap-6">
                  <Card className="flex min-h-0 flex-col">
                    <CardHeader>
                      <CardTitle>Run Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                      {selectedRun ? (
                        <>
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="min-w-0 rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Selected run</p>
                              <p className="mt-3 break-words text-2xl font-semibold">{stageLabel(selectedRun.stage)} {selectedRun.kind}</p>
                              <div className="mt-4 grid gap-3">
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Status</span>
                                  <span className="break-words text-sm font-medium text-foreground">
                                    {selectedRun.status}
                                    {selectedRun.queue_position ? ` • Queue #${selectedRun.queue_position}` : ""}
                                  </span>
                                </div>
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Run ID</span>
                                  <span className="break-all text-sm text-foreground/80">{selectedRun.id}</span>
                                </div>
                                {selectedRun.started_at || selectedRun.completed_at ? (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {selectedRun.started_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Started</span>
                                        <span className="break-words text-sm text-foreground/80">{formatRunTimestamp(selectedRun.started_at)}</span>
                                      </div>
                                    ) : null}
                                    {selectedRun.completed_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Completed</span>
                                        <span className="break-words text-sm text-foreground/80">{formatRunTimestamp(selectedRun.completed_at)}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              {selectedRun.error ? (
                                <div className="mt-4 rounded-[1.2rem] border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                                  <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] text-warning/75">
                                    <span>Details</span>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`text-[10px] tracking-[0.2em] transition-all duration-200 ${showCopiedLogsHint ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-0.5 opacity-0"}`}
                                      >
                                        Copied
                                      </span>
                                      <button
                                        type="button"
                                        className="shrink-0 bg-transparent p-0 text-warning/75 transition hover:text-warning"
                                        onClick={() => void copySelectedRunLogs()}
                                        title="Copy logs"
                                        aria-label="Copy logs"
                                      >
                                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <rect x="9" y="9" width="10" height="10" rx="2" />
                                          <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="themed-scrollbar max-h-48 overflow-auto break-words whitespace-pre-wrap pr-2 text-foreground/88">
                                    {formatRunErrorText(selectedRun.error)}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                            <div className="grid min-w-0 gap-3">
                              {selectedRun.kind === "destroy" ? (
                                <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">Destroy run</p>
                                  <p className="mt-3 text-sm leading-6 text-foreground/75">
                                    This run removes the resources managed by the {stageLabel(selectedRun.stage).toLowerCase()} stage directly from Terraform state and the target platform.
                                  </p>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                                    <MetricTile label="Stage" value={stageLabel(selectedRun.stage)} />
                                    <MetricTile label="Mode" value="Destroy" />
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">{planSummaryLabel}</p>
                                      {selectedRun.kind === "apply" ? (
                                        <p className="mt-2 max-w-xl text-sm text-foreground/70">
                                          These counts come from the saved plan that this apply executed. They are not a record of what finished successfully.
                                        </p>
                                      ) : null}
                                    </div>
                                    {selectedRun.kind === "apply" && sourcePlanRun ? (
                                      <Badge className="whitespace-nowrap border-border/80 bg-card/80 text-foreground/75">
                                        Source plan {sourcePlanRun.id}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <MetricTile label="Create" value={displayedPlanSummary?.create ?? 0} />
                                    <MetricTile label="Update" value={displayedPlanSummary?.update ?? 0} />
                                    <MetricTile label="Delete" value={displayedPlanSummary?.delete ?? 0} />
                                    <MetricTile label="Replace" value={displayedPlanSummary?.replace ?? 0} />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {selectedRun.kind !== "destroy" ? (
                            <div className="flex min-h-0 flex-col rounded-[1.8rem] border border-border/80 bg-muted/55 p-5">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                {selectedRun.kind === "apply" ? "Resources in saved plan" : "Changed resources"}
                              </p>
                              <div className="themed-scrollbar mt-4 min-h-[12rem] max-h-[18rem] overflow-auto rounded-[1.2rem] border border-border/80 bg-card/85 p-4 text-sm text-foreground/80">
                                {(displayedPlanSummary?.addresses ?? []).length === 0 ? (
                                  <p>No structured plan summary yet.</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(displayedPlanSummary?.addresses ?? []).map((address) => (
                                      <li key={address} className="break-all">{address}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm text-neutral-500">Select a run.</p>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <Card>
                      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>Run Logs</CardTitle>
                        <div className="flex items-center gap-2">
                          <Button variant={autoScrollLogs ? "secondary" : "ghost"} className="px-3 py-1.5 text-xs" onClick={() => setAutoScrollLogs((current) => !current)}>
                            Auto-scroll {autoScrollLogs ? "On" : "Off"}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-hidden rounded-[1.2rem] border border-[#ab9f9d]/45 bg-[#f5f1fb] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                          <div className="flex items-center justify-between gap-3 border-b border-[#ab9f9d]/35 bg-[#dddbf1]/72 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-[#383f51]/78">
                            <span>{selectedRun ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}` : "No run selected"}</span>
                            <span>{selectedRunLogs.length} lines • {groupedSelectedRunLogs.length} entries</span>
                          </div>
                          <div ref={logsViewportRef} className="themed-scrollbar max-h-[32rem] overflow-auto p-4 font-mono text-xs text-[#383f51]">
                            {groupedSelectedRunLogs.length > 0 ? (
                              <div className="space-y-2.5">
                                {groupedSelectedRunLogs.map((group, index) => (
                                  (() => {
                                    const entry = group.kind === "structured" ? group.entry : null;
                                    const message = group.kind === "structured" ? group.entry.message : group.message;
                                    return (
                                      <div key={`${index}-${group.startLineNumber}-${group.endLineNumber}`} className="rounded-[1rem] border border-[#ab9f9d]/32 bg-white/78 px-3 py-2.5 shadow-[0_10px_24px_rgba(56,63,81,0.06)]">
                                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em]">
                                            <span className="rounded-full border border-[#3c4f76]/18 bg-[#3c4f76]/10 px-2 py-1 text-[#3c4f76]">
                                              {group.startLineNumber === group.endLineNumber
                                                ? group.startLineNumber
                                                : `${group.startLineNumber}-${group.endLineNumber}`}
                                            </span>
                                            {entry?.level ? (
                                              <span className={`rounded-full border px-2 py-1 ${logLevelTone(entry.level)}`}>{entry.level}</span>
                                            ) : null}
                                            {entry?.source ? <span className="text-[#3c4f76]/82">{entry.source}</span> : null}
                                            {entry?.address ? <span className="break-all text-[#383f51]/62">{entry.address}</span> : null}
                                            {entry?.timestamp ? <span className="text-[#383f51]/58">{formatRunTimestamp(entry.timestamp)}</span> : null}
                                          </div>
                                          <p className="mt-2 break-words whitespace-pre-wrap font-sans text-sm leading-6 text-[#383f51]">
                                            {message}
                                          </p>
                                          {entry?.detail ? (
                                            <p className="mt-2 break-words whitespace-pre-wrap font-sans text-xs leading-5 text-[#3c4f76]/82">
                                              {entry.detail}
                                            </p>
                                          ) : null}
                                      </div>
                                    );
                                  })()
                                ))}
                              </div>
                            ) : (
                              <p className="text-[#383f51]/62">No logs yet.</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle>Terraform Outputs</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {hasTerraformOutputs(outputs) ? (
                          <div className="themed-scrollbar max-h-[32rem] space-y-3 overflow-auto rounded-[1.2rem] border border-border/80 bg-card/85 p-4">
                            {Object.entries(outputs ?? {}).map(([key, entry]) => {
                              const normalized = formatTerraformOutputValue(entry);
                              return (
                                <div key={key} className="rounded-[1rem] border border-border/70 bg-background/45 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-neutral-500">{key}</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {normalized.type ? (
                                        <Badge className="border-border/80 bg-card/80 text-foreground/70">
                                          {typeof normalized.type === "string" ? normalized.type : prettyPrint(normalized.type)}
                                        </Badge>
                                      ) : null}
                                      {normalized.sensitive ? (
                                        <Badge className="border-warning/40 bg-warning/12 text-warning">Sensitive</Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                  <pre className="mt-3 overflow-auto rounded-[0.9rem] border border-border/60 bg-white/30 p-3 font-mono text-xs text-foreground/82">
                                    {normalized.sensitive
                                      ? "(sensitive output)"
                                      : typeof normalized.value === "string"
                                        ? normalized.value
                                        : prettyPrint(normalized.value)}
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-[1.2rem] border border-border/80 bg-card/85 p-4 text-sm text-neutral-500">
                            No outputs available.
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "settings" ? (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Cluster Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-neutral-400">
                      Read-only cluster identity and environment metadata from the shared Terraform configuration.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <ReadOnlyField label="Project" value={config.project_name} />
                      <ReadOnlyField label="Environment" value={config.environment} />
                      <ReadOnlyField label="Cluster name" value={config.cluster_name} />
                      <ReadOnlyField label="Kubernetes version" value={config.kubernetes_version} />
                      <ReadOnlyField
                        label="Control plane log retention"
                        value={`${config.cluster_log_retention_in_days} days`}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="flex h-[22rem] flex-col overflow-hidden">
                  <CardHeader>
                    <CardTitle>Admin Access</CardTitle>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">ARNs ({config.cluster_admin_principal_arns.length})</p>
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-9 w-9 rounded-full px-0 text-xl leading-none"
                        onClick={addClusterAdminArn}
                      >
                        +
                      </Button>
                    </div>
                    <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
                      <div className="grid gap-2">
                        {config.cluster_admin_principal_arns.map((arn, index) => (
                          <div key={`${arn}-${index}`} className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]">
                            <Input
                              value={arn}
                              onChange={(event) => updateClusterAdminArn(index, event.target.value)}
                              placeholder="arn:aws:iam::123456789012:role/example"
                            />
                            <Button variant="danger" type="button" onClick={() => removeClusterAdminArn(index)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
        </div>
            </div>
          </CardContent>
        </Card>

        <Modal title="Edit Ward" open={isSubjectModalOpen && Boolean(selectedSubject)} onClose={() => setIsSubjectModalOpen(false)}>
          {selectedSubject ? (
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Ward namespace</span>
                  <Input value={selectedSubjectKey} onChange={(event) => renameSubject(selectedSubjectKey, event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Tier</span>
                  <Input
                    value={selectedSubject.tier ?? ""}
                    onChange={(event) => updateSelectedSubject((current) => ({ ...current, tier: event.target.value }))}
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span>Description</span>
                <Input
                  value={selectedSubject.description ?? ""}
                  onChange={(event) => updateSelectedSubject((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <KeyValueEditor
                label="Labels"
                value={selectedSubject.labels}
                onChange={(labels) => updateSelectedSubject((current) => ({ ...current, labels }))}
                addLabel="Add label"
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <label className="grid gap-1 text-sm">
                  <span>Pods</span>
                  <Input
                    value={selectedSubject.resource_quota?.pods ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, pods: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>CPU request</span>
                  <Input
                    value={selectedSubject.resource_quota?.requests_cpu ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, requests_cpu: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Memory request</span>
                  <Input
                    value={selectedSubject.resource_quota?.requests_memory ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, requests_memory: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>CPU limit</span>
                  <Input
                    value={selectedSubject.resource_quota?.limits_cpu ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, limits_cpu: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Memory limit</span>
                  <Input
                    value={selectedSubject.resource_quota?.limits_memory ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: { ...current.resource_quota, limits_memory: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal title="Edit Application" open={isAppModalOpen && Boolean(selectedApp)} onClose={() => setIsAppModalOpen(false)}>
          {selectedApp ? (
            <div className="grid gap-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Quick setup</p>
                      <p className="mt-2 text-sm leading-6 text-neutral-500">
                        These are the fields that matter most when you want a working app quickly.
                      </p>
                    </div>
                    <Badge>{selectedApp.namespace}</Badge>
                  </div>
                  <div className="grid gap-4">
                    <div className="grid gap-3 xl:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        <span>Name</span>
                        <Input value={selectedApp.name} onChange={(event) => updateSelectedApp((current) => ({ ...current, name: kubeSafeName(event.target.value) }))} />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Ward namespace</span>
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={selectedApp.namespace}
                          onChange={(event) => updateSelectedApp((current) => ({ ...current, namespace: event.target.value }))}
                        >
                          {subjectKeys.map((subjectKey) => (
                            <option key={subjectKey} value={subjectKey}>
                              {subjectKey}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Replicas</span>
                        <Input
                          type="number"
                          min={1}
                          value={String(selectedApp.replicas ?? 1)}
                          onChange={(event) => updateSelectedApp((current) => ({ ...current, replicas: Number(event.target.value) }))}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span>Exposure</span>
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={selectedApp.ingress?.enabled ? "public" : "internal"}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              service: {
                                ...current.service,
                                enabled: true,
                              },
                              ingress: {
                                ...current.ingress,
                                enabled: event.target.value === "public",
                                class_name: current.ingress?.class_name ?? "nginx",
                                host:
                                  event.target.value === "public"
                                    ? current.ingress?.host?.trim() || `${current.name}.lab.internal`
                                    : "",
                              } as IngressConfig,
                            }))
                          }
                        >
                          <option value="internal">Internal service only</option>
                          <option value="public">Ingress exposed</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Health path</span>
                        <Input
                          value={selectedAppPrimaryContainer?.probes?.readiness?.path ?? "/"}
                          onChange={(event) =>
                            updateSelectedPrimaryContainer((current) => ({
                              ...current,
                              probes: {
                                ...current.probes,
                                readiness: { ...current.probes?.readiness, enabled: true, path: event.target.value, port: current.port ?? 8080 },
                                liveness: { ...current.probes?.liveness, enabled: true, path: event.target.value, port: current.port ?? 8080 },
                              },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span>Primary image</span>
                        <Input
                          value={selectedAppPrimaryContainer?.image ?? ""}
                          onChange={(event) => updateSelectedPrimaryContainer((current) => ({ ...current, image: event.target.value }))}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Primary port</span>
                        <Input
                          type="number"
                          value={String(selectedAppPrimaryContainer?.port ?? 8080)}
                          onChange={(event) => {
                            const nextPort = Number(event.target.value);
                            updateSelectedPrimaryContainer((current) => ({
                              ...current,
                              port: nextPort,
                              probes: {
                                ...current.probes,
                                readiness: { ...current.probes?.readiness, port: nextPort },
                                liveness: { ...current.probes?.liveness, port: nextPort },
                                startup: { ...current.probes?.startup, port: nextPort },
                              },
                            }));
                            updateSelectedApp((current) => ({
                              ...current,
                              service: {
                                ...current.service,
                                port: nextPort,
                                target_port: nextPort,
                              },
                            }));
                          }}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-3">
                      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                        <input
                          type="checkbox"
                          checked={selectedApp.service?.enabled ?? true}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              service: { ...current.service, enabled: event.target.checked },
                            }))
                          }
                        />
                        Keep service enabled
                      </label>
                      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                        <input
                          type="checkbox"
                          checked={selectedApp.config_map?.enabled ?? false}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              config_map: { ...current.config_map, enabled: event.target.checked },
                            }))
                          }
                        />
                        Mount app files from ConfigMap
                      </label>
                      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                        <input
                          type="checkbox"
                          checked={selectedApp.allow_same_namespace_ingress ?? true}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              allow_same_namespace_ingress: event.target.checked,
                            }))
                          }
                        />
                        Allow same-namespace ingress
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-2xl border border-border p-4">
                    <p className="font-semibold">Deployment review</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-500">
                      The interface should push you toward a successful deploy, so this review calls out what still needs attention.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <MetricTile label="Blocking issues" value={selectedAppReview.errors.length} />
                      <MetricTile label="Warnings" value={selectedAppReview.warnings.length} />
                      <MetricTile label="Resources" value={selectedAppReview.resources.length || "Deployment"} />
                      <MetricTile label="Secrets" value={selectedAppReview.secretDependencies.length} />
                    </div>
                    <div className="mt-4 grid gap-3">
                      <ReviewItems title="Fix before deploy" tone="error" items={selectedAppReview.errors} />
                      <ReviewItems title="Worth checking" tone="warning" items={selectedAppReview.warnings} />
                      <ReviewItems title="Good to know" tone="hint" items={selectedAppReview.hints} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="font-semibold">What this creates</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>Deployment</Badge>
                      {selectedAppReview.resources.map((resource) => (
                        <Badge key={resource}>{resource}</Badge>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-neutral-500">
                      Secret-backed values are intentionally not created automatically here because they would land in Terraform state.
                    </p>
                    {selectedAppReview.secretDependencies.length > 0 ? (
                      <div className="mt-3 rounded-[1.2rem] border border-[#ab9f9d]/50 bg-[#ab9f9d]/14 px-4 py-3 text-sm text-foreground">
                        {selectedAppReview.secretDependencies.join(", ")}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <EditorSection
                title="Application Files From ConfigMap"
                summary="This mounts files from a Kubernetes ConfigMap into the container. Use it when you want the interface to provide source files like main.py or index.html without building a custom image."
                defaultOpen
              >
                <label className="grid gap-1 text-sm">
                  <span>Mount path</span>
                  <Input
                    value={selectedApp.config_map?.mount_path ?? "/app"}
                    onChange={(event) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        config_map: { ...current.config_map, mount_path: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Primary file name</span>
                  <Input
                    value={selectedAppPrimaryConfigFile[0]}
                    onChange={(event) => updateSelectedPrimaryConfigFile(event.target.value, selectedAppPrimaryConfigFile[1])}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Primary file content</span>
                  <Textarea
                    value={selectedAppPrimaryConfigFile[1]}
                    onChange={(event) => updateSelectedPrimaryConfigFile(selectedAppPrimaryConfigFile[0], event.target.value)}
                    className="min-h-[280px]"
                  />
                </label>
                <KeyValueEditor
                  label="Additional ConfigMap files"
                  value={Object.fromEntries(Object.entries(selectedApp.config_map?.data ?? {}).slice(1))}
                  onChange={(data) =>
                    updateSelectedApp((current) => ({
                      ...current,
                      config_map: {
                        ...current.config_map,
                        data: {
                          [selectedAppPrimaryConfigFile[0]]: selectedAppPrimaryConfigFile[1],
                          ...data,
                        },
                      },
                    }))
                  }
                  addLabel="Add file"
                />
              </EditorSection>

              <EditorSection
                title="Service & Ingress"
                summary="Tighten how the app is exposed once the quick setup looks right."
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                      <span>Service type</span>
                      <Input
                        value={selectedApp.service?.type ?? "ClusterIP"}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            service: { ...current.service, type: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Service port</span>
                      <Input
                        type="number"
                        value={String(selectedApp.service?.port ?? 8080)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            service: { ...current.service, port: Number(event.target.value) },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Target port</span>
                      <Input
                        type="number"
                        value={String(selectedApp.service?.target_port ?? selectedApp.service?.port ?? 8080)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            service: { ...current.service, target_port: Number(event.target.value) },
                          }))
                        }
                      />
                    </label>
                    <KeyValueEditor
                      label="Service annotations"
                      value={selectedApp.service?.annotations}
                      onChange={(annotations) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          service: { ...current.service, annotations },
                        }))
                      }
                      addLabel="Add annotation"
                    />
                  </div>
                  <div className="grid gap-3">
                    <label className="grid gap-1 text-sm">
                      <span>Ingress class</span>
                      <Input
                        value={selectedApp.ingress?.class_name ?? "nginx"}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            ingress: { ...current.ingress, class_name: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Host</span>
                      <Input
                        value={selectedApp.ingress?.host ?? ""}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            ingress: { ...current.ingress, host: event.target.value },
                          }))
                        }
                      />
                    </label>
                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span>Path</span>
                        <Input
                          value={selectedApp.ingress?.path ?? "/"}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              ingress: { ...current.ingress, path: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Path type</span>
                        <Input
                          value={selectedApp.ingress?.path_type ?? "Prefix"}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              ingress: { ...current.ingress, path_type: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <KeyValueEditor
                      label="Ingress annotations"
                      value={selectedApp.ingress?.annotations}
                      onChange={(annotations) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          ingress: { ...current.ingress, annotations },
                        }))
                      }
                      addLabel="Add annotation"
                    />
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                title="Runtime & Containers"
                summary="Use this when you need multiple containers, custom commands, or more precise runtime tuning."
              >
                <div className="grid gap-4">
                  <div className="grid gap-3 xl:grid-cols-2">
                    <KeyValueEditor
                      label="Pod annotations"
                      value={selectedApp.pod_annotations}
                      onChange={(pod_annotations) => updateSelectedApp((current) => ({ ...current, pod_annotations }))}
                      addLabel="Add annotation"
                    />
                    <KeyValueEditor
                      label="Pod labels"
                      value={selectedApp.pod_labels}
                      onChange={(pod_labels) => updateSelectedApp((current) => ({ ...current, pod_labels }))}
                      addLabel="Add label"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={selectedApp.automount_service_account_token ?? false}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            automount_service_account_token: event.target.checked,
                          }))
                        }
                      />
                      Automount service account token
                    </label>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: [...(current.containers ?? []), emptyContainer()],
                        }))
                      }
                    >
                      Add container
                    </Button>
                  </div>
                  {(selectedApp.containers ?? []).map((container, index) => (
                    <ContainerEditor
                      key={`${container.name}-${index}`}
                      index={index}
                      container={container}
                      onChange={(nextContainer) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).map((item, itemIndex) => (itemIndex === index ? nextContainer : item)),
                        }))
                      }
                      onRemove={() =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).filter((_, itemIndex) => itemIndex !== index),
                        }))
                      }
                    />
                  ))}
                </div>
              </EditorSection>

              <EditorSection
                title="Volumes & Secrets"
                summary="Reference existing secrets here, or add shared writable storage for sidecars and caches."
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Volumes</p>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      updateSelectedApp((current) => ({
                        ...current,
                        volumes: [...(current.volumes ?? []), emptyVolume()],
                      }))
                    }
                  >
                    Add volume
                  </Button>
                </div>
                <div className="grid gap-3">
                  {(selectedApp.volumes ?? []).length === 0 ? <p className="text-sm text-neutral-500">No volumes.</p> : null}
                  {(selectedApp.volumes ?? []).map((volume, index) => {
                    const volumeType = volume.empty_dir ? "empty_dir" : volume.secret_name ? "secret" : volume.config_map_name ? "config_map" : "empty_dir";
                    return (
                      <div key={`${volume.name}-${index}`} className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 2xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto]">
                        <Input
                          value={volume.name}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index ? { ...item, name: event.target.value } : item,
                              ),
                            }))
                          }
                          placeholder="Volume name"
                        />
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={volumeType}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      name: item.name,
                                      empty_dir: event.target.value === "empty_dir" ? true : undefined,
                                      secret_name: event.target.value === "secret" ? item.secret_name ?? "app-secret" : undefined,
                                      config_map_name: event.target.value === "config_map" ? item.config_map_name ?? "app-config" : undefined,
                                    }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <option value="empty_dir">emptyDir</option>
                          <option value="secret">Secret</option>
                          <option value="config_map">ConfigMap</option>
                        </select>
                        <Input
                          value={volume.secret_name ?? volume.config_map_name ?? ""}
                          placeholder={volumeType === "secret" ? "Secret name" : volumeType === "config_map" ? "ConfigMap name" : "No extra value"}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      empty_dir: volumeType === "empty_dir" ? true : undefined,
                                      secret_name: volumeType === "secret" ? event.target.value : undefined,
                                      config_map_name: volumeType === "config_map" ? event.target.value : undefined,
                                    }
                                  : item,
                              ),
                            }))
                          }
                          disabled={volumeType === "empty_dir"}
                        />
                        <Button
                          variant="danger"
                          type="button"
                          onClick={() =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </EditorSection>

              <EditorSection
                title="Network Policy"
                summary="Dial ingress and egress up or down depending on which demo behavior you want to highlight."
              >
                <div className="grid gap-6">
                  <NetworkRulesEditor
                    direction="ingress"
                    value={selectedApp.network_policy?.ingress}
                    onChange={(ingress) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        network_policy: { ...current.network_policy, ingress },
                      }))
                    }
                  />
                  <NetworkRulesEditor
                    direction="egress"
                    value={selectedApp.network_policy?.egress}
                    onChange={(egress) =>
                      updateSelectedApp((current) => ({
                        ...current,
                        network_policy: { ...current.network_policy, egress },
                      }))
                    }
                  />
                </div>
              </EditorSection>
            </div>
          ) : null}
        </Modal>

      </div>
    </div>
  );
}
