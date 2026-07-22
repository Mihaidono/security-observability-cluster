import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { api, buildRunEventsUrl, getApiToken } from "./lib/api";
import type {
  AnalysisSubject,
  ContainerConfig,
  ConnectivityConfig,
  ExposureConfig,
  HealthResponse,
  IngressConfig,
  JsonObject,
  KyvernoClusterPolicyConfig,
  NetworkPolicyPeer,
  NetworkPolicyPort,
  NetworkPolicyRule,
  ProbeConfig,
  RunStage,
  TetragonTracingPolicyConfig,
  TerraformConfig,
  TerraformRun,
  VolumeConfig,
  VolumeMountConfig,
  WardApplication,
} from "./lib/types";

type Direction = "ingress" | "egress";
type AppTab = "deployment" | "assets" | "activity" | "accounts";
type DeploymentStage = "policies" | "applications" | "observability";
type ThemeMode = "light" | "dark";
type PolicyEngine = "kyverno" | "tetragon";
type PolicyFilter = "all" | PolicyEngine;
type AppTemplateId =
  "public-python-api" | "internal-python-api" | "static-site";
type ScenarioBlueprintId =
  | "public-ingress"
  | "east-west-allowed"
  | "east-west-blocked"
  | "blocked-egress-runtime"
  | "kyverno-deny-latest";

type AppReview = {
  errors: string[];
  warnings: string[];
  hints: string[];
  resources: string[];
  secretDependencies: string[];
};

type ScenarioContext = {
  namespace: string;
  bundleId: string;
  apps: WardApplication[];
  appByRole: (role: string) => WardApplication | undefined;
};

type ScenarioBlueprint = {
  id: ScenarioBlueprintId;
  title: string;
  description: string;
  tag: string;
  requirements: string;
  proofSurfaces: string[];
  caution?: string;
  build: (namespace: string, bundleId: string) => WardApplication[];
  commandSteps: (context: ScenarioContext) => string[];
  expectedSignals: (context: ScenarioContext) => string[];
};

type ActiveScenarioBundle = {
  bundleId: string;
  blueprint: ScenarioBlueprint;
  namespace: string;
  apps: WardApplication[];
};

type SelectedPolicyRef = {
  engine: PolicyEngine;
  id: string;
};

const SCENARIO_ID_LABEL = "isolens.io/scenario-id";
const SCENARIO_BUNDLE_LABEL = "isolens.io/scenario-bundle";
const SCENARIO_ROLE_LABEL = "isolens.io/scenario-role";
const themeStorageKey = "isolens-theme-mode";

function getInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function stageIsEffectivelyApplied(
  runs: TerraformRun[],
  stage: RunStage,
): boolean {
  for (const run of runs) {
    if (
      run.stage !== stage ||
      (run.kind !== "apply" && run.kind !== "destroy")
    ) {
      continue;
    }
    if (run.kind === "destroy" && run.status === "destroyed") {
      return false;
    }
    if (run.kind === "apply" && run.status === "applied") {
      return true;
    }
  }
  return false;
}

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
    "    for key, value in request.headers.items():",
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
    "      <p>Use it when you want a quick service and exposure sanity check before moving to a more dynamic workload.</p>",
    "      <p><code>/</code> should return this page through the service and edge path.</p>",
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
    exposure: {
      enabled: true,
      host: "public-python-api.lab.internal",
      path: "/",
      path_type: "Prefix",
    },
    connectivity: {
      internet_ingress_enabled: true,
      internet_egress_enabled: true,
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
    exposure: {
      enabled: false,
      host: "",
      path: "/",
      path_type: "Prefix",
    },
    connectivity: {
      internet_ingress_enabled: false,
      internet_egress_enabled: false,
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
    exposure: {
      enabled: true,
      host: "static-site-probe.lab.internal",
      path: "/",
      path_type: "Prefix",
    },
    connectivity: {
      internet_ingress_enabled: true,
      internet_egress_enabled: false,
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

function scenarioLabelSelector(
  bundleId: string,
  role: string,
): Record<string, string> {
  return {
    [SCENARIO_BUNDLE_LABEL]: bundleId,
    [SCENARIO_ROLE_LABEL]: role,
  };
}

function scenarioIdForApp(
  app: WardApplication | null | undefined,
): ScenarioBlueprintId | null {
  const value = app?.pod_labels?.[SCENARIO_ID_LABEL];
  if (
    value === "public-ingress" ||
    value === "east-west-allowed" ||
    value === "east-west-blocked" ||
    value === "blocked-egress-runtime" ||
    value === "kyverno-deny-latest"
  ) {
    return value;
  }
  return null;
}

function scenarioBundleForApp(
  app: WardApplication | null | undefined,
): string | null {
  return app?.pod_labels?.[SCENARIO_BUNDLE_LABEL] ?? null;
}

function scenarioRoleForApp(
  app: WardApplication | null | undefined,
): string | null {
  return app?.pod_labels?.[SCENARIO_ROLE_LABEL] ?? null;
}

function nextScenarioBundleId(
  blueprintId: ScenarioBlueprintId,
  applications: WardApplication[],
): string {
  const existingBundles = new Set(
    applications
      .map((application) => scenarioBundleForApp(application))
      .filter((bundleId): bundleId is string => Boolean(bundleId)),
  );

  let index = 0;
  let candidate: string = blueprintId;
  while (existingBundles.has(candidate)) {
    index += 1;
    candidate = `${blueprintId}-${index}`;
  }

  return candidate;
}

function withScenarioMetadata(
  app: WardApplication,
  scenarioId: ScenarioBlueprintId,
  bundleId: string,
  role: string,
): WardApplication {
  return {
    ...structuredClone(app),
    pod_labels: {
      ...(app.pod_labels ?? {}),
      [SCENARIO_ID_LABEL]: scenarioId,
      [SCENARIO_BUNDLE_LABEL]: bundleId,
      [SCENARIO_ROLE_LABEL]: role,
    },
  };
}

function buildScenarioContext(
  namespace: string,
  bundleId: string,
  apps: WardApplication[],
): ScenarioContext {
  return {
    namespace,
    bundleId,
    apps,
    appByRole: (role: string) =>
      apps.find(
        (application) => application.pod_labels?.[SCENARIO_ROLE_LABEL] === role,
      ),
  };
}

function makeToolboxApp(
  namespace: string,
  name: string,
  displayName: string,
  profile: string,
): WardApplication {
  return {
    name,
    namespace,
    replicas: 1,
    pod_labels: {
      app_role: "toolbox",
      expose_class: "cluster",
      scenario: profile,
    },
    pod_annotations: {},
    automount_service_account_token: false,
    allow_same_namespace_ingress: false,
    service: {
      enabled: false,
      type: "ClusterIP",
      port: 8080,
      target_port: 8080,
      annotations: {},
    },
    exposure: {
      enabled: false,
      host: "",
      path: "/",
      path_type: "Prefix",
    },
    connectivity: {
      internet_ingress_enabled: false,
      internet_egress_enabled: false,
    },
    config_map: {
      enabled: false,
      mount_path: "/tmp",
      data: {},
    },
    containers: [
      {
        name: "toolbox",
        image: "busybox:1.36",
        image_pull_policy: "IfNotPresent",
        port: 8080,
        command: ["sh", "-c", "while true; do sleep 3600; done"],
        args: [],
        env: {
          APP_DISPLAY_NAME: displayName,
          SCENARIO_NAME: name,
          SCENARIO_PROFILE: profile,
        },
        env_from_secret_names: [],
        probes: {
          readiness: emptyProbe(),
          liveness: emptyProbe(),
          startup: emptyProbe(),
        },
        resources: {
          requests_cpu: "50m",
          requests_memory: "64Mi",
          limits_cpu: "150m",
          limits_memory: "128Mi",
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
      ingress: [],
      egress: [],
    },
  };
}

function makeKyvernoLatestViolationApp(namespace: string): WardApplication {
  const app = makeStaticSiteApp(namespace);
  app.name = "kyverno-latest-violation";
  app.service = {
    ...app.service,
    enabled: false,
  };
  app.exposure = {
    ...app.exposure,
    enabled: false,
    host: "",
  };
  app.connectivity = {
    ...app.connectivity,
    internet_ingress_enabled: false,
  };
  app.allow_same_namespace_ingress = false;
  app.network_policy = {
    ingress: [],
    egress: [],
  };
  app.config_map = {
    ...app.config_map,
    enabled: false,
    data: {},
  };
  if (app.containers?.[0]) {
    app.containers[0] = {
      ...app.containers[0],
      image: "nginxinc/nginx-unprivileged:latest",
      env: {
        APP_DISPLAY_NAME: "Kyverno Latest Tag Violation",
        SCENARIO_NAME: "kyverno-latest-violation",
        SCENARIO_PROFILE: "kyverno-deny",
      },
    };
  }
  return app;
}

const scenarioBlueprints: Record<ScenarioBlueprintId, ScenarioBlueprint> = {
  "public-ingress": {
    id: "public-ingress",
    title: "Public Ingress Proof",
    description:
      "Provision a public FastAPI workload and prove the ingress path with a host-header curl plus Hubble evidence.",
    tag: "Ingress path",
    requirements: "Platform and applications apply",
    proofSurfaces: ["curl", "Hubble"],
    build(namespace, bundleId) {
      const app = withScenarioMetadata(
        makePublicPythonApiApp(namespace),
        "public-ingress",
        bundleId,
        "public-api",
      );
      app.name = "edge-public-api";
      app.replicas = 1;
      if (app.containers?.[0]) {
        app.containers[0] = {
          ...app.containers[0],
          env: {
            ...(app.containers[0].env ?? {}),
            APP_DISPLAY_NAME: "Edge Public API",
            SCENARIO_NAME: "public-ingress",
            SCENARIO_PROFILE: "ingress-path",
          },
        };
      }
      return [app];
    },
    commandSteps(context) {
      const app = context.appByRole("public-api");
      const ingressHost =
        appExposureHost(app) ||
        `${app?.name ?? "edge-public-api"}.lab.internal`;
      return [
        "kubectl -n kube-system port-forward svc/hubble-ui 12000:80",
        "LB=$(kubectl -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{.status.loadBalancer.ingress[0].ip}')",
        `curl -H 'Host: ${ingressHost}' "http://$LB/headers"`,
        `Open http://127.0.0.1:12000/?namespace=${context.namespace}`,
      ];
    },
    expectedSignals(context) {
      const app = context.appByRole("public-api");
      return [
        `The curl should return JSON headers from ${app?.name ?? "the public API"} instead of a DNS or 404 error.`,
        `Hubble should show ingress-nginx talking to ${app?.name ?? "the public API"} with an allowed verdict on port 80.`,
      ];
    },
  },
  "east-west-allowed": {
    id: "east-west-allowed",
    title: "Allowed East-West Call",
    description:
      "Spawn a client toolbox and an internal API with the exact policy needed for one successful same-namespace request.",
    tag: "Cilium allow",
    requirements: "Platform and applications apply",
    proofSurfaces: ["kubectl exec", "Hubble"],
    build(namespace, bundleId) {
      const api = withScenarioMetadata(
        makeInternalPythonApiApp(namespace),
        "east-west-allowed",
        bundleId,
        "api",
      );
      api.name = "mesh-allowed-api";
      api.allow_same_namespace_ingress = true;
      if (api.containers?.[0]) {
        api.containers[0] = {
          ...api.containers[0],
          env: {
            ...(api.containers[0].env ?? {}),
            APP_DISPLAY_NAME: "Allowed East-West API",
            SCENARIO_NAME: "east-west-allowed",
            SCENARIO_PROFILE: "mesh-allow",
          },
        };
      }

      const client = withScenarioMetadata(
        makeToolboxApp(
          namespace,
          "mesh-allowed-client",
          "Allowed East-West Client",
          "mesh-allow",
        ),
        "east-west-allowed",
        bundleId,
        "client",
      );
      client.network_policy = {
        ingress: [],
        egress: [
          {
            ports: [{ port: 80, protocol: "TCP" }],
            to: [{ pod_selector: scenarioLabelSelector(bundleId, "api") }],
          },
        ],
      };

      return [client, api];
    },
    commandSteps(context) {
      const client = context.appByRole("client");
      const api = context.appByRole("api");
      return [
        "kubectl -n kube-system port-forward svc/hubble-ui 12000:80",
        `kubectl -n ${context.namespace} exec deploy/${client?.name ?? "mesh-allowed-client"} -- sh -c 'wget -T 5 -qO- http://${api?.name ?? "mesh-allowed-api"}-svc/headers'`,
        `Open http://127.0.0.1:12000/?namespace=${context.namespace}`,
      ];
    },
    expectedSignals(context) {
      const client = context.appByRole("client");
      const api = context.appByRole("api");
      return [
        `The client command should return JSON from ${api?.name ?? "the API"} instead of timing out.`,
        `Hubble should show green or allowed flow records from ${client?.name ?? "the client"} to ${api?.name ?? "the API"} on port 80.`,
      ];
    },
  },
  "east-west-blocked": {
    id: "east-west-blocked",
    title: "Blocked East-West Call",
    description:
      "Spawn a client toolbox and an internal API that refuses same-namespace ingress so you can capture a clear dropped flow.",
    tag: "Cilium deny",
    requirements: "Platform and applications apply",
    proofSurfaces: ["kubectl exec", "Hubble"],
    build(namespace, bundleId) {
      const api = withScenarioMetadata(
        makeInternalPythonApiApp(namespace),
        "east-west-blocked",
        bundleId,
        "api",
      );
      api.name = "mesh-blocked-api";
      api.allow_same_namespace_ingress = false;
      if (api.containers?.[0]) {
        api.containers[0] = {
          ...api.containers[0],
          env: {
            ...(api.containers[0].env ?? {}),
            APP_DISPLAY_NAME: "Blocked East-West API",
            SCENARIO_NAME: "east-west-blocked",
            SCENARIO_PROFILE: "mesh-deny",
          },
        };
      }

      const client = withScenarioMetadata(
        makeToolboxApp(
          namespace,
          "mesh-blocked-client",
          "Blocked East-West Client",
          "mesh-deny",
        ),
        "east-west-blocked",
        bundleId,
        "client",
      );
      client.network_policy = {
        ingress: [],
        egress: [
          {
            ports: [{ port: 80, protocol: "TCP" }],
            to: [{ pod_selector: scenarioLabelSelector(bundleId, "api") }],
          },
        ],
      };

      return [client, api];
    },
    commandSteps(context) {
      const client = context.appByRole("client");
      const api = context.appByRole("api");
      return [
        "kubectl -n kube-system port-forward svc/hubble-ui 12000:80",
        `kubectl -n ${context.namespace} exec deploy/${client?.name ?? "mesh-blocked-client"} -- sh -c 'wget -T 5 -qO- http://${api?.name ?? "mesh-blocked-api"}-svc/headers || true'`,
        `Open http://127.0.0.1:12000/?namespace=${context.namespace}`,
      ];
    },
    expectedSignals(context) {
      const client = context.appByRole("client");
      const api = context.appByRole("api");
      return [
        "The client command should fail or time out because the destination workload no longer allows same-namespace ingress.",
        `Hubble should show dropped traffic from ${client?.name ?? "the client"} to ${api?.name ?? "the API"} on port 80.`,
      ];
    },
  },
  "blocked-egress-runtime": {
    id: "blocked-egress-runtime",
    title: "Blocked Internet Egress",
    description:
      "Deploy a toolbox pod with no outbound allowlist so you can capture a blocked internet call and suspicious exec activity.",
    tag: "Cilium + Tetragon",
    requirements: "Platform and applications apply",
    proofSurfaces: ["kubectl exec", "Hubble", "Tetragon logs"],
    build(namespace, bundleId) {
      return [
        withScenarioMetadata(
          makeToolboxApp(
            namespace,
            "runtime-blocked-egress",
            "Blocked Egress Toolbox",
            "runtime-blocked-egress",
          ),
          "blocked-egress-runtime",
          bundleId,
          "toolbox",
        ),
      ];
    },
    commandSteps(context) {
      const toolbox = context.appByRole("toolbox");
      return [
        "kubectl -n kube-system port-forward svc/hubble-ui 12000:80",
        `kubectl -n ${context.namespace} exec deploy/${toolbox?.name ?? "runtime-blocked-egress"} -- sh -c 'wget -T 5 -qO- http://example.com || true'`,
        `kubectl -n kube-system logs -l app.kubernetes.io/name=tetragon -c export-stdout --since=2m | grep -E '${context.namespace}|${toolbox?.name ?? "runtime-blocked-egress"}|wget|sh|busybox'`,
        `Open http://127.0.0.1:12000/?namespace=${context.namespace}`,
      ];
    },
    expectedSignals() {
      return [
        "The wget command should fail because the ward keeps default-deny egress and this toolbox does not get an outbound allowlist.",
        "Hubble should show dropped flows toward the external destination on port 80.",
        "After the platform stage is applied, Tetragon logs should include the sh and wget exec chain from the toolbox pod.",
      ];
    },
  },
  "kyverno-deny-latest": {
    id: "kyverno-deny-latest",
    title: "Kyverno Latest Tag Deny",
    description:
      "Add a deliberately violating workload that uses a latest tag so the policy layer can block it and leave proof in your run logs.",
    tag: "Kyverno deny",
    requirements: "Platform and applications apply",
    proofSurfaces: ["Activity logs", "Kyverno logs", "Events"],
    caution:
      "This scenario is meant to fail. Remove the violating app after you capture the evidence so normal platform applies can succeed again.",
    build(namespace, bundleId) {
      return [
        withScenarioMetadata(
          makeKyvernoLatestViolationApp(namespace),
          "kyverno-deny-latest",
          bundleId,
          "violator",
        ),
      ];
    },
    commandSteps(context) {
      return [
        "Run applications apply after the platform stage is already healthy.",
        `kubectl get events -n ${context.namespace} --sort-by=.lastTimestamp | tail -n 20`,
        "kubectl -n kyverno logs deploy/kyverno-admission-controller --tail=120",
      ];
    },
    expectedSignals(context) {
      const violator = context.appByRole("violator");
      return [
        `The applications apply should fail or stall around ${violator?.name ?? "the violating workload"} instead of creating a healthy deployment.`,
        "Activity -> Run Logs should contain the admission or rollout failure, and Kyverno logs/events should mention the latest-tag policy.",
      ];
    },
  },
};

const scenarioBlueprintList = Object.values(scenarioBlueprints);

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
    exposure: {
      enabled: false,
      host: "",
      path: "/",
      path_type: "Prefix",
    },
    connectivity: {
      internet_ingress_enabled: false,
      internet_egress_enabled: false,
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

function makeRequireWardSubjectPolicy(): KyvernoClusterPolicyConfig {
  return {
    id: "require-ward-subject-label",
    name: "Require ward subject label",
    description:
      "Require pods deployed into ward namespaces to carry the isolens.io/subject label.",
    enabled: true,
    manifest: {
      apiVersion: "kyverno.io/v1",
      kind: "ClusterPolicy",
      metadata: {
        name: "require-ward-subject-label",
      },
      spec: {
        background: true,
        rules: [
          {
            name: "pods-in-wards-must-carry-subject-label",
            match: {
              any: [
                {
                  resources: {
                    kinds: ["Pod"],
                    namespaceSelector: {
                      matchExpressions: [
                        {
                          key: "analysis-tier",
                          operator: "Exists",
                        },
                      ],
                    },
                  },
                },
              ],
            },
            validate: {
              failureAction: "Enforce",
              message:
                "Pods deployed into ward namespaces must declare the isolens.io/subject label.",
              pattern: {
                metadata: {
                  labels: {
                    "isolens.io/subject": "?*",
                  },
                },
              },
            },
          },
        ],
      },
    },
  };
}

function makeDisallowLatestTagPolicy(): KyvernoClusterPolicyConfig {
  return {
    id: "disallow-latest-tag-in-wards",
    name: "Disallow latest image tags",
    description: "Deny ward workloads that use mutable latest tags.",
    enabled: true,
    manifest: {
      apiVersion: "kyverno.io/v1",
      kind: "ClusterPolicy",
      metadata: {
        name: "disallow-latest-tag-in-wards",
      },
      spec: {
        background: true,
        rules: [
          {
            name: "disallow-latest-image-tags",
            match: {
              any: [
                {
                  resources: {
                    kinds: ["Pod"],
                    namespaceSelector: {
                      matchExpressions: [
                        {
                          key: "analysis-tier",
                          operator: "Exists",
                        },
                      ],
                    },
                  },
                },
              ],
            },
            validate: {
              failureAction: "Enforce",
              message:
                "Ward workloads must pin container images and may not use the latest tag.",
              foreach: [
                {
                  list: "request.object.spec.containers",
                  deny: {
                    conditions: {
                      any: [
                        {
                          key: "{{ contains(element.image, ':latest') }}",
                          operator: "Equals",
                          value: true,
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function makeSuspiciousExecTracingPolicy(): TetragonTracingPolicyConfig {
  return {
    id: "suspicious-exec",
    name: "Suspicious exec tracing",
    description:
      "Trace suspicious network and shell executions in every ward namespace.",
    enabled: true,
    scope: "all-wards",
    manifest: {
      apiVersion: "cilium.io/v1alpha1",
      kind: "TracingPolicyNamespaced",
      metadata: {
        name: "suspicious-exec",
      },
      spec: {
        kprobes: [
          {
            call: "sys_execve",
            syscall: true,
            selectors: [
              {
                matchBinaries: [
                  {
                    operator: "In",
                    values: [
                      "/usr/bin/curl",
                      "/usr/bin/wget",
                      "/bin/wget",
                      "/bin/curl",
                      "/usr/bin/nc",
                      "/bin/nc",
                    ],
                  },
                ],
                matchActions: [{ action: "Post" }],
              },
              {
                matchBinaries: [
                  {
                    operator: "In",
                    values: [
                      "/bin/sh",
                      "/bin/bash",
                      "/usr/bin/bash",
                      "/usr/bin/sh",
                    ],
                  },
                ],
                matchActions: [{ action: "Post" }],
              },
            ],
          },
        ],
      },
    },
  };
}

function makeCustomKyvernoPolicy(): KyvernoClusterPolicyConfig {
  return {
    id: `kyverno-policy-${Date.now()}`,
    name: "Custom Kyverno policy",
    description: "Author a custom Kyverno ClusterPolicy manifest.",
    enabled: true,
    manifest: {
      apiVersion: "kyverno.io/v1",
      kind: "ClusterPolicy",
      metadata: {
        name: "custom-kyverno-policy",
      },
      spec: {
        background: true,
        rules: [],
      },
    },
  };
}

function makeCustomTetragonPolicy(): TetragonTracingPolicyConfig {
  return {
    id: `tetragon-policy-${Date.now()}`,
    name: "Custom Tetragon policy",
    description: "Author a custom Tetragon tracing policy manifest.",
    enabled: true,
    scope: "all-wards",
    manifest: {
      apiVersion: "cilium.io/v1alpha1",
      kind: "TracingPolicyNamespaced",
      metadata: {
        name: "custom-tetragon-policy",
      },
      spec: {
        kprobes: [],
      },
    },
  };
}

function normalizeExposure(
  exposure?: ExposureConfig,
  ingress?: IngressConfig,
): ExposureConfig {
  return {
    enabled: exposure?.enabled ?? ingress?.enabled ?? false,
    host: exposure?.host ?? ingress?.host ?? "",
    path: exposure?.path ?? ingress?.path ?? "/",
    path_type: exposure?.path_type ?? ingress?.path_type ?? "Prefix",
    tls_secret_name:
      exposure?.tls_secret_name ?? ingress?.tls_secret_name ?? "",
  };
}

function normalizeConnectivity(
  connectivity?: ConnectivityConfig,
  exposure?: ExposureConfig,
  ingress?: IngressConfig,
): ConnectivityConfig {
  return {
    internet_ingress_enabled:
      connectivity?.internet_ingress_enabled ??
      exposure?.enabled ??
      ingress?.enabled ??
      false,
    internet_egress_enabled: connectivity?.internet_egress_enabled ?? false,
  };
}

function normalizeWardApplication(app: WardApplication): WardApplication {
  const { ingress: legacyIngress, ...next } = structuredClone(app);
  return {
    ...next,
    exposure: normalizeExposure(app.exposure, legacyIngress),
    connectivity: normalizeConnectivity(
      app.connectivity,
      app.exposure,
      legacyIngress,
    ),
  };
}

function normalizeTerraformConfig(config: TerraformConfig): TerraformConfig {
  return {
    ...config,
    policies: {
      kyverno_cluster_policies: config.policies?.kyverno_cluster_policies ?? [
        makeRequireWardSubjectPolicy(),
        makeDisallowLatestTagPolicy(),
      ],
      tetragon_tracing_policies: config.policies?.tetragon_tracing_policies ?? [
        makeSuspiciousExecTracingPolicy(),
      ],
    },
    applications: {
      ...config.applications,
      ward_applications: (config.applications.ward_applications ?? []).map(
        normalizeWardApplication,
      ),
    },
  };
}

function appExposureEnabled(app: WardApplication | null | undefined): boolean {
  return app?.exposure?.enabled ?? app?.ingress?.enabled ?? false;
}

function appExposureHost(app: WardApplication | null | undefined): string {
  return app?.exposure?.host ?? app?.ingress?.host ?? "";
}

function appExposurePath(app: WardApplication | null | undefined): string {
  return app?.exposure?.path ?? app?.ingress?.path ?? "/";
}

function appExposurePathType(app: WardApplication | null | undefined): string {
  return app?.exposure?.path_type ?? app?.ingress?.path_type ?? "Prefix";
}

function appExposureTlsSecret(app: WardApplication | null | undefined): string {
  return app?.exposure?.tls_secret_name ?? app?.ingress?.tls_secret_name ?? "";
}

function appInternetIngressEnabled(
  app: WardApplication | null | undefined,
): boolean {
  return app?.connectivity?.internet_ingress_enabled ?? appExposureEnabled(app);
}

function appInternetEgressEnabled(
  app: WardApplication | null | undefined,
): boolean {
  return app?.connectivity?.internet_egress_enabled ?? false;
}

function classNames(
  ...values: Array<string | false | null | undefined>
): string {
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
    const record = entry as {
      value?: unknown;
      sensitive?: unknown;
      type?: unknown;
    };
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

function normalizeTerraformOutputs(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const filteredEntries = Object.entries(
    value as Record<string, unknown>,
  ).filter(([, entry]) => {
    if (entry == null) {
      return false;
    }

    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      "value" in entry &&
      (entry as { value?: unknown }).value == null
    ) {
      return false;
    }

    return true;
  });

  return filteredEntries.length > 0
    ? Object.fromEntries(filteredEntries)
    : null;
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

    const diagnostic =
      typeof parsed.diagnostic === "object" && parsed.diagnostic
        ? (parsed.diagnostic as Record<string, unknown>)
        : null;
    const snippet =
      typeof diagnostic?.snippet === "object" && diagnostic.snippet
        ? (diagnostic.snippet as Record<string, unknown>)
        : null;
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
  if (normalized === "error" || normalized === "fatal")
    return "border-warning/40 bg-warning/16 text-foreground";
  if (normalized === "warn" || normalized === "warning")
    return "border-border/60 bg-border/20 text-foreground";
  if (normalized === "debug" || normalized === "trace")
    return "border-border/70 bg-card/70 text-foreground/80";
  return "border-accent/30 bg-accent/12 text-accent";
}

function sortRuns(runs: TerraformRun[]): TerraformRun[] {
  return [...runs].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );
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
    Object.entries(value ?? {}).filter(
      ([key, entryValue]) =>
        key.trim() !== "" || String(entryValue).trim() !== "",
    ),
  );
}

function primaryContainer(
  app: WardApplication | null | undefined,
): ContainerConfig | null {
  return app?.containers?.[0] ?? null;
}

function appSecretDependencies(
  app: WardApplication | null | undefined,
): string[] {
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

  if (appExposureTlsSecret(app).trim()) {
    secretRefs.add(appExposureTlsSecret(app).trim());
  }

  return [...secretRefs];
}

function hasIngressNamespaceAccess(
  app: WardApplication | null | undefined,
): boolean {
  if (!appExposureEnabled(app)) return true;

  const ingressRules = app?.network_policy?.ingress ?? [];

  return ingressRules.some((rule) =>
    (rule.from ?? []).some(
      (peer) =>
        peer.namespace_selector?.["kubernetes.io/metadata.name"] ===
        "ingress-nginx",
    ),
  );
}

function buildAppReview(
  app: WardApplication | null | undefined,
  subjectNames: string[],
): AppReview {
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
    errors.push(
      "Application name must be a valid Kubernetes name using lowercase letters, numbers, and hyphens.",
    );
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

    if (
      (firstContainer.probes?.readiness?.enabled ||
        firstContainer.probes?.liveness?.enabled) &&
      !firstContainer.probes?.readiness?.path
    ) {
      warnings.push(
        "Health probes are enabled, but the readiness path is empty.",
      );
    }

    if ((firstContainer.env_from_secret_names ?? []).length > 0) {
      warnings.push(
        "Secret env sources are referenced here, but the interface does not create those secrets for you.",
      );
    }
  }

  if (app.service?.enabled !== false) {
    resources.push("Service");
    if (!app.service?.port || !app.service?.target_port) {
      errors.push(
        "Service-backed apps need both a service port and a target port.",
      );
    }
  }

  if (appExposureEnabled(app)) {
    resources.push("Internet exposure");
    if (app.service?.enabled === false) {
      errors.push("Internet exposure needs the service to stay enabled.");
    }
    if (!appExposureHost(app).trim()) {
      errors.push("Internet exposure is enabled, but the host is empty.");
    }
    if (!appInternetIngressEnabled(app)) {
      warnings.push(
        "The route is enabled, but internet ingress is disabled in connectivity settings.",
      );
    }
    if (!hasIngressNamespaceAccess(app)) {
      warnings.push(
        "Internet exposure is enabled, but the current app-level network policy does not appear to allow traffic from the shared ingress controller namespace.",
      );
    }
  }

  if (appInternetEgressEnabled(app)) {
    hints.push(
      "Internet egress is enabled in the app contract. Later phases will render Cilium-aware egress policy from this flag.",
    );
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

  if (
    (app.network_policy?.ingress ?? []).length > 0 ||
    (app.network_policy?.egress ?? []).length > 0
  ) {
    resources.push("Network policies");
  }

  const volumeNames = new Set((app.volumes ?? []).map((volume) => volume.name));
  for (const container of app.containers ?? []) {
    for (const mount of container.volume_mounts ?? []) {
      if (!volumeNames.has(mount.name)) {
        errors.push(
          `Container "${container.name}" mounts volume "${mount.name}", but that volume is not defined.`,
        );
      }
      if (!mount.mount_path?.trim()) {
        errors.push(
          `Container "${container.name}" has a volume mount without a mount path.`,
        );
      }
    }
  }

  if (secretDependencies.length > 0) {
    warnings.push(
      "This app depends on existing Kubernetes secrets. Make sure they already exist before you deploy.",
    );
  }

  if ((app.containers ?? []).length > 1) {
    hints.push(
      "Only the first container automatically gets the generated ConfigMap mount from the simple builder path.",
    );
  }

  if (
    app.service?.enabled !== false &&
    app.allow_same_namespace_ingress === false
  ) {
    warnings.push(
      "Same-namespace ingress is disabled, so service reachability will rely entirely on your explicit network policy rules.",
    );
  }

  if (errors.length === 0 && warnings.length === 0) {
    hints.push(
      "This app looks deployable from the interface without extra manual cluster objects.",
    );
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

function displayExposureSummary(
  app: WardApplication | null | undefined,
): string {
  if (!app) return "Not configured";
  if (appExposureEnabled(app)) {
    return appExposureHost(app).trim() || "Internet exposure enabled";
  }
  return "Cluster-internal";
}

function KeyValueEditor({
  label,
  value,
  onChange,
  addLabel = "Add row",
  rowsClassName,
}: {
  label: string;
  value?: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  addLabel?: string;
  rowsClassName?: string;
}) {
  const entries = Object.entries(value ?? {});

  function updateRow(index: number, nextKey: string, nextValue: string) {
    const rows = entries.map(([key, currentValue], rowIndex) =>
      rowIndex === index ? [nextKey, nextValue] : [key, currentValue],
    );
    onChange(
      Object.fromEntries(
        rows.filter(
          ([key, currentValue]) =>
            key.trim() !== "" || currentValue.trim() !== "",
        ),
      ),
    );
  }

  function addRow() {
    const nextKey = uniqueName(
      "key",
      entries.map(([key]) => key),
    );
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={addRow}
        >
          {addLabel}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No entries.</p>
      ) : null}
      <div className={classNames("grid gap-2", rowsClassName)}>
        {entries.map(([entryKey, entryValue], index) => (
          <div
            key={`kv-row-${index}`}
            className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Input
              value={entryKey}
              onChange={(event) =>
                updateRow(index, event.target.value, entryValue)
              }
              placeholder="Key"
            />
            <Input
              value={entryValue}
              onChange={(event) =>
                updateRow(index, entryKey, event.target.value)
              }
              placeholder="Value"
            />
            <Button
              variant="danger"
              type="button"
              onClick={() => removeRow(index)}
            >
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
    const next = items.map((item, itemIndex) =>
      itemIndex === index ? nextValue : item,
    );
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={addItem}
        >
          {addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">No entries.</p>
      ) : null}
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={`string-row-${index}`}
            className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto]"
          >
            <Input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
            />
            <Button
              variant="danger"
              type="button"
              onClick={() => removeItem(index)}
            >
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
            onChange={(event) =>
              onChange({ ...probe, enabled: event.target.checked })
            }
          />
          Enabled
        </label>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Path</span>
          <Input
            value={probe.path ?? ""}
            onChange={(event) =>
              onChange({ ...probe, path: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Port</span>
          <Input
            type="number"
            value={String(probe.port ?? 8080)}
            onChange={(event) =>
              onChange({ ...probe, port: Number(event.target.value) })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Initial delay</span>
          <Input
            type="number"
            value={String(probe.initial_delay_seconds ?? 5)}
            onChange={(event) =>
              onChange({
                ...probe,
                initial_delay_seconds: Number(event.target.value),
              })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Period</span>
          <Input
            type="number"
            value={String(probe.period_seconds ?? 10)}
            onChange={(event) =>
              onChange({ ...probe, period_seconds: Number(event.target.value) })
            }
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
    onChange(
      mounts.map((mount, mountIndex) => (mountIndex === index ? next : mount)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Volume mounts
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() =>
            onChange([...mounts, { name: "shared-data", mount_path: "/data" }])
          }
        >
          Add mount
        </Button>
      </div>
      {mounts.length === 0 ? (
        <p className="text-sm text-neutral-500">No mounts.</p>
      ) : null}
      <div className="grid gap-2">
        {mounts.map((mount, index) => (
          <div
            key={`mount-row-${index}`}
            className="grid gap-2 rounded-2xl border border-border bg-muted/60 p-3"
          >
            <div className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_160px_auto]">
              <Input
                value={mount.name}
                onChange={(event) =>
                  updateMount(index, { ...mount, name: event.target.value })
                }
                placeholder="Volume name"
              />
              <Input
                value={mount.mount_path}
                onChange={(event) =>
                  updateMount(index, {
                    ...mount,
                    mount_path: event.target.value,
                  })
                }
                placeholder="/mount/path"
              />
              <Input
                value={mount.sub_path ?? ""}
                onChange={(event) =>
                  updateMount(index, {
                    ...mount,
                    sub_path: event.target.value || undefined,
                  })
                }
                placeholder="subPath (optional)"
              />
              <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={mount.read_only ?? true}
                  onChange={(event) =>
                    updateMount(index, {
                      ...mount,
                      read_only: event.target.checked,
                    })
                  }
                />
                Read only
              </label>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(
                    mounts.filter((_, mountIndex) => mountIndex !== index),
                  )
                }
              >
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
    onChange(
      ports.map((port, portIndex) => (portIndex === index ? next : port)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Ports
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...ports, emptyPolicyPort()])}
        >
          Add port
        </Button>
      </div>
      {ports.length === 0 ? (
        <p className="text-sm text-neutral-500">No ports.</p>
      ) : null}
      <div className="grid gap-2">
        {ports.map((port, index) => (
          <div
            key={`port-row-${index}`}
            className="grid gap-2 2xl:grid-cols-[minmax(0,1fr)_160px_auto]"
          >
            <Input
              type="number"
              value={String(port.port)}
              onChange={(event) =>
                updatePort(index, { ...port, port: Number(event.target.value) })
              }
            />
            <Input
              value={port.protocol ?? "TCP"}
              onChange={(event) =>
                updatePort(index, { ...port, protocol: event.target.value })
              }
            />
            <Button
              variant="danger"
              type="button"
              onClick={() =>
                onChange(ports.filter((_, portIndex) => portIndex !== index))
              }
            >
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
    onChange(
      peers.map((peer, peerIndex) => (peerIndex === index ? next : peer)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          {direction === "ingress" ? "Sources" : "Destinations"}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...peers, emptyPolicyPeer()])}
        >
          Add peer
        </Button>
      </div>
      {peers.length === 0 ? (
        <p className="text-sm text-neutral-500">No peers.</p>
      ) : null}
      <div className="grid gap-3">
        {peers.map((peer, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border bg-muted/60 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Peer {index + 1}</p>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(peers.filter((_, peerIndex) => peerIndex !== index))
                }
              >
                Remove
              </Button>
            </div>
            <div className="grid gap-4">
              <KeyValueEditor
                label="Pod selector"
                value={peer.pod_selector ?? {}}
                onChange={(next) =>
                  updatePeer(index, {
                    ...peer,
                    pod_selector: compactRecord(next),
                  })
                }
                addLabel="Add label"
              />
              <KeyValueEditor
                label="Namespace selector"
                value={peer.namespace_selector ?? {}}
                onChange={(next) =>
                  updatePeer(index, {
                    ...peer,
                    namespace_selector: compactRecord(next),
                  })
                }
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
                      ip_block:
                        event.target.value.trim() === ""
                          ? undefined
                          : { cidr: event.target.value },
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
    onChange(
      rules.map((rule, ruleIndex) => (ruleIndex === index ? next : rule)),
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {direction === "ingress" ? "Ingress rules" : "Egress rules"}
        </p>
        <Button
          variant="ghost"
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => onChange([...rules, emptyPolicyRule(direction)])}
        >
          Add rule
        </Button>
      </div>
      {rules.length === 0 ? (
        <p className="text-sm text-neutral-500">No rules.</p>
      ) : null}
      <div className="grid gap-4">
        {rules.map((rule, index) => (
          <div key={index} className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">Rule {index + 1}</p>
              <Button
                variant="danger"
                type="button"
                onClick={() =>
                  onChange(rules.filter((_, ruleIndex) => ruleIndex !== index))
                }
              >
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
            <Input
              value={container.name}
              onChange={(event) =>
                onChange({ ...container, name: event.target.value })
              }
            />
          </label>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span>Image</span>
            <Input
              value={container.image}
              onChange={(event) =>
                onChange({ ...container, image: event.target.value })
              }
            />
          </label>
        </div>

        <div className="grid gap-3 2xl:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span>Port</span>
            <Input
              type="number"
              value={String(container.port ?? 8080)}
              onChange={(event) =>
                onChange({ ...container, port: Number(event.target.value) })
              }
            />
          </label>
          <StringListEditor
            label="Command"
            value={container.command}
            onChange={(command) => onChange({ ...container, command })}
            addLabel="Add command"
          />
          <StringListEditor
            label="Args"
            value={container.args}
            onChange={(args) => onChange({ ...container, args })}
            addLabel="Add arg"
          />
        </div>

        <KeyValueEditor
          label="Environment variables"
          value={container.env ?? {}}
          onChange={(env) =>
            onChange({ ...container, env: compactRecord(env) })
          }
          addLabel="Add env"
        />

        <StringListEditor
          label="Secret env sources"
          value={container.env_from_secret_names}
          onChange={(env_from_secret_names) =>
            onChange({ ...container, env_from_secret_names })
          }
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
              onChange={(event) =>
                onChange({
                  ...container,
                  image_pull_policy: event.target.value,
                })
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>CPU request</span>
            <Input
              value={container.resources?.requests_cpu ?? ""}
              onChange={(event) =>
                onChange({
                  ...container,
                  resources: {
                    ...container.resources,
                    requests_cpu: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    requests_memory: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    limits_cpu: event.target.value,
                  },
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
                  resources: {
                    ...container.resources,
                    limits_memory: event.target.value,
                  },
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
              checked={
                container.security_context?.read_only_root_filesystem ?? false
              }
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
          onChange={(volume_mounts) =>
            onChange({ ...container, volume_mounts })
          }
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
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/28 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="panel flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2.2rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              Workspace Context
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

function statusTone(
  status?: TerraformRun["status"],
): "primary" | "secondary" | "ghost" | "danger" {
  if (status === "planned" || status === "applied" || status === "destroyed")
    return "primary";
  if (status === "failed" || status === "canceled") return "danger";
  if (
    status === "running" ||
    status === "applying" ||
    status === "destroying" ||
    status === "canceling"
  )
    return "secondary";
  return "ghost";
}

function stageLabel(stage: RunStage): string {
  if (stage === "core") return "Core";
  if (stage === "platform") return "Platform";
  if (stage === "policies") return "Policies";
  return "Applications";
}

function isTerminalRunStatus(status?: TerraformRun["status"]): boolean {
  return (
    status === "planned" ||
    status === "applied" ||
    status === "destroyed" ||
    status === "failed" ||
    status === "canceled"
  );
}

function MetricTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={classNames(
        "relative overflow-hidden rounded-[1.55rem] border border-border/55 bg-card/82 px-4 py-4 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]",
        className,
      )}
    >
      <div className="absolute inset-x-4 top-0 h-px bg-card/60" />
      <p className="metric-label text-[11px] uppercase tracking-[0.24em]">
        {label}
      </p>
      <p className="metric-value mt-4 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="metric-hint mt-2 text-sm leading-6">{hint}</p>
      ) : null}
    </div>
  );
}

function BrandGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 6.5h14" />
      <path d="M5 12h14" />
      <path d="M5 17.5h9" />
      <circle cx="17.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SunIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2" />
      <path d="M12 19.3v2.2" />
      <path d="m4.9 4.9 1.6 1.6" />
      <path d="m17.5 17.5 1.6 1.6" />
      <path d="M2.5 12h2.2" />
      <path d="M19.3 12h2.2" />
      <path d="m4.9 19.1 1.6-1.6" />
      <path d="m17.5 6.5 1.6-1.6" />
    </svg>
  );
}

function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 14.2A7.8 7.8 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z" />
    </svg>
  );
}

function ClusterStatusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="5" rx="1.5" />
      <rect x="4" y="14" width="16" height="5" rx="1.5" />
      <path d="M8 7.5h.01" />
      <path d="M8 16.5h.01" />
      <path d="M11 7.5h5" />
      <path d="M11 16.5h5" />
    </svg>
  );
}

function AccountIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9.5 4h5" />
      <path d="M18 7l-1 12a2 2 0 0 1-2 1H9a2 2 0 0 1-2-1L6 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

function FilterIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

function IconActionButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={classNames(
        "inline-flex h-11 w-11 items-center justify-center rounded-full border transition duration-200",
        active
          ? "border-accent/45 bg-accent/16 text-accent shadow-[0_12px_28px_rgb(var(--color-accent)_/_0.22)]"
          : "border-border/50 bg-card/76 text-foreground/72 hover:bg-accent/10 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ContextTag({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-soft shrink-0 flex items-center gap-2 rounded-full px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
        {label}
      </span>
      <span className="context-value text-sm font-medium">{value}</span>
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
        ? "border-border/55 bg-border/14 text-foreground"
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
  compact = false,
  onApply,
}: {
  title: string;
  description: string;
  tag: string;
  actionLabel?: string;
  compact?: boolean;
  onApply: () => void;
}) {
  const compactDescription =
    compact && description.length > 82
      ? `${description.slice(0, 79).trimEnd()}...`
      : description;

  return (
    <div
      className={classNames(
        "flex shrink-0 snap-start flex-col justify-between rounded-[1.5rem] border border-border/80 bg-card/80 p-4",
        compact
          ? "min-h-[188px] min-w-[220px] max-w-[220px]"
          : "min-h-[232px] min-w-[280px] max-w-[280px]",
      )}
    >
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-2 inline-flex rounded-full border border-border/75 bg-muted/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
          {tag}
        </p>
        <p
          className={classNames(
            "mt-3 text-neutral-500",
            compact ? "text-[13px] leading-5" : "text-sm leading-6",
          )}
        >
          {compact ? compactDescription : description}
        </p>
      </div>
      <Button
        className={classNames("self-start", compact ? "mt-4" : "mt-5")}
        variant="secondary"
        type="button"
        onClick={onApply}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function ScenarioPlaybookCard({
  title,
  tag,
  requirements,
  proofSurfaces,
  caution,
  appNames,
  commands,
  expectedSignals,
}: {
  title: string;
  tag: string;
  requirements: string;
  proofSurfaces: string[];
  caution?: string;
  appNames: string[];
  commands: string[];
  expectedSignals: string[];
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/80 bg-card/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {requirements}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{tag}</Badge>
          {proofSurfaces.map((surface) => (
            <Badge
              key={surface}
              className="border-border/70 bg-muted/60 text-foreground/75"
            >
              {surface}
            </Badge>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-[1rem] border border-border/70 bg-muted/45 p-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Provisioned apps
          </p>
          <p className="mt-2 text-sm text-foreground/80">
            {appNames.join(", ")}
          </p>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Run these
          </p>
          <div className="mt-3 grid gap-3">
            {commands.map((command) => (
              <pre
                key={command}
                className="themed-scrollbar overflow-auto rounded-[1rem] border border-border/70 bg-card/82 px-4 py-3 font-mono text-xs leading-6 text-foreground"
              >
                {command}
              </pre>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
            Capture this proof
          </p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-foreground/80">
            {expectedSignals.map((signal, index) => (
              <p key={`${title}-signal-${index}`}>{signal}</p>
            ))}
          </div>
        </div>

        {caution ? (
          <div className="rounded-[1rem] border border-warning/35 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
            {caution}
          </div>
        ) : null}
      </div>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border/55 bg-card/76 px-4 py-3 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}

function CommandBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-border/55 bg-card/76 px-4 py-4 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.14)]">
      <p className="text-[11px] uppercase tracking-[0.24em] text-neutral-500">
        {label}
      </p>
      <pre className="themed-scrollbar mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[1rem] border border-border/55 bg-background/58 px-3 py-3 font-mono text-xs leading-6 text-foreground/85">
        {value}
      </pre>
      {hint ? (
        <p className="mt-2 text-sm leading-6 text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

function PolicyManifestEditor({
  value,
  onCommit,
}: {
  value: JsonObject;
  onCommit: (next: JsonObject) => void;
}) {
  const [draft, setDraft] = useState(prettyPrint(value));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(prettyPrint(value));
    setError("");
  }, [value]);

  function commitDraft() {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        setError("Manifest must be a JSON object.");
        return;
      }
      onCommit(parsed as JsonObject);
      setError("");
    } catch {
      setError("Manifest must be valid JSON before it can be saved.");
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Manifest JSON
        </p>
        <Button variant="secondary" type="button" onClick={commitDraft}>
          Update draft
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-[24rem] font-mono text-xs leading-6"
      />
      {error ? (
        <p className="text-sm leading-6 text-warning">{error}</p>
      ) : (
        <p className="text-sm leading-6 text-neutral-500">
          Edit the full manifest when you need fields beyond the guided
          controls. This only updates the managed config draft.
        </p>
      )}
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
      <div className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-0 z-20 hidden w-56 rounded-[0.95rem] border border-border/45 bg-foreground px-3 py-2 text-left text-xs leading-5 text-background shadow-[0_16px_40px_rgb(15_23_42_/_0.28)] group-hover:block">
        {disabledReason}
      </div>
    </div>
  );
}

function StageNotice({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: "neutral" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "border-warning/35 bg-warning/10 text-warning"
      : "border-border/80 bg-card/85 text-foreground";

  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-3.5 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.12)] ${toneClass}`}
    >
      <p className="text-[11px] uppercase tracking-[0.22em]">{title}</p>
      <p className="mt-2 text-sm leading-6">{body}</p>
    </div>
  );
}

function clusterStatusTone(status?: string): "neutral" | "warning" {
  return status === "healthy" ? "neutral" : "warning";
}

function buildHealthStatusMessage(health: HealthResponse): string {
  if (!health.worker_running) {
    return `Backend worker is down. Queue depth ${health.queue_depth}. Restart the backend before launching runs.`;
  }

  if (health.cluster_status === "healthy") {
    return `Cluster healthy. Queue depth ${health.queue_depth}.`;
  }

  if (health.cluster_status === "degraded") {
    return `Cluster reachable but degraded. ${health.cluster_message}`;
  }

  if (health.cluster_status === "offline") {
    return `Cluster offline or unreachable. ${health.cluster_message}`;
  }

  return `Cluster status not verified. ${health.cluster_message || `Queue depth ${health.queue_depth}.`}`;
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
  const [activeTab, setActiveTab] = useState<AppTab>("deployment");
  const [isWardsAssetsOpen, setIsWardsAssetsOpen] = useState(true);
  const [isPoliciesAssetsOpen, setIsPoliciesAssetsOpen] = useState(true);
  const [wardSearchQuery, setWardSearchQuery] = useState("");
  const [policySearchQuery, setPolicySearchQuery] = useState("");
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>("all");
  const [isPolicyFilterMenuOpen, setIsPolicyFilterMenuOpen] = useState(false);
  const [isPolicyTypeMenuOpen, setIsPolicyTypeMenuOpen] = useState(false);
  const [selectedWardLibraryTab, setSelectedWardLibraryTab] = useState<
    "templates" | "scenarios"
  >("templates");
  const [selectedDeploymentStage, setSelectedDeploymentStage] =
    useState<DeploymentStage>("policies");
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [runs, setRuns] = useState<TerraformRun[]>([]);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState<string>("");
  const [selectedAppIndex, setSelectedAppIndex] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<TerraformRun | null>(null);
  const [selectedRunLogs, setSelectedRunLogs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthResponse | null>(
    null,
  );
  const [isSubjectModalOpen, setIsSubjectModalOpen] = useState(false);
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [isClusterInfoOpen, setIsClusterInfoOpen] = useState(false);
  const [selectedPolicyRef, setSelectedPolicyRef] =
    useState<SelectedPolicyRef | null>(null);
  const [armedDestroyStage, setArmedDestroyStage] = useState<RunStage | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showCopiedLogsHint, setShowCopiedLogsHint] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const selectedRunStatusRef = useRef<TerraformRun["status"] | undefined>(
    undefined,
  );
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null);
  const logsViewportRef = useRef<HTMLDivElement | null>(null);
  const policyFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const policyTypeMenuRef = useRef<HTMLDivElement | null>(null);
  const copiedLogsHintTimerRef = useRef<number | null>(null);
  const errorToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    window.localStorage.setItem(themeStorageKey, themeMode);
  }, [themeMode]);

  const coreConfig = config?.core ?? null;
  const platformConfig = config?.platform ?? null;
  const applicationsConfig = config?.applications ?? null;
  const policiesConfig = config?.policies ?? null;

  const subjectKeys = useMemo(
    () => Object.keys(platformConfig?.analysis_subjects ?? {}),
    [platformConfig?.analysis_subjects],
  );
  const filteredSubjectKeys = useMemo(() => {
    const query = wardSearchQuery.trim().toLowerCase();
    if (!query) return subjectKeys;
    return subjectKeys.filter((subjectKey) =>
      subjectKey.toLowerCase().includes(query),
    );
  }, [subjectKeys, wardSearchQuery]);
  const selectedSubject = useMemo(() => {
    if (!platformConfig || !selectedSubjectKey) return null;
    return platformConfig.analysis_subjects[selectedSubjectKey] ?? null;
  }, [platformConfig, selectedSubjectKey]);
  const appsForSelectedSubject = useMemo(
    () =>
      (applicationsConfig?.ward_applications ?? [])
        .map((application, index) => ({ application, index }))
        .filter(
          ({ application }) => application.namespace === selectedSubjectKey,
        ),
    [applicationsConfig?.ward_applications, selectedSubjectKey],
  );
  const selectedApp = useMemo(() => {
    if (!applicationsConfig) return null;

    const current =
      applicationsConfig.ward_applications[selectedAppIndex] ?? null;
    if (current && current.namespace === selectedSubjectKey) {
      return current;
    }

    return appsForSelectedSubject[0]?.application ?? null;
  }, [
    applicationsConfig,
    appsForSelectedSubject,
    selectedAppIndex,
    selectedSubjectKey,
  ]);
  const activeScenarioBundles = useMemo<ActiveScenarioBundle[]>(() => {
    const bundles = new Map<string, ActiveScenarioBundle>();

    for (const { application } of appsForSelectedSubject) {
      const bundleId = scenarioBundleForApp(application);
      const scenarioId = scenarioIdForApp(application);
      if (!bundleId || !scenarioId) {
        continue;
      }

      const blueprint = scenarioBlueprints[scenarioId];
      const existingBundle = bundles.get(bundleId);
      if (existingBundle) {
        existingBundle.apps.push(application);
        continue;
      }

      bundles.set(bundleId, {
        bundleId,
        blueprint,
        namespace: selectedSubjectKey,
        apps: [application],
      });
    }

    return [...bundles.values()].sort((left, right) =>
      left.blueprint.title.localeCompare(right.blueprint.title),
    );
  }, [appsForSelectedSubject, selectedSubjectKey]);
  const selectedAppPrimaryContainer = useMemo(
    () => primaryContainer(selectedApp),
    [selectedApp],
  );
  const visibleKyvernoPolicies = useMemo(() => {
    const query = policySearchQuery.trim().toLowerCase();
    if (policyFilter === "tetragon") {
      return [];
    }

    return (policiesConfig?.kyverno_cluster_policies ?? []).filter((policy) => {
      if (!query) return true;
      return policy.name.toLowerCase().includes(query);
    });
  }, [
    policiesConfig?.kyverno_cluster_policies,
    policyFilter,
    policySearchQuery,
  ]);
  const visibleTetragonPolicies = useMemo(() => {
    const query = policySearchQuery.trim().toLowerCase();
    if (policyFilter === "kyverno") {
      return [];
    }

    return (policiesConfig?.tetragon_tracing_policies ?? []).filter(
      (policy) => {
        if (!query) return true;
        return policy.name.toLowerCase().includes(query);
      },
    );
  }, [
    policiesConfig?.tetragon_tracing_policies,
    policyFilter,
    policySearchQuery,
  ]);
  const selectedKyvernoPolicy = useMemo(
    () =>
      policiesConfig?.kyverno_cluster_policies.find(
        (policy) =>
          selectedPolicyRef?.engine === "kyverno" &&
          policy.id === selectedPolicyRef.id,
      ) ?? null,
    [policiesConfig?.kyverno_cluster_policies, selectedPolicyRef],
  );
  const selectedTetragonPolicy = useMemo(
    () =>
      policiesConfig?.tetragon_tracing_policies.find(
        (policy) =>
          selectedPolicyRef?.engine === "tetragon" &&
          policy.id === selectedPolicyRef.id,
      ) ?? null,
    [policiesConfig?.tetragon_tracing_policies, selectedPolicyRef],
  );
  const selectedPolicy =
    selectedPolicyRef?.engine === "kyverno"
      ? selectedKyvernoPolicy
      : selectedTetragonPolicy;
  useEffect(() => {
    if (!policiesConfig) return;

    const hasSelectedKyverno =
      selectedPolicyRef?.engine === "kyverno" &&
      visibleKyvernoPolicies.some(
        (policy) => policy.id === selectedPolicyRef.id,
      );
    const hasSelectedTetragon =
      selectedPolicyRef?.engine === "tetragon" &&
      visibleTetragonPolicies.some(
        (policy) => policy.id === selectedPolicyRef.id,
      );
    if (hasSelectedKyverno || hasSelectedTetragon) {
      return;
    }

    const firstKyverno = visibleKyvernoPolicies[0];
    if (firstKyverno) {
      setSelectedPolicyRef({ engine: "kyverno", id: firstKyverno.id });
      return;
    }

    const firstTetragon = visibleTetragonPolicies[0];
    if (firstTetragon) {
      setSelectedPolicyRef({ engine: "tetragon", id: firstTetragon.id });
      return;
    }

    setSelectedPolicyRef(null);
  }, [
    policiesConfig,
    selectedPolicyRef,
    visibleKyvernoPolicies,
    visibleTetragonPolicies,
  ]);
  const selectedAppReview = useMemo(
    () => buildAppReview(selectedApp, subjectKeys),
    [selectedApp, subjectKeys],
  );
  const selectedAppPrimaryConfigFile = useMemo<[string, string]>(() => {
    const entries = Object.entries(selectedApp?.config_map?.data ?? {});
    return entries[0] ?? ["main.py", ""];
  }, [selectedApp?.config_map?.data]);
  const selectedAppIngressRules = selectedApp?.network_policy?.ingress ?? [];
  const selectedAppEgressRules = selectedApp?.network_policy?.egress ?? [];
  const latestPoliciesRun = useMemo(
    () => runs.find((run) => run.stage === "policies") ?? null,
    [runs],
  );
  const latestApplicationsRun = useMemo(
    () => runs.find((run) => run.stage === "applications") ?? null,
    [runs],
  );
  const hasAppliedPoliciesRun = useMemo(
    () => stageIsEffectivelyApplied(runs, "policies"),
    [runs],
  );
  const hasAppliedApplicationsRun = useMemo(
    () => stageIsEffectivelyApplied(runs, "applications"),
    [runs],
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
  const planSummaryLabel =
    selectedRun?.kind === "apply"
      ? "Plan behind this apply"
      : "Planned changes";
  const apiTokenValue = getApiToken();
  const toggleThemeMode = () => {
    setThemeMode((current) => (current === "light" ? "dark" : "light"));
  };
  const totalAppsWithExposure = useMemo(
    () =>
      applicationsConfig?.ward_applications.filter((application) =>
        appExposureEnabled(application),
      ).length ?? 0,
    [applicationsConfig?.ward_applications],
  );
  const totalAppsWithService = useMemo(
    () =>
      applicationsConfig?.ward_applications.filter(
        (application) => application.service?.enabled !== false,
      ).length ?? 0,
    [applicationsConfig?.ward_applications],
  );
  const totalContainers = useMemo(
    () =>
      applicationsConfig?.ward_applications.reduce(
        (count, application) => count + (application.containers?.length ?? 0),
        0,
      ) ?? 0,
    [applicationsConfig?.ward_applications],
  );
  const groupedSelectedRunLogs = useMemo(
    () => groupRunLogLines(selectedRunLogs),
    [selectedRunLogs],
  );
  const configuredAdminArnsCount =
    coreConfig?.cluster_admin_principal_arns.filter((arn) => arn.trim() !== "")
      .length ?? 0;
  const policiesDestroyBlockedReason = hasAppliedApplicationsRun
    ? "Destroy the applications stage first. The applications stage still owns resources that depend on policies."
    : undefined;
  const stageAvailability = {
    policies: true,
    applications: true,
    observability:
      Boolean(healthSnapshot?.worker_running) &&
      (healthSnapshot?.cluster_status === "healthy" ||
        healthSnapshot?.cluster_status === "degraded"),
  } as const;
  const workerUnavailableReason =
    healthSnapshot?.worker_running === false
      ? "Backend worker is down. Start the runner before queuing plans or applies."
      : undefined;
  const policiesActionDisabledReason = workerUnavailableReason;
  const policiesDestroyActionDisabledReason = policiesDestroyBlockedReason;
  const applicationsActionDisabledReason = workerUnavailableReason;
  const applicationsStageLocked = false;
  const sharedInfrastructureNotice =
    "Core and platform are managed outside this control plane. Use the infrastructure pipeline to apply shared AWS and cluster changes before you work on policies or applications here.";
  const deploymentStageDetail = useMemo(() => {
    if (selectedDeploymentStage === "observability") {
      const clusterStatus = healthSnapshot?.cluster_status ?? "unknown";
      return {
        stage: "observability" as const,
        title: "Observability",
        description:
          clusterStatus === "healthy" || clusterStatus === "degraded"
            ? "Entry points for the shared observability tooling exposed from the current cluster."
            : "Observability access depends on the backend worker being online and the shared platform being available.",
        badge: clusterStatus,
        metrics: [],
      };
    }

    if (selectedDeploymentStage === "applications") {
      return {
        stage: "applications" as const,
        title: "Applications",
        description:
          "Workload deployments, Services, exposure rules, and application-specific network policies for the live lab.",
        badge: latestApplicationsRun ? latestApplicationsRun.status : "idle",
        metrics: [
          {
            label: "Apps",
            value: applicationsConfig?.ward_applications.length ?? 0,
          },
          { label: "Services", value: totalAppsWithService },
          { label: "Exposure", value: totalAppsWithExposure },
        ],
      };
    }

    return {
      stage: "policies" as const,
      title: "Policies",
      description:
        "Kyverno and Tetragon custom resources layered onto the shared platform after the infrastructure pipeline has finished.",
      badge: latestPoliciesRun ? latestPoliciesRun.status : "idle",
      metrics: [
        { label: "Wards", value: subjectKeys.length },
        {
          label: "Cluster Policies",
          value: policiesConfig?.kyverno_cluster_policies.length ?? 0,
        },
        {
          label: "Tracing Policies",
          value: policiesConfig?.tetragon_tracing_policies.length ?? 0,
        },
      ],
    };
  }, [
    applicationsConfig?.ward_applications.length,
    healthSnapshot?.cluster_status,
    latestApplicationsRun,
    latestPoliciesRun,
    policiesConfig?.kyverno_cluster_policies.length,
    policiesConfig?.tetragon_tracing_policies.length,
    selectedDeploymentStage,
    subjectKeys.length,
    totalAppsWithExposure,
    totalAppsWithService,
  ]);

  useEffect(() => {
    if (stageAvailability[selectedDeploymentStage]) {
      return;
    }

    if (stageAvailability.policies) {
      setSelectedDeploymentStage("policies");
      return;
    }

    if (stageAvailability.applications) {
      setSelectedDeploymentStage("applications");
    }
  }, [
    selectedDeploymentStage,
    stageAvailability.applications,
    stageAvailability.observability,
    stageAvailability.policies,
  ]);

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
    if (!isPolicyFilterMenuOpen && !isPolicyTypeMenuOpen) return;

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        policyFilterMenuRef.current?.contains(target) ||
        policyTypeMenuRef.current?.contains(target)
      ) {
        return;
      }

      setIsPolicyFilterMenuOpen(false);
      setIsPolicyTypeMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsPolicyFilterMenuOpen(false);
      setIsPolicyTypeMenuOpen(false);
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPolicyFilterMenuOpen, isPolicyTypeMenuOpen]);

  useEffect(() => {
    void loadInitial();

    const intervalId = window.setInterval(() => {
      void refreshHealth();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedLogsHintTimerRef.current !== null) {
        window.clearTimeout(copiedLogsHintTimerRef.current);
      }
      if (errorToastTimerRef.current !== null) {
        window.clearTimeout(errorToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) {
      if (errorToastTimerRef.current !== null) {
        window.clearTimeout(errorToastTimerRef.current);
        errorToastTimerRef.current = null;
      }
      return;
    }

    if (errorToastTimerRef.current !== null) {
      window.clearTimeout(errorToastTimerRef.current);
    }
    errorToastTimerRef.current = window.setTimeout(() => {
      setErrorMessage("");
      errorToastTimerRef.current = null;
    }, 2000);
  }, [errorMessage]);

  useEffect(() => {
    if (!selectedRunId) return;

    let isClosed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    async function hydrateSelectedRun() {
      try {
        const [runResponse, logsResponse] = await Promise.all([
          api.getRun(selectedRunId),
          api.getRunLogs(selectedRunId),
        ]);
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
          setSelectedRunLogs((current) =>
            normalizeRunLogLines([...current, ...payload.lines]),
          );
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

    const current =
      config.applications.ward_applications[selectedAppIndex] ?? null;
    if (current && current.namespace === selectedSubjectKey) {
      return;
    }

    const firstMatchingAppIndex =
      config.applications.ward_applications.findIndex(
        (application) => application.namespace === selectedSubjectKey,
      );
    if (
      firstMatchingAppIndex >= 0 &&
      firstMatchingAppIndex !== selectedAppIndex
    ) {
      setSelectedAppIndex(firstMatchingAppIndex);
    }
  }, [config, selectedAppIndex, selectedSubjectKey]);

  async function loadInitial() {
    try {
      const [loadedConfig, runResponse, health] = await Promise.all([
        api.getConfig(),
        api.listRuns(),
        api.getHealth(),
      ]);
      const normalizedConfig = normalizeTerraformConfig(loadedConfig);
      setConfig(normalizedConfig);
      setRuns(sortRuns(runResponse.items));
      setHealthSnapshot(health);
      const firstSubjectKey =
        Object.keys(normalizedConfig.platform.analysis_subjects)[0] ?? "";
      const firstAppIndex =
        normalizedConfig.applications.ward_applications.findIndex(
          (application) => application.namespace === firstSubjectKey,
        );
      setSelectedSubjectKey(firstSubjectKey);
      setSelectedAppIndex(firstAppIndex >= 0 ? firstAppIndex : 0);
      setStatusMessage(buildHealthStatusMessage(health));

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

  async function refreshHealth() {
    try {
      const health = await api.getHealth();
      setHealthSnapshot(health);
      setStatusMessage(buildHealthStatusMessage(health));
    } catch {
      // Keep the last known health snapshot when refresh fails.
    }
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

  function updateConfig(
    mutator: (current: TerraformConfig) => TerraformConfig,
  ) {
    setConfig((current) => (current ? mutator(current) : current));
  }

  function updateSelectedSubject(
    mutator: (current: AnalysisSubject) => AnalysisSubject,
  ) {
    if (!selectedSubjectKey) return;
    updateConfig((current) => ({
      ...current,
      platform: {
        ...current.platform,
        analysis_subjects: {
          ...current.platform.analysis_subjects,
          [selectedSubjectKey]: mutator(
            current.platform.analysis_subjects[selectedSubjectKey] ??
              emptySubject(),
          ),
        },
      },
    }));
  }

  function updateSelectedApp(
    mutator: (current: WardApplication) => WardApplication,
  ) {
    updateConfig((current) => {
      const next = structuredClone(current);
      next.applications.ward_applications[selectedAppIndex] = mutator(
        next.applications.ward_applications[selectedAppIndex] ??
          emptyAppTemplate(selectedSubjectKey || "ward-template-app"),
      );
      return next;
    });
  }

  function updateSelectedPrimaryContainer(
    mutator: (current: ContainerConfig) => ContainerConfig,
  ) {
    updateSelectedApp((current) => {
      const containers = [...(current.containers ?? [emptyContainer()])];
      containers[0] = mutator(containers[0] ?? emptyContainer());
      return {
        ...current,
        containers,
      };
    });
  }

  function updateSelectedPrimaryConfigFile(
    nextName: string,
    nextContent: string,
  ) {
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
    if (
      !config ||
      trimmed === "" ||
      trimmed === currentKey ||
      config.platform.analysis_subjects[trimmed]
    ) {
      return;
    }

    updateConfig((current) => {
      const next = structuredClone(current);
      const subject = next.platform.analysis_subjects[currentKey];
      delete next.platform.analysis_subjects[currentKey];
      next.platform.analysis_subjects[trimmed] = subject;
      next.applications.ward_applications =
        next.applications.ward_applications.map((application) =>
          application.namespace === currentKey
            ? { ...application, namespace: trimmed }
            : application,
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
      platform: {
        ...current.platform,
        analysis_subjects: {
          ...current.platform.analysis_subjects,
          [nextKey]: emptySubject(),
        },
      },
    }));
    setSelectedSubjectKey(nextKey);
  }

  function removeSelectedSubject() {
    if (!config || subjectKeys.length <= 1 || !selectedSubjectKey) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      delete next.platform.analysis_subjects[selectedSubjectKey];
      next.applications.ward_applications =
        next.applications.ward_applications.filter(
          (application) => application.namespace !== selectedSubjectKey,
        );
      if (next.applications.ward_applications.length === 0) {
        const fallbackNamespace =
          Object.keys(next.platform.analysis_subjects)[0] ??
          "ward-template-app";
        const fallbackApp = makeInternalPythonApiApp(fallbackNamespace);
        fallbackApp.name = kubeSafeName(
          uniqueName(
            fallbackApp.name,
            next.applications.ward_applications.map(
              (application) => application.name,
            ),
          ),
        );
        next.applications.ward_applications.push(fallbackApp);
      }
      return next;
    });
    const remainingKeys = subjectKeys.filter(
      (key) => key !== selectedSubjectKey,
    );
    setSelectedSubjectKey(remainingKeys[0] ?? "");
    setSelectedAppIndex(0);
  }

  function removeSubject(subjectKey: string) {
    if (!config || subjectKeys.length <= 1) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      delete next.platform.analysis_subjects[subjectKey];
      next.applications.ward_applications =
        next.applications.ward_applications.filter(
          (application) => application.namespace !== subjectKey,
        );
      if (next.applications.ward_applications.length === 0) {
        const fallbackNamespace =
          Object.keys(next.platform.analysis_subjects)[0] ??
          "ward-template-app";
        const fallbackApp = makeInternalPythonApiApp(fallbackNamespace);
        fallbackApp.name = kubeSafeName(
          uniqueName(
            fallbackApp.name,
            next.applications.ward_applications.map(
              (application) => application.name,
            ),
          ),
        );
        next.applications.ward_applications.push(fallbackApp);
      }
      return next;
    });
    if (selectedSubjectKey === subjectKey) {
      const remainingKeys = subjectKeys.filter((key) => key !== subjectKey);
      setSelectedSubjectKey(remainingKeys[0] ?? "");
      setSelectedAppIndex(0);
    }
  }

  function selectSubject(subjectKey: string) {
    setSelectedSubjectKey(subjectKey);
    const firstAppIndex =
      config?.applications.ward_applications.findIndex(
        (application) => application.namespace === subjectKey,
      ) ?? -1;
    if (firstAppIndex >= 0) {
      setSelectedAppIndex(firstAppIndex);
    }
  }

  function addApp() {
    if (!config) return;
    const namespace =
      selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    const template = makeInternalPythonApiApp(namespace);
    template.name = kubeSafeName(
      uniqueName(
        template.name,
        config.applications.ward_applications.map(
          (application) => application.name,
        ),
      ),
    );
    updateConfig((current) => ({
      ...current,
      applications: {
        ...current.applications,
        ward_applications: [
          ...current.applications.ward_applications,
          template,
        ],
      },
    }));
    setSelectedAppIndex(config.applications.ward_applications.length);
  }

  function addCustomAppFromBuilder() {
    addApp();
    setIsAppModalOpen(true);
  }

  function addAppTemplate(templateId: AppTemplateId) {
    if (!config) return;

    const namespace =
      selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    const app =
      templateId === "public-python-api"
        ? makePublicPythonApiApp(namespace)
        : templateId === "internal-python-api"
          ? makeInternalPythonApiApp(namespace)
          : makeStaticSiteApp(namespace);
    app.name = kubeSafeName(
      uniqueName(
        app.name,
        config.applications.ward_applications.map((existing) => existing.name),
      ),
    );
    if (appExposureEnabled(app)) {
      app.exposure = {
        ...app.exposure,
        host: `${app.name}.lab.internal`,
      };
    }

    updateConfig((current) => ({
      ...current,
      applications: {
        ...current.applications,
        ward_applications: [...current.applications.ward_applications, app],
      },
    }));
    setSelectedSubjectKey(namespace);
    setSelectedAppIndex(config.applications.ward_applications.length);
    setStatusMessage(
      templateId === "public-python-api"
        ? `Added public API template to ${namespace}.`
        : templateId === "internal-python-api"
          ? `Added internal API template to ${namespace}.`
          : `Added static site template to ${namespace}.`,
    );
    setErrorMessage("");
  }

  function addScenarioBlueprint(blueprintId: ScenarioBlueprintId) {
    if (!config) return;

    const namespace =
      selectedSubjectKey || subjectKeys[0] || "ward-template-app";
    const blueprint = scenarioBlueprints[blueprintId];
    const keptApplications = config.applications.ward_applications.filter(
      (application) => application.namespace !== namespace,
    );
    const bundleId = nextScenarioBundleId(blueprintId, keptApplications);
    const existingNames = keptApplications.map(
      (application) => application.name,
    );
    const scenarioApps = blueprint
      .build(namespace, bundleId)
      .map((application) => structuredClone(application));

    scenarioApps.forEach((application) => {
      application.name = kubeSafeName(
        uniqueName(application.name, existingNames),
      );
      existingNames.push(application.name);
      if (appExposureEnabled(application)) {
        application.exposure = {
          ...application.exposure,
          host: `${application.name}.lab.internal`,
        };
      }
    });

    updateConfig((current) => ({
      ...current,
      applications: {
        ...current.applications,
        ward_applications: [
          ...current.applications.ward_applications.filter(
            (application) => application.namespace !== namespace,
          ),
          ...scenarioApps,
        ],
      },
    }));
    setSelectedSubjectKey(namespace);
    setSelectedAppIndex(keptApplications.length);
    setStatusMessage(
      `Loaded ${blueprint.title} into ${namespace}. Existing apps in that ward were replaced.`,
    );
    setErrorMessage("");
  }

  function removeSelectedApp() {
    if (!config || config.applications.ward_applications.length <= 1) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      next.applications.ward_applications.splice(selectedAppIndex, 1);
      return next;
    });
    setSelectedAppIndex((currentIndex) => Math.max(0, currentIndex - 1));
  }

  function updateSelectedKyvernoPolicy(
    mutator: (
      current: KyvernoClusterPolicyConfig,
    ) => KyvernoClusterPolicyConfig,
  ) {
    if (!selectedKyvernoPolicy) return;
    updateConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        kyverno_cluster_policies: current.policies.kyverno_cluster_policies.map(
          (policy) =>
            policy.id === selectedKyvernoPolicy.id ? mutator(policy) : policy,
        ),
      },
    }));
  }

  function updateSelectedTetragonPolicy(
    mutator: (
      current: TetragonTracingPolicyConfig,
    ) => TetragonTracingPolicyConfig,
  ) {
    if (!selectedTetragonPolicy) return;
    updateConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        tetragon_tracing_policies:
          current.policies.tetragon_tracing_policies.map((policy) =>
            policy.id === selectedTetragonPolicy.id ? mutator(policy) : policy,
          ),
      },
    }));
  }

  function addKyvernoPolicy(
    template: "require-label" | "latest-tag" | "custom",
  ) {
    if (!config) return;
    const nextPolicy =
      template === "require-label"
        ? makeRequireWardSubjectPolicy()
        : template === "latest-tag"
          ? makeDisallowLatestTagPolicy()
          : makeCustomKyvernoPolicy();
    nextPolicy.id = uniqueName(
      nextPolicy.id,
      config.policies.kyverno_cluster_policies.map((policy) => policy.id),
    );
    nextPolicy.manifest = {
      ...nextPolicy.manifest,
      metadata: {
        ...(nextPolicy.manifest.metadata as JsonObject | undefined),
        name:
          typeof nextPolicy.manifest.metadata === "object" &&
          nextPolicy.manifest.metadata &&
          !Array.isArray(nextPolicy.manifest.metadata) &&
          typeof nextPolicy.manifest.metadata.name === "string" &&
          nextPolicy.manifest.metadata.name.trim() !== ""
            ? nextPolicy.manifest.metadata.name
            : nextPolicy.id,
      },
    };
    updateConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        kyverno_cluster_policies: [
          ...current.policies.kyverno_cluster_policies,
          nextPolicy,
        ],
      },
    }));
    setSelectedPolicyRef({ engine: "kyverno", id: nextPolicy.id });
  }

  function addTetragonPolicy(template: "suspicious-exec" | "custom") {
    if (!config) return;
    const nextPolicy =
      template === "suspicious-exec"
        ? makeSuspiciousExecTracingPolicy()
        : makeCustomTetragonPolicy();
    nextPolicy.id = uniqueName(
      nextPolicy.id,
      config.policies.tetragon_tracing_policies.map((policy) => policy.id),
    );
    nextPolicy.manifest = {
      ...nextPolicy.manifest,
      metadata: {
        ...(nextPolicy.manifest.metadata as JsonObject | undefined),
        name:
          typeof nextPolicy.manifest.metadata === "object" &&
          nextPolicy.manifest.metadata &&
          !Array.isArray(nextPolicy.manifest.metadata) &&
          typeof nextPolicy.manifest.metadata.name === "string" &&
          nextPolicy.manifest.metadata.name.trim() !== ""
            ? nextPolicy.manifest.metadata.name
            : nextPolicy.id,
      },
    };
    updateConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        tetragon_tracing_policies: [
          ...current.policies.tetragon_tracing_policies,
          nextPolicy,
        ],
      },
    }));
    setSelectedPolicyRef({ engine: "tetragon", id: nextPolicy.id });
  }

  function removeSelectedPolicy(target = selectedPolicyRef) {
    if (!config || !target) return;
    updateConfig((current) => ({
      ...current,
      policies: {
        ...current.policies,
        kyverno_cluster_policies:
          target.engine === "kyverno"
            ? current.policies.kyverno_cluster_policies.filter(
                (policy) => policy.id !== target.id,
              )
            : current.policies.kyverno_cluster_policies,
        tetragon_tracing_policies:
          target.engine === "tetragon"
            ? current.policies.tetragon_tracing_policies.filter(
                (policy) => policy.id !== target.id,
              )
            : current.policies.tetragon_tracing_policies,
      },
    }));
    if (
      selectedPolicyRef &&
      selectedPolicyRef.engine === target.engine &&
      selectedPolicyRef.id === target.id
    ) {
      setSelectedPolicyRef(null);
    }
  }

  async function saveManagedConfig() {
    if (!config) return false;
    setIsBusy(true);
    try {
      const normalized: TerraformConfig = {
        ...config,
        platform: {
          ...config.platform,
          analysis_subjects: Object.fromEntries(
            Object.entries(config.platform.analysis_subjects).map(
              ([key, subject]) => [
                key,
                {
                  ...subject,
                  labels: compactRecord(subject.labels),
                },
              ],
            ),
          ),
        },
        policies: {
          kyverno_cluster_policies:
            config.policies.kyverno_cluster_policies.map((policy) => ({
              ...policy,
              id: policy.id.trim() || "kyverno-policy",
              name: policy.name.trim() || policy.id.trim() || "Kyverno policy",
              description: policy.description?.trim() || "",
            })),
          tetragon_tracing_policies:
            config.policies.tetragon_tracing_policies.map((policy) => ({
              ...policy,
              id: policy.id.trim() || "tetragon-policy",
              name: policy.name.trim() || policy.id.trim() || "Tetragon policy",
              description: policy.description?.trim() || "",
              scope: policy.scope ?? "all-wards",
              namespace: policy.namespace?.trim() || "",
            })),
        },
        applications: {
          ...config.applications,
          ward_applications: config.applications.ward_applications.map(
            (application) => ({
              ...application,
              pod_labels: compactRecord(application.pod_labels),
              service: application.service
                ? {
                    ...application.service,
                    annotations: compactRecord(application.service.annotations),
                  }
                : undefined,
              exposure: application.exposure
                ? {
                    ...application.exposure,
                  }
                : undefined,
              connectivity: application.connectivity
                ? {
                    ...application.connectivity,
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
                volume_mounts:
                  container.volume_mounts?.filter(
                    (mount) => mount.name.trim() && mount.mount_path.trim(),
                  ) ?? [],
              })),
              volumes: (application.volumes ?? []).filter(
                (volume) => volume.name.trim() !== "",
              ),
              network_policy: {
                ingress: application.network_policy?.ingress ?? [],
                egress: application.network_policy?.egress ?? [],
              },
            }),
          ),
        },
      };

      const saved = await api.saveConfig(normalized);
      setConfig(normalizeTerraformConfig(saved));
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
      const reset = normalizeTerraformConfig(await api.resetConfig());
      setConfig(reset);
      const firstSubjectKey =
        Object.keys(reset.platform.analysis_subjects)[0] ?? "";
      const firstAppIndex = reset.applications.ward_applications.findIndex(
        (application) => application.namespace === firstSubjectKey,
      );
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

  async function pruneRunHistory(keep: number) {
    setIsBusy(true);
    try {
      const response = await api.pruneRuns(keep);
      const nextRuns = sortRuns(response.items);
      setRuns(nextRuns);

      const currentSelectionStillExists = nextRuns.some(
        (run) => run.id === selectedRunId,
      );
      if (currentSelectionStillExists) {
        const nextSelectedRun =
          nextRuns.find((run) => run.id === selectedRunId) ?? null;
        setSelectedRun(nextSelectedRun);
      } else if (nextRuns[0]) {
        setSelectedRunId(nextRuns[0].id);
        setSelectedRun(nextRuns[0]);
        setSelectedRunLogs([]);
        setOutputs(normalizeTerraformOutputs(nextRuns[0].outputs));
      } else {
        setSelectedRunId("");
        setSelectedRun(null);
        setSelectedRunLogs([]);
        setOutputs(null);
      }

      setStatusMessage(
        response.deleted_count > 0
          ? `Deleted ${response.deleted_count} older runs. Keeping the latest ${response.kept_count}.`
          : `Run history already fits within the latest ${response.kept_count}.`,
      );
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  function latestPlanRun(stage: RunStage): TerraformRun | null {
    return (
      runs.find((run) => run.stage === stage && run.kind === "plan") ?? null
    );
  }

  function canQueueApplyFromPlan(stage: RunStage): boolean {
    const planRun = latestPlanRun(stage);
    if (!planRun) return false;
    return (
      planRun.status === "queued" ||
      planRun.status === "running" ||
      planRun.status === "planned"
    );
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
    const copyPayload =
      selectedRunLogs.length > 0
        ? selectedRunLogs.join("\n")
        : selectedRun?.error
          ? formatRunErrorText(selectedRun.error)
          : "";
    if (!copyPayload.trim()) {
      setErrorMessage("No logs or error details are available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(copyPayload);
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
            <CardContent className="py-10 text-sm text-neutral-600">
              Loading control plane state...
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Exclude<AppTab, "accounts">; label: string }> = [
    { id: "deployment", label: "Stages" },
    { id: "assets", label: "Assets" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-[1560px] space-y-6">
        {errorMessage ? (
          <div className="pointer-events-none fixed left-1/2 top-5 z-50 w-full max-w-xl -translate-x-1/2 px-4">
            <div className="rounded-[1.4rem] border border-warning/30 bg-warning/92 px-4 py-3 text-sm text-accentForeground shadow-[0_18px_48px_rgb(0_0_0_/_0.24)] backdrop-blur">
              {errorMessage}
            </div>
          </div>
        ) : null}

        <div className="navbar-shell sticky top-0 z-20 px-2 py-3">
          <div className="mx-auto max-w-[1560px]">
            <div className="px-2 py-1 sm:px-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                    <div className="brand-block flex items-center gap-4 rounded-[1.7rem] px-4 py-3">
                      <button
                        type="button"
                        aria-label="Open cluster status"
                        title="Open cluster status"
                        onClick={() => setIsClusterInfoOpen(true)}
                        className={classNames(
                          "inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#191308] shadow-[0_14px_36px_rgb(0_0_0_/_0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgb(0_0_0_/_0.22)]",
                          isClusterInfoOpen ? "ring-2 ring-white/35" : "",
                        )}
                      >
                        <BrandGlyph className="h-5 w-5" />
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight text-white">
                          Isolens
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.26em] text-white/60">
                          Cluster Control Plane
                        </p>
                      </div>
                    </div>

                    <nav className="surface-strong themed-scrollbar flex items-center gap-1 overflow-x-auto rounded-full p-1.5">
                      {tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={classNames(
                            "shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition duration-200",
                            activeTab === tab.id
                              ? "bg-accent text-accentForeground shadow-[0_14px_32px_rgb(var(--color-accent)_/_0.28)]"
                              : "text-foreground/70 hover:bg-card hover:text-foreground",
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </nav>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                    <IconActionButton
                      label="Open account"
                      active={activeTab === "accounts"}
                      onClick={() => setActiveTab("accounts")}
                    >
                      <AccountIcon className="h-5 w-5" />
                    </IconActionButton>
                    <IconActionButton
                      label={
                        themeMode === "light"
                          ? "Enable dark mode"
                          : "Enable light mode"
                      }
                      onClick={toggleThemeMode}
                    >
                      {themeMode === "light" ? (
                        <MoonIcon className="h-5 w-5" />
                      ) : (
                        <SunIcon className="h-5 w-5" />
                      )}
                    </IconActionButton>
                    <Button
                      className="col-span-1"
                      variant="secondary"
                      onClick={() => void saveManagedConfig()}
                      disabled={isBusy}
                    >
                      Save config
                    </Button>
                    <Button
                      className="col-span-1"
                      variant="ghost"
                      onClick={() => void resetConfig()}
                      disabled={isBusy}
                    >
                      Reset config
                    </Button>
                    <Button
                      className="col-span-2 sm:col-span-1"
                      variant="danger"
                      onClick={() => void cancelSelectedRun()}
                      disabled={
                        isBusy ||
                        !selectedRun ||
                        [
                          "running",
                          "applying",
                          "destroying",
                          "queued",
                          "canceling",
                        ].includes(selectedRun.status) === false
                      }
                    >
                      Cancel run
                    </Button>
                  </div>
                </div>

                <div className="themed-scrollbar flex gap-2 overflow-x-auto pb-1">
                  <ContextTag
                    label="Ward"
                    value={selectedSubjectKey || "No ward selected"}
                  />
                  <ContextTag
                    label="Application"
                    value={selectedApp?.name ?? "No application"}
                  />
                  <ContextTag
                    label="Ingress"
                    value={
                      selectedApp
                        ? appInternetIngressEnabled(selectedApp)
                          ? "Internet"
                          : "Internal"
                        : "Unset"
                    }
                  />
                  <ContextTag
                    label="Egress"
                    value={
                      selectedApp
                        ? appInternetEgressEnabled(selectedApp)
                          ? "Open"
                          : "Restricted"
                        : "Unset"
                    }
                  />
                  <ContextTag
                    label="Run"
                    value={
                      selectedRun
                        ? `${stageLabel(selectedRun.stage)} ${selectedRun.status}`
                        : "No active run"
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1560px] px-3 pb-8 pt-4 sm:px-4 sm:pb-10 sm:pt-6 md:px-6">
          <div ref={workspaceScrollRef} className="grid gap-6">
            {activeTab === "deployment" ? (
              <>
                <div className="grid gap-6">
                  <Card className="overflow-visible">
                    <CardHeader>
                      <CardTitle>Stages</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="surface-soft rounded-[1.8rem] p-4 sm:p-5">
                        <div className="grid gap-4 xl:grid-cols-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (!stageAvailability.policies) return;
                              setSelectedDeploymentStage("policies");
                            }}
                            disabled={!stageAvailability.policies}
                            aria-disabled={!stageAvailability.policies}
                            className={classNames(
                              "rounded-[1.4rem] border px-4 py-4 text-left transition duration-200",
                              !stageAvailability.policies
                                ? "cursor-not-allowed border-border/35 bg-card/45 text-foreground/35 opacity-55"
                                : "",
                              selectedDeploymentStage === "policies"
                                ? "border-accent/35 bg-accent/10 shadow-[0_10px_24px_rgb(var(--color-accent)_/_0.12)]"
                                : "border-border/50 bg-card hover:border-accent/22 hover:bg-background",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">Policies</p>
                                <p className="mt-1 text-sm text-neutral-500">
                                  Shared policy and tracing layer
                                </p>
                              </div>
                              <Badge>
                                {stageAvailability.policies
                                  ? (latestPoliciesRun?.status ?? "idle")
                                  : "unavailable"}
                              </Badge>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!stageAvailability.applications) return;
                              setSelectedDeploymentStage("applications");
                            }}
                            disabled={!stageAvailability.applications}
                            aria-disabled={!stageAvailability.applications}
                            className={classNames(
                              "rounded-[1.4rem] border px-4 py-4 text-left transition duration-200",
                              !stageAvailability.applications
                                ? "cursor-not-allowed border-border/35 bg-card/45 text-foreground/35 opacity-55"
                                : "",
                              selectedDeploymentStage === "applications"
                                ? "border-accent/35 bg-accent/10 shadow-[0_10px_24px_rgb(var(--color-accent)_/_0.12)]"
                                : "border-border/50 bg-card hover:border-accent/22 hover:bg-background",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">Applications</p>
                                <p className="mt-1 text-sm text-neutral-500">
                                  Workloads and exposure layer
                                </p>
                              </div>
                              <Badge>
                                {stageAvailability.applications
                                  ? (latestApplicationsRun?.status ?? "idle")
                                  : "unavailable"}
                              </Badge>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!stageAvailability.observability) return;
                              setSelectedDeploymentStage("observability");
                            }}
                            disabled={!stageAvailability.observability}
                            aria-disabled={!stageAvailability.observability}
                            className={classNames(
                              "rounded-[1.4rem] border px-4 py-4 text-left transition duration-200",
                              !stageAvailability.observability
                                ? "cursor-not-allowed border-border/35 bg-card/45 text-foreground/35 opacity-55"
                                : "",
                              selectedDeploymentStage === "observability"
                                ? "border-accent/35 bg-accent/10 shadow-[0_10px_24px_rgb(var(--color-accent)_/_0.12)]"
                                : "border-border/50 bg-card hover:border-accent/22 hover:bg-background",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold">Observability</p>
                                <p className="mt-1 text-sm text-neutral-500">
                                  Hubble, Tetragon, and local access commands
                                </p>
                              </div>
                              <Badge>
                                {stageAvailability.observability
                                  ? "available"
                                  : "unavailable"}
                              </Badge>
                            </div>
                          </button>
                        </div>

                        <div className="surface-strong mt-5 rounded-[1.8rem] p-5 sm:p-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="section-highlight text-2xl font-semibold tracking-tight">
                                {deploymentStageDetail.title}
                              </h3>
                              <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                                {deploymentStageDetail.description}
                              </p>
                            </div>
                            <div className="shrink-0 self-start">
                              <Badge>{deploymentStageDetail.badge}</Badge>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 md:grid-cols-3">
                            {deploymentStageDetail.metrics.map((metric) => (
                              <MetricTile
                                key={metric.label}
                                label={metric.label}
                                value={metric.value}
                              />
                            ))}
                          </div>

                          <div className="mt-5 flex flex-wrap gap-2">
                            {selectedDeploymentStage === "observability" ? (
                              healthSnapshot?.cluster_status === "healthy" ||
                              healthSnapshot?.cluster_status === "degraded" ? (
                                <div className="grid w-full gap-4 xl:grid-cols-2">
                                  <CommandBlock
                                    label="Hubble UI Port-Forward"
                                    value="kubectl -n kube-system port-forward svc/hubble-ui 12000:80"
                                    hint="Run this locally, then open the URL in your browser."
                                  />
                                  <CommandBlock
                                    label="Hubble UI URL"
                                    value="http://127.0.0.1:12000"
                                    hint="Use this after the port-forward is active."
                                  />
                                  <CommandBlock
                                    label="Tetragon Event Stream"
                                    value="kubectl -n kube-system logs -l app.kubernetes.io/name=tetragon -c export-stdout --since=5m -f"
                                    hint="Streams recent Tetragon events directly from the cluster."
                                  />
                                  <CommandBlock
                                    label="Hubble Flow Check"
                                    value="kubectl -n kube-system exec ds/cilium -- hubble observe --last 20"
                                    hint="Quick flow sample from the Cilium agent side."
                                  />
                                </div>
                              ) : (
                                <div className="w-full">
                                  <StageNotice
                                    title="Observability unavailable"
                                    body={
                                      healthSnapshot?.cluster_message ||
                                      "The backend worker is not available yet, so observability commands stay hidden until the shared platform is ready."
                                    }
                                    tone={clusterStatusTone(
                                      healthSnapshot?.cluster_status,
                                    )}
                                  />
                                </div>
                              )
                            ) : selectedDeploymentStage === "policies" ? (
                              <>
                                <StageAction
                                  disabledReason={policiesActionDisabledReason}
                                >
                                  <Button
                                    onClick={() => void startPlan("policies")}
                                    disabled={isBusy}
                                  >
                                    Plan policies
                                  </Button>
                                </StageAction>
                                <StageAction
                                  disabledReason={policiesActionDisabledReason}
                                >
                                  <Button
                                    variant="secondary"
                                    onClick={() => void startApply("policies")}
                                    disabled={
                                      isBusy ||
                                      !canQueueApplyFromPlan("policies")
                                    }
                                  >
                                    Apply policies
                                  </Button>
                                </StageAction>
                                <div data-destroy-arm>
                                  <StageAction
                                    disabledReason={
                                      policiesDestroyActionDisabledReason
                                    }
                                  >
                                    <Button
                                      variant={
                                        armedDestroyStage === "policies"
                                          ? "danger"
                                          : "ghost"
                                      }
                                      className={
                                        armedDestroyStage === "policies"
                                          ? "border-warning/70 bg-warning text-accentForeground hover:bg-warning/90"
                                          : ""
                                      }
                                      onClick={() =>
                                        void startDestroy("policies")
                                      }
                                      disabled={
                                        isBusy || hasAppliedApplicationsRun
                                      }
                                    >
                                      Destroy policies
                                    </Button>
                                  </StageAction>
                                </div>
                                <Button
                                  variant="ghost"
                                  onClick={() => void unlockState("policies")}
                                  disabled={isBusy}
                                >
                                  Unlock state
                                </Button>
                              </>
                            ) : (
                              <>
                                <StageAction
                                  disabledReason={
                                    applicationsActionDisabledReason
                                  }
                                >
                                  <Button
                                    onClick={() =>
                                      void startPlan("applications")
                                    }
                                    disabled={isBusy}
                                  >
                                    Plan applications
                                  </Button>
                                </StageAction>
                                <StageAction
                                  disabledReason={
                                    applicationsActionDisabledReason
                                  }
                                >
                                  <Button
                                    variant="secondary"
                                    onClick={() =>
                                      void startApply("applications")
                                    }
                                    disabled={
                                      isBusy ||
                                      !canQueueApplyFromPlan("applications")
                                    }
                                  >
                                    Apply applications
                                  </Button>
                                </StageAction>
                                <div data-destroy-arm>
                                  <StageAction
                                    disabledReason={
                                      applicationsActionDisabledReason
                                    }
                                  >
                                    <Button
                                      variant={
                                        armedDestroyStage === "applications"
                                          ? "danger"
                                          : "ghost"
                                      }
                                      className={
                                        armedDestroyStage === "applications"
                                          ? "border-warning/70 bg-warning text-accentForeground hover:bg-warning/90"
                                          : ""
                                      }
                                      onClick={() =>
                                        void startDestroy("applications")
                                      }
                                      disabled={isBusy}
                                    >
                                      Destroy applications
                                    </Button>
                                  </StageAction>
                                </div>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    void unlockState("applications")
                                  }
                                  disabled={isBusy || applicationsStageLocked}
                                >
                                  Unlock state
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}

            {activeTab === "assets" ? (
              <div className="grid gap-6">
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle>Wards</CardTitle>
                      <p className="mt-2 text-sm leading-6 text-neutral-500">
                        Browse wards on the left, then inspect resources,
                        applications, templates, and scenarios on the right.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={
                        isWardsAssetsOpen ? "Collapse wards" : "Expand wards"
                      }
                      title={
                        isWardsAssetsOpen ? "Collapse wards" : "Expand wards"
                      }
                      className="h-10 w-10 rounded-full px-0 text-lg"
                      onClick={() =>
                        setIsWardsAssetsOpen((current) => !current)
                      }
                    >
                      {isWardsAssetsOpen ? "−" : "+"}
                    </Button>
                  </CardHeader>
                  {isWardsAssetsOpen ? (
                    <CardContent className="grid gap-6">
                      <div className="grid gap-6 2xl:grid-cols-[400px_minmax(0,1fr)] 2xl:items-stretch">
                        <Card className="overflow-hidden">
                          <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4">
                            <CardTitle>Ward List</CardTitle>
                            <div className="flex flex-wrap gap-2">
                              <Input
                                className="min-w-0 flex-1"
                                value={wardSearchQuery}
                                onChange={(event) =>
                                  setWardSearchQuery(event.target.value)
                                }
                                placeholder="Search wards"
                              />
                              <Button variant="secondary" onClick={addSubject}>
                                Add ward
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="themed-scrollbar h-[13.5rem] space-y-2.5 overflow-y-auto pr-1">
                              {filteredSubjectKeys.length === 0 ? (
                                <p className="text-sm text-neutral-500">
                                  No wards match this search.
                                </p>
                              ) : null}
                              {filteredSubjectKeys.map((subjectKey) => (
                                <div
                                  key={subjectKey}
                                  className={classNames(
                                    "group rounded-[1.35rem] border px-3.5 py-3.5 transition",
                                    subjectKey === selectedSubjectKey
                                      ? "border-accent/70 bg-accent/10"
                                      : "border-border/80 bg-card/72 hover:bg-muted/70",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <button
                                      className="min-w-0 flex-1 text-left"
                                      onClick={() => selectSubject(subjectKey)}
                                    >
                                      <p className="truncate font-medium">
                                        {subjectKey}
                                      </p>
                                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
                                        {config.platform.analysis_subjects[
                                          subjectKey
                                        ]?.tier ?? "ward"}
                                      </p>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Badge>
                                        {
                                          config.applications.ward_applications.filter(
                                            (application) =>
                                              application.namespace ===
                                              subjectKey,
                                          ).length
                                        }
                                      </Badge>
                                      <div className="flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                                        <Button
                                          variant="ghost"
                                          className="px-2 py-1 text-xs"
                                          onClick={() => {
                                            selectSubject(subjectKey);
                                            setIsSubjectModalOpen(true);
                                          }}
                                        >
                                          Edit
                                        </Button>
                                        <button
                                          type="button"
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warning/35 bg-card/90 text-warning transition hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-45"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            removeSubject(subjectKey);
                                          }}
                                          aria-label={`Delete ${subjectKey}`}
                                          title={`Delete ${subjectKey}`}
                                          disabled={subjectKeys.length <= 1}
                                        >
                                          <TrashIcon className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="min-w-0 overflow-hidden">
                          <CardHeader className="border-b border-border/80 px-5 py-4">
                            <CardTitle>Used Resources</CardTitle>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="flex flex-wrap gap-2">
                              <Badge>{selectedSubject?.tier ?? "ward"}</Badge>
                              <Badge>
                                {
                                  Object.keys(selectedSubject?.labels ?? {})
                                    .length
                                }{" "}
                                labels
                              </Badge>
                              <Badge>
                                {appsForSelectedSubject.length} apps
                              </Badge>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              <MetricTile
                                label="Pods quota"
                                value={
                                  selectedSubject?.resource_quota?.pods ?? "-"
                                }
                              />
                              <MetricTile
                                label="CPU request"
                                value={
                                  selectedSubject?.resource_quota
                                    ?.requests_cpu ?? "-"
                                }
                              />
                              <MetricTile
                                label="CPU limit"
                                value={
                                  selectedSubject?.resource_quota?.limits_cpu ??
                                  "-"
                                }
                              />
                              <MetricTile
                                label="Memory limit"
                                value={
                                  selectedSubject?.resource_quota
                                    ?.limits_memory ?? "-"
                                }
                              />
                            </div>
                            {Object.entries(selectedSubject?.labels ?? {})
                              .length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(
                                  selectedSubject?.labels ?? {},
                                ).map(([labelKey, labelValue]) => (
                                  <span
                                    key={`${labelKey}-${labelValue}`}
                                    className="rounded-full border border-border/70 bg-card/78 px-3 py-1.5 text-xs text-foreground/75"
                                  >
                                    {labelKey}: {labelValue}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                      </div>

                      <div className="grid min-w-0 gap-6 xl:grid-cols-2 xl:items-stretch">
                        <Card className="flex h-full min-w-0 flex-col overflow-hidden">
                          <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
                            <CardTitle>Applications</CardTitle>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" onClick={addApp}>
                                Add empty app
                              </Button>
                              <Button
                                variant="danger"
                                onClick={removeSelectedApp}
                                disabled={
                                  config.applications.ward_applications
                                    .length <= 1
                                }
                              >
                                Remove selected app
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-1 flex-col gap-4">
                            {appsForSelectedSubject.length === 0 ? (
                              <div className="flex min-h-[16rem] flex-1 items-center rounded-[1.6rem] border border-dashed border-border/80 bg-muted/45 px-5 py-6 text-sm text-neutral-500">
                                No applications in this ward yet.
                              </div>
                            ) : (
                              <div className="themed-scrollbar flex min-h-[16rem] flex-1 gap-3 overflow-x-auto pb-2">
                                {appsForSelectedSubject.map(
                                  ({ application, index }) => {
                                    const applicationReview = buildAppReview(
                                      application,
                                      subjectKeys,
                                    );
                                    const applicationPrimaryContainer =
                                      primaryContainer(application);

                                    return (
                                      <div
                                        key={`${application.name}-${index}`}
                                        className={classNames(
                                          "group min-w-[280px] max-w-[280px] shrink-0 rounded-[1.6rem] border p-4 transition",
                                          index === selectedAppIndex
                                            ? "border-accent/70 bg-accent/10"
                                            : "border-border/80 bg-card/80 hover:bg-muted/65",
                                        )}
                                      >
                                        <button
                                          className="w-full text-left"
                                          onClick={() =>
                                            setSelectedAppIndex(index)
                                          }
                                        >
                                          <div className="flex min-w-0 items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="text-base font-semibold tracking-tight">
                                                {application.name}
                                              </p>
                                              <p className="mt-2 text-xs uppercase tracking-[0.22em] text-neutral-500">
                                                {application.containers
                                                  ?.length ?? 0}{" "}
                                                containers •{" "}
                                                {application.replicas ?? 1}{" "}
                                                replicas
                                              </p>
                                            </div>
                                            <Badge>
                                              {appExposureEnabled(application)
                                                ? "Public"
                                                : "Internal"}
                                            </Badge>
                                          </div>
                                          <div className="mt-4 grid gap-3">
                                            <div className="grid gap-1">
                                              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                                                Image
                                              </p>
                                              <p
                                                className="truncate text-sm text-foreground/82"
                                                title={
                                                  applicationPrimaryContainer?.image ??
                                                  "No image"
                                                }
                                              >
                                                {displayImageName(
                                                  applicationPrimaryContainer?.image,
                                                )}
                                              </p>
                                            </div>
                                            <div className="grid gap-1">
                                              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                                                Exposure
                                              </p>
                                              <p
                                                className="truncate text-sm text-foreground/82"
                                                title={displayExposureSummary(
                                                  application,
                                                )}
                                              >
                                                {displayExposureSummary(
                                                  application,
                                                )}
                                              </p>
                                            </div>
                                            <div className="grid gap-1">
                                              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                                                Status
                                              </p>
                                              <p className="text-sm text-foreground/82">
                                                {applicationReview.errors
                                                  .length > 0
                                                  ? `${applicationReview.errors.length} issue${applicationReview.errors.length === 1 ? "" : "s"}`
                                                  : applicationReview.warnings
                                                        .length > 0
                                                    ? `${applicationReview.warnings.length} warning${applicationReview.warnings.length === 1 ? "" : "s"}`
                                                    : "Ready"}
                                              </p>
                                            </div>
                                          </div>
                                        </button>
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        <Card className="flex h-full min-w-0 flex-col overflow-hidden">
                          <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0 flex-1">
                              <CardTitle>Application Inspector</CardTitle>
                              <p className="mt-2 text-sm leading-6 text-neutral-500">
                                Selected app runtime, exposure, and generated
                                resources.
                              </p>
                            </div>
                            {selectedApp ? (
                              <Button onClick={() => setIsAppModalOpen(true)}>
                                Open builder
                              </Button>
                            ) : null}
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <MetricTile
                                label="Replicas"
                                value={selectedApp?.replicas ?? 0}
                              />
                              <MetricTile
                                label="Containers"
                                value={selectedApp?.containers?.length ?? 0}
                              />
                              <MetricTile
                                label="Volumes"
                                value={selectedApp?.volumes?.length ?? 0}
                              />
                              <MetricTile
                                label="Secrets"
                                value={
                                  selectedAppReview.secretDependencies.length
                                }
                              />
                            </div>
                            <div className="grid gap-3">
                              <ReadOnlyField
                                label="Image"
                                value={displayImageName(
                                  selectedAppPrimaryContainer?.image,
                                )}
                              />
                              <ReadOnlyField
                                label="Exposure"
                                value={displayExposureSummary(selectedApp)}
                              />
                              <ReadOnlyField
                                label="Resources"
                                value={
                                  selectedAppReview.resources.join(", ") ||
                                  "Deployment"
                                }
                              />
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="min-w-0 overflow-hidden">
                        <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                          <CardTitle>Templates And Scenarios</CardTitle>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant={
                                selectedWardLibraryTab === "templates"
                                  ? "primary"
                                  : "ghost"
                              }
                              onClick={() =>
                                setSelectedWardLibraryTab("templates")
                              }
                            >
                              Templates
                            </Button>
                            <Button
                              variant={
                                selectedWardLibraryTab === "scenarios"
                                  ? "primary"
                                  : "ghost"
                              }
                              onClick={() =>
                                setSelectedWardLibraryTab("scenarios")
                              }
                            >
                              Scenarios
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="themed-scrollbar min-w-0 grid auto-cols-[220px] grid-flow-col gap-3 overflow-x-auto pb-2">
                          {selectedWardLibraryTab === "templates" ? (
                            <>
                              <ScenarioTile
                                title="Public Python API"
                                description="Internet-exposed FastAPI with a built-in egress check."
                                tag="Public traffic"
                                compact
                                actionLabel="Add template"
                                onApply={() =>
                                  addAppTemplate("public-python-api")
                                }
                              />
                              <ScenarioTile
                                title="Internal Python API"
                                description="Cluster-only FastAPI for a quieter comparison case."
                                tag="Internal traffic"
                                compact
                                actionLabel="Add template"
                                onApply={() =>
                                  addAppTemplate("internal-python-api")
                                }
                              />
                              <ScenarioTile
                                title="Static Site Probe"
                                description="Minimal web probe for service and exposure validation."
                                tag="Smoke test"
                                compact
                                actionLabel="Add template"
                                onApply={() => addAppTemplate("static-site")}
                              />
                            </>
                          ) : (
                            scenarioBlueprintList.map((blueprint) => (
                              <ScenarioTile
                                key={blueprint.id}
                                title={blueprint.title}
                                description={blueprint.description}
                                tag={blueprint.tag}
                                compact
                                actionLabel="Load scenario"
                                onApply={() =>
                                  addScenarioBlueprint(blueprint.id)
                                }
                              />
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </CardContent>
                  ) : null}
                </Card>

                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <CardTitle>Policies</CardTitle>
                      <p className="mt-2 text-sm leading-6 text-neutral-500">
                        Kyverno and Tetragon policies are listed on the left and
                        edited on the right through a guided editor.
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={
                        isPoliciesAssetsOpen
                          ? "Collapse policies"
                          : "Expand policies"
                      }
                      title={
                        isPoliciesAssetsOpen
                          ? "Collapse policies"
                          : "Expand policies"
                      }
                      className="h-10 w-10 rounded-full px-0 text-lg"
                      onClick={() =>
                        setIsPoliciesAssetsOpen((current) => !current)
                      }
                    >
                      {isPoliciesAssetsOpen ? "−" : "+"}
                    </Button>
                  </CardHeader>
                  {isPoliciesAssetsOpen ? (
                    <CardContent className="grid gap-6 2xl:grid-cols-[460px_minmax(0,1fr)] 2xl:items-stretch">
                      <div className="grid gap-6">
                        <Card className="flex h-full min-h-[44rem] flex-col overflow-hidden">
                          <CardHeader className="flex flex-col gap-4 border-b border-border/80 px-5 py-4">
                            <CardTitle>Policies</CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                className="min-w-0 flex-1"
                                value={policySearchQuery}
                                onChange={(event) =>
                                  setPolicySearchQuery(event.target.value)
                                }
                                placeholder="Search policies"
                              />
                              <div
                                ref={policyFilterMenuRef}
                                className="relative"
                              >
                                <button
                                  type="button"
                                  aria-label="Filter policies"
                                  title="Filter policies"
                                  onClick={() =>
                                    setIsPolicyFilterMenuOpen(
                                      (current) => !current,
                                    )
                                  }
                                  className={classNames(
                                    "inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition duration-200",
                                    isPolicyFilterMenuOpen
                                      ? "border-accent/45 bg-accent/16 text-accent shadow-[0_12px_28px_rgb(var(--color-accent)_/_0.22)]"
                                      : "border-border/70 bg-card/82 text-foreground/78 shadow-[0_10px_24px_rgb(15_23_42_/_0.08)] hover:bg-accent/10 hover:text-foreground",
                                  )}
                                >
                                  <FilterIcon className="h-4 w-4" />
                                  <span>
                                    {policyFilter === "all"
                                      ? "All types"
                                      : policyFilter === "kyverno"
                                        ? "Kyverno"
                                        : "Tetragon"}
                                  </span>
                                </button>
                                {isPolicyFilterMenuOpen ? (
                                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 grid min-w-[11rem] gap-1 rounded-[1.2rem] border border-border/80 bg-card p-2 text-sm shadow-[0_18px_40px_rgb(15_23_42_/_0.12)]">
                                    {(
                                      [
                                        ["all", "All types"],
                                        ["kyverno", "Kyverno"],
                                        ["tetragon", "Tetragon"],
                                      ] as const
                                    ).map(([value, label]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        className={classNames(
                                          "rounded-[0.95rem] px-3 py-2 text-left transition",
                                          policyFilter === value
                                            ? "bg-accent/12 text-accent"
                                            : "text-foreground/82 hover:bg-accent/10 hover:text-foreground",
                                        )}
                                        onClick={() => {
                                          setPolicyFilter(value);
                                          setIsPolicyFilterMenuOpen(false);
                                        }}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div ref={policyTypeMenuRef} className="relative">
                                <IconActionButton
                                  label="Add policy"
                                  active={isPolicyTypeMenuOpen}
                                  onClick={() =>
                                    setIsPolicyTypeMenuOpen(
                                      (current) => !current,
                                    )
                                  }
                                >
                                  <span className="text-xl leading-none">
                                    +
                                  </span>
                                </IconActionButton>
                                {isPolicyTypeMenuOpen ? (
                                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 grid min-w-[11rem] gap-1 rounded-[1.2rem] border border-border/80 bg-card/96 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur">
                                    <button
                                      type="button"
                                      className="rounded-[0.95rem] px-3 py-2 text-left text-sm text-foreground/82 transition hover:bg-accent/10 hover:text-foreground"
                                      onClick={() => {
                                        addKyvernoPolicy("custom");
                                        setIsPolicyTypeMenuOpen(false);
                                      }}
                                    >
                                      Kyverno
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-[0.95rem] px-3 py-2 text-left text-sm text-foreground/82 transition hover:bg-accent/10 hover:text-foreground"
                                      onClick={() => {
                                        addTetragonPolicy("custom");
                                        setIsPolicyTypeMenuOpen(false);
                                      }}
                                    >
                                      Tetragon
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
                            <div className="flex flex-wrap gap-2">
                              <Badge>
                                {visibleKyvernoPolicies.length} Kyverno
                              </Badge>
                              <Badge>
                                {visibleTetragonPolicies.length} Tetragon
                              </Badge>
                            </div>
                            <div className="themed-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-visible pr-5 scrollbar-gutter-stable">
                              <div className="grid gap-3 pt-1">
                                <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                                  <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-1">
                                    Kyverno
                                  </span>
                                </p>
                                {visibleKyvernoPolicies.length === 0 ? (
                                  <p className="rounded-[1.2rem] border border-dashed border-border/75 bg-muted/38 px-4 py-3 text-sm text-neutral-500">
                                    No Kyverno policies match the current
                                    filter.
                                  </p>
                                ) : null}
                                {visibleKyvernoPolicies.map((policy) => (
                                  <div
                                    key={`kyverno-${policy.id}`}
                                    className="group relative"
                                  >
                                    <button
                                      className={classNames(
                                        "w-full rounded-[1.4rem] border px-4 py-4 pr-14 text-left transition",
                                        selectedPolicyRef?.engine ===
                                          "kyverno" &&
                                          selectedPolicyRef.id === policy.id
                                          ? "border-accent/70 bg-accent/10"
                                          : "border-border/80 bg-card/76 hover:bg-muted/70",
                                      )}
                                      onClick={() =>
                                        setSelectedPolicyRef({
                                          engine: "kyverno",
                                          id: policy.id,
                                        })
                                      }
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="truncate font-medium">
                                          {policy.name}
                                        </p>
                                        <Badge>
                                          {policy.enabled === false
                                            ? "Off"
                                            : "On"}
                                        </Badge>
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-warning/40 bg-card text-warning opacity-0 shadow-[0_12px_28px_rgb(15_23_42_/_0.12)] transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-warning/10"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedPolicyRef({
                                          engine: "kyverno",
                                          id: policy.id,
                                        });
                                        removeSelectedPolicy({
                                          engine: "kyverno",
                                          id: policy.id,
                                        });
                                      }}
                                      aria-label={`Delete ${policy.name}`}
                                      title={`Delete ${policy.name}`}
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="grid gap-3 pt-1">
                                <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                                  <span className="rounded-full border border-border/70 bg-muted/60 px-2 py-1">
                                    Tetragon
                                  </span>
                                </p>
                                {visibleTetragonPolicies.length === 0 ? (
                                  <p className="rounded-[1.2rem] border border-dashed border-border/75 bg-muted/38 px-4 py-3 text-sm text-neutral-500">
                                    No Tetragon policies match the current
                                    filter.
                                  </p>
                                ) : null}
                                {visibleTetragonPolicies.map((policy) => (
                                  <div
                                    key={`tetragon-${policy.id}`}
                                    className="group relative"
                                  >
                                    <button
                                      className={classNames(
                                        "w-full rounded-[1.4rem] border px-4 py-4 pr-14 text-left transition",
                                        selectedPolicyRef?.engine ===
                                          "tetragon" &&
                                          selectedPolicyRef.id === policy.id
                                          ? "border-accent/70 bg-accent/10"
                                          : "border-border/80 bg-card/76 hover:bg-muted/70",
                                      )}
                                      onClick={() =>
                                        setSelectedPolicyRef({
                                          engine: "tetragon",
                                          id: policy.id,
                                        })
                                      }
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="truncate font-medium">
                                          {policy.name}
                                        </p>
                                        <Badge>
                                          {policy.enabled === false
                                            ? "Off"
                                            : "On"}
                                        </Badge>
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-warning/40 bg-card text-warning opacity-0 shadow-[0_12px_28px_rgb(15_23_42_/_0.12)] transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-warning/10"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedPolicyRef({
                                          engine: "tetragon",
                                          id: policy.id,
                                        });
                                        removeSelectedPolicy({
                                          engine: "tetragon",
                                          id: policy.id,
                                        });
                                      }}
                                      aria-label={`Delete ${policy.name}`}
                                      title={`Delete ${policy.name}`}
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      <Card className="overflow-hidden">
                        <CardHeader className="border-b border-border/80 px-5 py-4">
                          <CardTitle>Policy Editor</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                          {!selectedPolicy || !selectedPolicyRef ? (
                            <div className="rounded-[1.6rem] border border-dashed border-border/80 bg-muted/45 px-5 py-6 text-sm text-neutral-500">
                              Select a policy to configure it.
                            </div>
                          ) : selectedPolicyRef.engine === "kyverno" &&
                            selectedKyvernoPolicy ? (
                            <>
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricTile label="Engine" value="Kyverno" />
                                <MetricTile label="Scope" value="Cluster" />
                                <MetricTile
                                  label="Enabled"
                                  value={
                                    selectedKyvernoPolicy.enabled === false
                                      ? "No"
                                      : "Yes"
                                  }
                                />
                                <MetricTile
                                  label="Rules"
                                  value={
                                    Array.isArray(
                                      (
                                        selectedKyvernoPolicy.manifest.spec as
                                          JsonObject | undefined
                                      )?.rules,
                                    )
                                      ? (
                                          (
                                            selectedKyvernoPolicy.manifest
                                              .spec as JsonObject
                                          ).rules as unknown[]
                                        ).length
                                      : 0
                                  }
                                />
                              </div>
                              <div className="grid gap-4 xl:grid-cols-2">
                                <label className="grid gap-1 text-sm">
                                  <span>Policy ID</span>
                                  <Input
                                    value={selectedKyvernoPolicy.id}
                                    onChange={(event) =>
                                      updateSelectedKyvernoPolicy(
                                        (current) => ({
                                          ...current,
                                          id: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                                <label className="grid gap-1 text-sm">
                                  <span>Name</span>
                                  <Input
                                    value={selectedKyvernoPolicy.name}
                                    onChange={(event) =>
                                      updateSelectedKyvernoPolicy(
                                        (current) => ({
                                          ...current,
                                          name: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                              </div>
                              <label className="grid gap-1 text-sm">
                                <span>Description</span>
                                <Textarea
                                  value={
                                    selectedKyvernoPolicy.description ?? ""
                                  }
                                  onChange={(event) =>
                                    updateSelectedKyvernoPolicy((current) => ({
                                      ...current,
                                      description: event.target.value,
                                    }))
                                  }
                                  className="min-h-[7rem]"
                                />
                              </label>
                              <label className="flex items-center gap-2 rounded-[1.3rem] border border-border/75 bg-card/82 px-4 py-3 text-sm text-foreground/82">
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedKyvernoPolicy.enabled !== false
                                  }
                                  onChange={(event) =>
                                    updateSelectedKyvernoPolicy((current) => ({
                                      ...current,
                                      enabled: event.target.checked,
                                    }))
                                  }
                                />
                                Enable this Kyverno policy
                              </label>
                              <PolicyManifestEditor
                                value={selectedKyvernoPolicy.manifest}
                                onCommit={(manifest) =>
                                  updateSelectedKyvernoPolicy((current) => ({
                                    ...current,
                                    manifest,
                                  }))
                                }
                              />
                            </>
                          ) : selectedTetragonPolicy ? (
                            <>
                              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <MetricTile label="Engine" value="Tetragon" />
                                <MetricTile
                                  label="Scope"
                                  value={
                                    selectedTetragonPolicy.scope === "cluster"
                                      ? "Cluster"
                                      : selectedTetragonPolicy.scope ===
                                          "namespace"
                                        ? "Namespace"
                                        : "All wards"
                                  }
                                />
                                <MetricTile
                                  label="Enabled"
                                  value={
                                    selectedTetragonPolicy.enabled === false
                                      ? "No"
                                      : "Yes"
                                  }
                                />
                                <MetricTile
                                  label="Target namespace"
                                  value={
                                    selectedTetragonPolicy.scope === "namespace"
                                      ? selectedTetragonPolicy.namespace ||
                                        "Unset"
                                      : "Derived"
                                  }
                                />
                              </div>
                              <div className="grid gap-4 xl:grid-cols-2">
                                <label className="grid gap-1 text-sm">
                                  <span>Policy ID</span>
                                  <Input
                                    value={selectedTetragonPolicy.id}
                                    onChange={(event) =>
                                      updateSelectedTetragonPolicy(
                                        (current) => ({
                                          ...current,
                                          id: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                                <label className="grid gap-1 text-sm">
                                  <span>Name</span>
                                  <Input
                                    value={selectedTetragonPolicy.name}
                                    onChange={(event) =>
                                      updateSelectedTetragonPolicy(
                                        (current) => ({
                                          ...current,
                                          name: event.target.value,
                                        }),
                                      )
                                    }
                                  />
                                </label>
                              </div>
                              <div className="grid gap-4 xl:grid-cols-2">
                                <label className="grid gap-1 text-sm">
                                  <span>Scope</span>
                                  <select
                                    className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                                    value={
                                      selectedTetragonPolicy.scope ??
                                      "all-wards"
                                    }
                                    onChange={(event) =>
                                      updateSelectedTetragonPolicy(
                                        (current) => ({
                                          ...current,
                                          scope: event.target
                                            .value as TetragonTracingPolicyConfig["scope"],
                                        }),
                                      )
                                    }
                                  >
                                    <option value="all-wards">All wards</option>
                                    <option value="namespace">
                                      Single namespace
                                    </option>
                                    <option value="cluster">
                                      Cluster-wide
                                    </option>
                                  </select>
                                </label>
                                <label className="grid gap-1 text-sm">
                                  <span>Namespace</span>
                                  <select
                                    className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                                    value={
                                      selectedTetragonPolicy.namespace ?? ""
                                    }
                                    onChange={(event) =>
                                      updateSelectedTetragonPolicy(
                                        (current) => ({
                                          ...current,
                                          namespace: event.target.value,
                                        }),
                                      )
                                    }
                                    disabled={
                                      (selectedTetragonPolicy.scope ??
                                        "all-wards") !== "namespace"
                                    }
                                  >
                                    <option value="">Select ward</option>
                                    {subjectKeys.map((subjectKey) => (
                                      <option
                                        key={subjectKey}
                                        value={subjectKey}
                                      >
                                        {subjectKey}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label className="grid gap-1 text-sm">
                                <span>Description</span>
                                <Textarea
                                  value={
                                    selectedTetragonPolicy.description ?? ""
                                  }
                                  onChange={(event) =>
                                    updateSelectedTetragonPolicy((current) => ({
                                      ...current,
                                      description: event.target.value,
                                    }))
                                  }
                                  className="min-h-[7rem]"
                                />
                              </label>
                              <label className="flex items-center gap-2 rounded-[1.3rem] border border-border/75 bg-card/82 px-4 py-3 text-sm text-foreground/82">
                                <input
                                  type="checkbox"
                                  checked={
                                    selectedTetragonPolicy.enabled !== false
                                  }
                                  onChange={(event) =>
                                    updateSelectedTetragonPolicy((current) => ({
                                      ...current,
                                      enabled: event.target.checked,
                                    }))
                                  }
                                />
                                Enable this Tetragon policy
                              </label>
                              <PolicyManifestEditor
                                value={selectedTetragonPolicy.manifest}
                                onCommit={(manifest) =>
                                  updateSelectedTetragonPolicy((current) => ({
                                    ...current,
                                    manifest,
                                  }))
                                }
                              />
                            </>
                          ) : null}
                        </CardContent>
                      </Card>
                    </CardContent>
                  ) : null}
                </Card>
              </div>
            ) : null}

            {activeTab === "activity" ? (
              <div className="grid h-full min-h-0 gap-6 2xl:grid-cols-[340px_minmax(0,1fr)] 2xl:items-stretch">
                <Card className="flex h-full min-h-[24rem] flex-col overflow-hidden border-border/70 bg-card/88 shadow-[0_18px_40px_rgb(15_23_42_/_0.12)]">
                  <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Runs</CardTitle>
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void pruneRunHistory(10)}
                      disabled={isBusy || runs.length <= 10}
                    >
                      Keep latest 10
                    </Button>
                  </CardHeader>
                  <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="themed-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {runs.length === 0 ? (
                        <p className="text-sm text-neutral-500">No runs.</p>
                      ) : null}
                      {runs.map((run) => (
                        <button
                          key={run.id}
                          className={classNames(
                            "w-full rounded-[1.4rem] border px-4 py-4 text-left shadow-[0_10px_24px_rgb(15_23_42_/_0.08)] transition",
                            selectedRunId === run.id
                              ? "border-accent/75 bg-accent/12"
                              : "border-border/80 bg-card/88 hover:bg-muted/78",
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
                              <p className="font-medium">
                                {stageLabel(run.stage)} {run.kind}
                              </p>
                              <p className="mt-1 text-xs text-neutral-500">
                                {run.id}
                              </p>
                            </div>
                            <Badge
                              className={
                                statusTone(run.status) === "danger"
                                  ? "border-warning/30 bg-warning/10 text-warning"
                                  : ""
                              }
                            >
                              {run.status}
                              {run.queue_position
                                ? ` #${run.queue_position}`
                                : ""}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid min-w-0 gap-6">
                  <Card className="flex min-h-0 flex-col border-border/70 bg-card/88 shadow-[0_18px_40px_rgb(15_23_42_/_0.12)]">
                    <CardHeader>
                      <CardTitle>Run Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
                      {selectedRun ? (
                        <>
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="min-w-0 rounded-[1.8rem] border border-border/85 bg-muted/68 p-5 shadow-[0_16px_36px_rgb(15_23_42_/_0.10)]">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                Selected run
                              </p>
                              <p className="mt-3 break-words text-2xl font-semibold">
                                {stageLabel(selectedRun.stage)}{" "}
                                {selectedRun.kind}
                              </p>
                              <div className="mt-4 grid gap-3">
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                                    Status
                                  </span>
                                  <span className="break-words text-sm font-medium text-foreground">
                                    {selectedRun.status}
                                    {selectedRun.queue_position
                                      ? ` • Queue #${selectedRun.queue_position}`
                                      : ""}
                                  </span>
                                </div>
                                <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                  <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                                    Run ID
                                  </span>
                                  <span className="break-all text-sm text-foreground/80">
                                    {selectedRun.id}
                                  </span>
                                </div>
                                {selectedRun.started_at ||
                                selectedRun.completed_at ? (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {selectedRun.started_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                                          Started
                                        </span>
                                        <span className="break-words text-sm text-foreground/80">
                                          {formatRunTimestamp(
                                            selectedRun.started_at,
                                          )}
                                        </span>
                                      </div>
                                    ) : null}
                                    {selectedRun.completed_at ? (
                                      <div className="grid gap-1 rounded-[1rem] border border-border/70 bg-card/70 px-4 py-3">
                                        <span className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">
                                          Completed
                                        </span>
                                        <span className="break-words text-sm text-foreground/80">
                                          {formatRunTimestamp(
                                            selectedRun.completed_at,
                                          )}
                                        </span>
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
                                        onClick={() =>
                                          void copySelectedRunLogs()
                                        }
                                        title="Copy logs"
                                        aria-label="Copy logs"
                                      >
                                        <svg
                                          viewBox="0 0 24 24"
                                          className="h-5 w-5"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          aria-hidden="true"
                                        >
                                          <rect
                                            x="9"
                                            y="9"
                                            width="10"
                                            height="10"
                                            rx="2"
                                          />
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
                                <div className="rounded-[1.8rem] border border-border/85 bg-muted/68 p-5 shadow-[0_16px_36px_rgb(15_23_42_/_0.10)]">
                                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                    Destroy run
                                  </p>
                                  <p className="mt-3 text-sm leading-6 text-foreground/75">
                                    This run removes the resources managed by
                                    the{" "}
                                    {stageLabel(
                                      selectedRun.stage,
                                    ).toLowerCase()}{" "}
                                    stage directly from Terraform state and the
                                    target platform.
                                  </p>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                                    <MetricTile
                                      label="Stage"
                                      value={stageLabel(selectedRun.stage)}
                                    />
                                    <MetricTile label="Mode" value="Destroy" />
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-[1.8rem] border border-border/85 bg-muted/68 p-5 shadow-[0_16px_36px_rgb(15_23_42_/_0.10)]">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                        {planSummaryLabel}
                                      </p>
                                      {selectedRun.kind === "apply" ? (
                                        <p className="mt-2 max-w-xl text-sm text-foreground/70">
                                          These counts come from the saved plan
                                          that this apply executed. They are not
                                          a record of what finished
                                          successfully.
                                        </p>
                                      ) : null}
                                    </div>
                                    {selectedRun.kind === "apply" &&
                                    sourcePlanRun ? (
                                      <Badge className="whitespace-nowrap border-border/80 bg-card/80 text-foreground/75">
                                        Source plan {sourcePlanRun.id}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <MetricTile
                                      label="Create"
                                      value={displayedPlanSummary?.create ?? 0}
                                      className="border-border/85 bg-background/92 shadow-[0_14px_32px_rgb(15_23_42_/_0.08),inset_0_1px_0_rgb(var(--color-card)_/_0.18)]"
                                    />
                                    <MetricTile
                                      label="Update"
                                      value={displayedPlanSummary?.update ?? 0}
                                      className="border-border/85 bg-background/92 shadow-[0_14px_32px_rgb(15_23_42_/_0.08),inset_0_1px_0_rgb(var(--color-card)_/_0.18)]"
                                    />
                                    <MetricTile
                                      label="Delete"
                                      value={displayedPlanSummary?.delete ?? 0}
                                      className="border-border/85 bg-background/92 shadow-[0_14px_32px_rgb(15_23_42_/_0.08),inset_0_1px_0_rgb(var(--color-card)_/_0.18)]"
                                    />
                                    <MetricTile
                                      label="Replace"
                                      value={displayedPlanSummary?.replace ?? 0}
                                      className="border-border/85 bg-background/92 shadow-[0_14px_32px_rgb(15_23_42_/_0.08),inset_0_1px_0_rgb(var(--color-card)_/_0.18)]"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {selectedRun.kind !== "destroy" ? (
                            <div className="flex min-h-0 flex-col rounded-[1.8rem] border border-border/85 bg-muted/68 p-5 shadow-[0_16px_36px_rgb(15_23_42_/_0.10)]">
                              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                                {selectedRun.kind === "apply"
                                  ? "Resources in saved plan"
                                  : "Changed resources"}
                              </p>
                              <div className="themed-scrollbar mt-4 min-h-[12rem] max-h-[18rem] overflow-auto rounded-[1.2rem] border border-border/80 bg-card/85 p-4 text-sm text-foreground/80">
                                {(displayedPlanSummary?.addresses ?? [])
                                  .length === 0 ? (
                                  <p>No structured plan summary yet.</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {(
                                      displayedPlanSummary?.addresses ?? []
                                    ).map((address) => (
                                      <li key={address} className="break-all">
                                        {address}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm text-neutral-500">
                          Select a run.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] xl:items-stretch">
                    <Card className="flex h-full flex-col border-border/70 bg-card/88 shadow-[0_18px_40px_rgb(15_23_42_/_0.12)]">
                      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle>Run Logs</CardTitle>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={autoScrollLogs ? "secondary" : "ghost"}
                            className="px-3 py-1.5 text-xs"
                            onClick={() =>
                              setAutoScrollLogs((current) => !current)
                            }
                          >
                            Auto-scroll {autoScrollLogs ? "On" : "Off"}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1">
                        <div className="flex min-h-[16rem] max-h-[40rem] flex-1 flex-col overflow-hidden rounded-[1.2rem] border border-border/70 bg-card/92 shadow-[0_14px_32px_rgb(15_23_42_/_0.08),inset_0_1px_0_rgb(var(--color-card)_/_0.14)]">
                          <div className="flex items-center justify-between gap-3 border-b border-border/55 bg-background/82 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-foreground/72">
                            <span>
                              {selectedRun
                                ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}`
                                : "No run selected"}
                            </span>
                            <span>
                              {selectedRunLogs.length} lines •{" "}
                              {groupedSelectedRunLogs.length} entries
                            </span>
                          </div>
                          <div
                            ref={logsViewportRef}
                            className="themed-scrollbar min-h-0 flex-1 overflow-auto p-4 pr-5 font-mono text-xs text-foreground/88"
                          >
                            {groupedSelectedRunLogs.length > 0 ? (
                              <div className="space-y-2.5">
                                {groupedSelectedRunLogs.map((group, index) =>
                                  (() => {
                                    const entry =
                                      group.kind === "structured"
                                        ? group.entry
                                        : null;
                                    const message =
                                      group.kind === "structured"
                                        ? group.entry.message
                                        : group.message;
                                    return (
                                      <div
                                        key={`${index}-${group.startLineNumber}-${group.endLineNumber}`}
                                        className="rounded-[1rem] border border-border/55 bg-background/88 px-3 py-2.5 shadow-[0_12px_28px_rgb(15_23_42_/_0.12)]"
                                      >
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em]">
                                          <span className="rounded-full border border-accent/18 bg-accent/10 px-2 py-1 text-accent">
                                            {group.startLineNumber ===
                                            group.endLineNumber
                                              ? group.startLineNumber
                                              : `${group.startLineNumber}-${group.endLineNumber}`}
                                          </span>
                                          {entry?.level ? (
                                            <span
                                              className={`rounded-full border px-2 py-1 ${logLevelTone(entry.level)}`}
                                            >
                                              {entry.level}
                                            </span>
                                          ) : null}
                                          {entry?.source ? (
                                            <span className="text-accent/82">
                                              {entry.source}
                                            </span>
                                          ) : null}
                                          {entry?.address ? (
                                            <span className="break-all text-foreground/62">
                                              {entry.address}
                                            </span>
                                          ) : null}
                                          {entry?.timestamp ? (
                                            <span className="text-foreground/58">
                                              {formatRunTimestamp(
                                                entry.timestamp,
                                              )}
                                            </span>
                                          ) : null}
                                        </div>
                                        <p className="mt-2 break-words whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
                                          {message}
                                        </p>
                                        {entry?.detail ? (
                                          <p className="mt-2 break-words whitespace-pre-wrap font-sans text-xs leading-5 text-accent/82">
                                            {entry.detail}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })(),
                                )}
                              </div>
                            ) : (
                              <p className="text-foreground/62">No logs yet.</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="flex h-full flex-col border-border/70 bg-card/88 shadow-[0_18px_40px_rgb(15_23_42_/_0.12)]">
                      <CardHeader>
                        <CardTitle>Terraform Outputs</CardTitle>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1">
                        <div className="themed-scrollbar min-h-[16rem] max-h-[40rem] flex-1 overflow-auto pr-2">
                          {hasTerraformOutputs(outputs) ? (
                            <div className="space-y-4">
                              {Object.entries(outputs ?? {}).map(
                                ([key, entry]) => {
                                  const normalized =
                                    formatTerraformOutputValue(entry);
                                  return (
                                    <div
                                      key={key}
                                      className="min-w-0 rounded-[1rem] border border-border/78 bg-card/86 p-4 shadow-[0_12px_28px_rgb(15_23_42_/_0.10)]"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <p className="min-w-0 flex-1 break-all font-mono text-xs uppercase tracking-[0.2em] text-neutral-500">
                                          {key}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {normalized.sensitive ? (
                                            <Badge className="border-warning/40 bg-warning/12 text-warning">
                                              Sensitive
                                            </Badge>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="mt-3 overflow-hidden rounded-[0.9rem] border border-border/60 bg-background/58 shadow-[inset_0_1px_0_rgb(var(--color-card)_/_0.12)]">
                                        <pre className="themed-scrollbar scrollbar-gutter-stable max-h-[18rem] w-full overflow-auto whitespace-pre px-3 py-3 font-mono text-xs leading-6 text-foreground/82">
                                          {normalized.sensitive
                                            ? "(sensitive output)"
                                            : typeof normalized.value ===
                                                "string"
                                              ? normalized.value
                                              : prettyPrint(normalized.value)}
                                        </pre>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          ) : (
                            <div className="flex min-h-[16rem] items-center justify-center text-sm text-neutral-500">
                              No outputs available.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "accounts" ? (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Accounts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="surface-strong rounded-[1.8rem] p-6">
                      <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">
                        Accounts Preview
                      </p>
                      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                        User accounts will replace the old infrastructure access
                        model here.
                      </h2>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        This page is reserved for sign-in state, user profiles,
                        membership, and role-based access once the managed
                        sign-in flow is in place. Infrastructure ARNs are no
                        longer edited from the control plane.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label="Identity"
                        value="Coming soon"
                        hint="Managed session-backed login"
                      />
                      <MetricTile
                        label="Roles"
                        value="Planned"
                        hint="Viewer, operator, admin"
                      />
                      <MetricTile
                        label="Provisioning"
                        value="Pending"
                        hint="Organization-scoped user access"
                      />
                      <MetricTile
                        label="Current Auth"
                        value="Shared token"
                        hint="Temporary model until accounts land"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </div>

        <Modal
          title="Cluster Status"
          open={isClusterInfoOpen}
          onClose={() => setIsClusterInfoOpen(false)}
        >
          <div className="grid gap-6">
            <div className="surface-strong rounded-[2rem] p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">
                    Cluster Status
                  </p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                    Keep the important context visible while you work.
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-400">
                    Shape workloads, stage Terraform safely, and hand off to
                    native observability tools without losing the current
                    cluster context.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Infra-owned foundation</Badge>
                  <Badge>{config.core.cluster_name}</Badge>
                  <Badge>{config.core.environment}</Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricTile label="Status" value={statusMessage || "Ready"} />
                <MetricTile
                  label="Queue"
                  value={
                    selectedRun?.queue_position
                      ? `#${selectedRun.queue_position}`
                      : "Idle"
                  }
                  hint={
                    selectedRun
                      ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}`
                      : "No active run"
                  }
                />
                <MetricTile
                  label="Applications"
                  value={config.applications.ward_applications.length}
                />
                <MetricTile label="Containers" value={totalContainers} />
              </div>

              <div className="surface-strong rounded-[1.9rem] p-5">
                <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">
                  Working Set
                </p>
                <div className="mt-4 grid gap-3">
                  <ReadOnlyField
                    label="Selected Ward"
                    value={selectedSubjectKey || "None"}
                  />
                  <ReadOnlyField
                    label="Selected Application"
                    value={selectedApp?.name ?? "None"}
                  />
                  <ReadOnlyField
                    label="API Token"
                    value={apiTokenValue || "Not set"}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="surface-strong rounded-[1.9rem] p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-2xl">
                    <p className="text-xs uppercase tracking-[0.34em] text-neutral-500">
                      Shared Infrastructure
                    </p>
                    <h4 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                      Foundation details live here, not in the operator flow.
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-foreground/66">
                      Core and platform are managed outside this control plane.
                      Reconcile shared AWS and cluster layers through the
                      infrastructure pipeline, then use this UI for policy and
                      workload changes.
                    </p>
                  </div>
                  <Badge>Infra-owned</Badge>
                </div>

                <div className="mt-5">
                  <StageNotice
                    title="Ownership Boundary"
                    body={sharedInfrastructureNotice}
                  />
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField
                    label="Project"
                    value={config.core.project_name}
                  />
                  <ReadOnlyField
                    label="Environment"
                    value={config.core.environment}
                  />
                  <ReadOnlyField
                    label="Cluster"
                    value={config.core.cluster_name}
                  />
                  <ReadOnlyField
                    label="Kubernetes"
                    value={config.core.kubernetes_version}
                  />
                  <ReadOnlyField
                    label="Log Retention"
                    value={`${config.core.cluster_log_retention_in_days} days`}
                  />
                  <ReadOnlyField
                    label="Configured admin principals"
                    value={String(configuredAdminArnsCount)}
                  />
                </div>
              </div>

              <div className="surface-soft rounded-[1.9rem] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                  Current Run
                </p>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold tracking-tight">
                      {selectedRun
                        ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}`
                        : "No selected run"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                      {selectedRun
                        ? `Status: ${selectedRun.status}`
                        : "Move to Activity to inspect queued and completed work."}
                    </p>
                  </div>
                  {selectedRun ? <Badge>{selectedRun.status}</Badge> : null}
                </div>

                <div className="mt-6 grid gap-3">
                  <MetricTile
                    label="Run queue position"
                    value={
                      selectedRun?.queue_position
                        ? `#${selectedRun.queue_position}`
                        : "None"
                    }
                    hint="Only queued runs receive a queue index."
                  />
                  <MetricTile
                    label="Last focus"
                    value={
                      selectedRun
                        ? `${stageLabel(selectedRun.stage)} ${selectedRun.kind}`
                        : "Activity tab"
                    }
                    hint="Use Activity for logs, outputs, and historical runs."
                  />
                </div>
              </div>
            </div>
          </div>
        </Modal>

        <Modal
          title="Edit Ward"
          open={isSubjectModalOpen && Boolean(selectedSubject)}
          onClose={() => setIsSubjectModalOpen(false)}
        >
          {selectedSubject ? (
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Ward namespace</span>
                  <Input
                    value={selectedSubjectKey}
                    onChange={(event) =>
                      renameSubject(selectedSubjectKey, event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Tier</span>
                  <Input
                    value={selectedSubject.tier ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        tier: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span>Description</span>
                <Input
                  value={selectedSubject.description ?? ""}
                  onChange={(event) =>
                    updateSelectedSubject((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <KeyValueEditor
                label="Labels"
                value={selectedSubject.labels}
                onChange={(labels) =>
                  updateSelectedSubject((current) => ({
                    ...current,
                    labels,
                  }))
                }
                addLabel="Add label"
                rowsClassName="themed-scrollbar max-h-[16rem] overflow-y-auto pr-2"
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                <label className="grid gap-1 text-sm">
                  <span>Pods</span>
                  <Input
                    value={selectedSubject.resource_quota?.pods ?? ""}
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: {
                          ...current.resource_quota,
                          pods: event.target.value,
                        },
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
                        resource_quota: {
                          ...current.resource_quota,
                          requests_cpu: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Memory request</span>
                  <Input
                    value={
                      selectedSubject.resource_quota?.requests_memory ?? ""
                    }
                    onChange={(event) =>
                      updateSelectedSubject((current) => ({
                        ...current,
                        resource_quota: {
                          ...current.resource_quota,
                          requests_memory: event.target.value,
                        },
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
                        resource_quota: {
                          ...current.resource_quota,
                          limits_cpu: event.target.value,
                        },
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
                        resource_quota: {
                          ...current.resource_quota,
                          limits_memory: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          title="Edit Application"
          open={isAppModalOpen && Boolean(selectedApp)}
          onClose={() => setIsAppModalOpen(false)}
        >
          {selectedApp ? (
            <div className="grid gap-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Quick setup</p>
                      <p className="mt-2 text-sm leading-6 text-neutral-500">
                        These are the fields that matter most when you want a
                        working app quickly.
                      </p>
                    </div>
                    <Badge>{selectedApp.namespace}</Badge>
                  </div>
                  <div className="grid gap-4">
                    <div className="grid gap-3 xl:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        <span>Name</span>
                        <Input
                          value={selectedApp.name}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              name: kubeSafeName(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Ward namespace</span>
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={selectedApp.namespace}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              namespace: event.target.value,
                            }))
                          }
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
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              replicas: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span>Exposure</span>
                        <select
                          className="w-full rounded-2xl border border-border bg-card px-4 py-2 text-sm text-foreground"
                          value={
                            appExposureEnabled(selectedApp)
                              ? "public"
                              : "internal"
                          }
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              service: {
                                ...current.service,
                                enabled: true,
                              },
                              exposure: {
                                ...current.exposure,
                                enabled: event.target.value === "public",
                                host:
                                  event.target.value === "public"
                                    ? current.exposure?.host?.trim() ||
                                      `${current.name}.lab.internal`
                                    : "",
                              } as ExposureConfig,
                              connectivity: {
                                ...current.connectivity,
                                internet_ingress_enabled:
                                  event.target.value === "public",
                              } as ConnectivityConfig,
                            }))
                          }
                        >
                          <option value="internal">
                            Internal service only
                          </option>
                          <option value="public">Internet exposed</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Health path</span>
                        <Input
                          value={
                            selectedAppPrimaryContainer?.probes?.readiness
                              ?.path ?? "/"
                          }
                          onChange={(event) =>
                            updateSelectedPrimaryContainer((current) => ({
                              ...current,
                              probes: {
                                ...current.probes,
                                readiness: {
                                  ...current.probes?.readiness,
                                  enabled: true,
                                  path: event.target.value,
                                  port: current.port ?? 8080,
                                },
                                liveness: {
                                  ...current.probes?.liveness,
                                  enabled: true,
                                  path: event.target.value,
                                  port: current.port ?? 8080,
                                },
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
                          onChange={(event) =>
                            updateSelectedPrimaryContainer((current) => ({
                              ...current,
                              image: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Primary port</span>
                        <Input
                          type="number"
                          value={String(
                            selectedAppPrimaryContainer?.port ?? 8080,
                          )}
                          onChange={(event) => {
                            const nextPort = Number(event.target.value);
                            updateSelectedPrimaryContainer((current) => ({
                              ...current,
                              port: nextPort,
                              probes: {
                                ...current.probes,
                                readiness: {
                                  ...current.probes?.readiness,
                                  port: nextPort,
                                },
                                liveness: {
                                  ...current.probes?.liveness,
                                  port: nextPort,
                                },
                                startup: {
                                  ...current.probes?.startup,
                                  port: nextPort,
                                },
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
                              service: {
                                ...current.service,
                                enabled: event.target.checked,
                              },
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
                              config_map: {
                                ...current.config_map,
                                enabled: event.target.checked,
                              },
                            }))
                          }
                        />
                        Mount app files from ConfigMap
                      </label>
                      <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                        <input
                          type="checkbox"
                          checked={
                            selectedApp.allow_same_namespace_ingress ?? true
                          }
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              allow_same_namespace_ingress:
                                event.target.checked,
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
                      The interface should push you toward a successful deploy,
                      so this review calls out what still needs attention.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <MetricTile
                        label="Blocking issues"
                        value={selectedAppReview.errors.length}
                      />
                      <MetricTile
                        label="Warnings"
                        value={selectedAppReview.warnings.length}
                      />
                      <MetricTile
                        label="Resources"
                        value={
                          selectedAppReview.resources.length || "Deployment"
                        }
                      />
                      <MetricTile
                        label="Secrets"
                        value={selectedAppReview.secretDependencies.length}
                      />
                    </div>
                    <div className="mt-4 grid gap-3">
                      <ReviewItems
                        title="Fix before deploy"
                        tone="error"
                        items={selectedAppReview.errors}
                      />
                      <ReviewItems
                        title="Worth checking"
                        tone="warning"
                        items={selectedAppReview.warnings}
                      />
                      <ReviewItems
                        title="Good to know"
                        tone="hint"
                        items={selectedAppReview.hints}
                      />
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
                      Secret-backed values are intentionally not created
                      automatically here because they would land in Terraform
                      state.
                    </p>
                    {selectedAppReview.secretDependencies.length > 0 ? (
                      <div className="mt-3 rounded-[1.2rem] border border-border/50 bg-border/14 px-4 py-3 text-sm text-foreground">
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
                        config_map: {
                          ...current.config_map,
                          mount_path: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Primary file name</span>
                  <Input
                    value={selectedAppPrimaryConfigFile[0]}
                    onChange={(event) =>
                      updateSelectedPrimaryConfigFile(
                        event.target.value,
                        selectedAppPrimaryConfigFile[1],
                      )
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Primary file content</span>
                  <Textarea
                    value={selectedAppPrimaryConfigFile[1]}
                    onChange={(event) =>
                      updateSelectedPrimaryConfigFile(
                        selectedAppPrimaryConfigFile[0],
                        event.target.value,
                      )
                    }
                    className="min-h-[280px]"
                  />
                </label>
                <KeyValueEditor
                  label="Additional ConfigMap files"
                  value={Object.fromEntries(
                    Object.entries(selectedApp.config_map?.data ?? {}).slice(1),
                  )}
                  onChange={(data) =>
                    updateSelectedApp((current) => ({
                      ...current,
                      config_map: {
                        ...current.config_map,
                        data: {
                          [selectedAppPrimaryConfigFile[0]]:
                            selectedAppPrimaryConfigFile[1],
                          ...data,
                        },
                      },
                    }))
                  }
                  addLabel="Add file"
                />
              </EditorSection>

              <EditorSection
                title="Service & Exposure"
                summary="Tighten how the app is exposed and which internet flows the later Cilium phases should allow."
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
                            service: {
                              ...current.service,
                              type: event.target.value,
                            },
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
                            service: {
                              ...current.service,
                              port: Number(event.target.value),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>Target port</span>
                      <Input
                        type="number"
                        value={String(
                          selectedApp.service?.target_port ??
                            selectedApp.service?.port ??
                            8080,
                        )}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            service: {
                              ...current.service,
                              target_port: Number(event.target.value),
                            },
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
                      <span>Host</span>
                      <Input
                        value={appExposureHost(selectedApp)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            exposure: {
                              ...current.exposure,
                              host: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span>TLS secret name</span>
                      <Input
                        value={appExposureTlsSecret(selectedApp)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            exposure: {
                              ...current.exposure,
                              tls_secret_name: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <div className="grid gap-3 xl:grid-cols-2">
                      <label className="grid gap-1 text-sm">
                        <span>Path</span>
                        <Input
                          value={appExposurePath(selectedApp)}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              exposure: {
                                ...current.exposure,
                                path: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span>Path type</span>
                        <Input
                          value={appExposurePathType(selectedApp)}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              exposure: {
                                ...current.exposure,
                                path_type: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={appInternetIngressEnabled(selectedApp)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            connectivity: {
                              ...current.connectivity,
                              internet_ingress_enabled: event.target.checked,
                            },
                          }))
                        }
                      />
                      Allow internet ingress
                    </label>
                    <label className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={appInternetEgressEnabled(selectedApp)}
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            connectivity: {
                              ...current.connectivity,
                              internet_egress_enabled: event.target.checked,
                            },
                          }))
                        }
                      />
                      Allow internet egress
                    </label>
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
                      onChange={(pod_annotations) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          pod_annotations,
                        }))
                      }
                      addLabel="Add annotation"
                    />
                    <KeyValueEditor
                      label="Pod labels"
                      value={selectedApp.pod_labels}
                      onChange={(pod_labels) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          pod_labels,
                        }))
                      }
                      addLabel="Add label"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        checked={
                          selectedApp.automount_service_account_token ?? false
                        }
                        onChange={(event) =>
                          updateSelectedApp((current) => ({
                            ...current,
                            automount_service_account_token:
                              event.target.checked,
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
                          containers: [
                            ...(current.containers ?? []),
                            emptyContainer(),
                          ],
                        }))
                      }
                    >
                      Add container
                    </Button>
                  </div>
                  {(selectedApp.containers ?? []).map((container, index) => (
                    <ContainerEditor
                      key={`container-row-${index}`}
                      index={index}
                      container={container}
                      onChange={(nextContainer) =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).map(
                            (item, itemIndex) =>
                              itemIndex === index ? nextContainer : item,
                          ),
                        }))
                      }
                      onRemove={() =>
                        updateSelectedApp((current) => ({
                          ...current,
                          containers: (current.containers ?? []).filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
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
                  {(selectedApp.volumes ?? []).length === 0 ? (
                    <p className="text-sm text-neutral-500">No volumes.</p>
                  ) : null}
                  {(selectedApp.volumes ?? []).map((volume, index) => {
                    const volumeType = volume.empty_dir
                      ? "empty_dir"
                      : volume.secret_name
                        ? "secret"
                        : volume.config_map_name
                          ? "config_map"
                          : "empty_dir";
                    return (
                      <div
                        key={`volume-row-${index}`}
                        className="grid gap-3 rounded-2xl border border-border bg-muted/60 p-4 2xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)_auto]"
                      >
                        <Input
                          value={volume.name}
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, name: event.target.value }
                                    : item,
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
                              volumes: (current.volumes ?? []).map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        name: item.name,
                                        empty_dir:
                                          event.target.value === "empty_dir"
                                            ? true
                                            : undefined,
                                        secret_name:
                                          event.target.value === "secret"
                                            ? (item.secret_name ?? "app-secret")
                                            : undefined,
                                        config_map_name:
                                          event.target.value === "config_map"
                                            ? (item.config_map_name ??
                                              "app-config")
                                            : undefined,
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
                          value={
                            volume.secret_name ?? volume.config_map_name ?? ""
                          }
                          placeholder={
                            volumeType === "secret"
                              ? "Secret name"
                              : volumeType === "config_map"
                                ? "ConfigMap name"
                                : "No extra value"
                          }
                          onChange={(event) =>
                            updateSelectedApp((current) => ({
                              ...current,
                              volumes: (current.volumes ?? []).map(
                                (item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        empty_dir:
                                          volumeType === "empty_dir"
                                            ? true
                                            : undefined,
                                        secret_name:
                                          volumeType === "secret"
                                            ? event.target.value
                                            : undefined,
                                        config_map_name:
                                          volumeType === "config_map"
                                            ? event.target.value
                                            : undefined,
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
                              volumes: (current.volumes ?? []).filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
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
