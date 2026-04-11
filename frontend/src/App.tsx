import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import type { TerraformConfig, TerraformRun } from "./lib/types";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function emptyAppTemplate(): Record<string, unknown> {
  return {
    name: "new-template-app",
    namespace: "ward-template-app",
    replicas: 1,
    service: {
      port: 8080,
    },
    containers: [
      {
        name: "app",
        image: "nginxinc/nginx-unprivileged:1.27-alpine",
      },
    ],
  };
}

export default function App() {
  const [config, setConfig] = useState<TerraformConfig | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [appEditor, setAppEditor] = useState("");
  const [subjectsEditor, setSubjectsEditor] = useState("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [runs, setRuns] = useState<TerraformRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<TerraformRun | null>(null);
  const [selectedRunLogs, setSelectedRunLogs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<Record<string, unknown> | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const selectedApp = useMemo(() => {
    if (!config) return null;
    return config.ward_applications[selectedIndex] ?? null;
  }, [config, selectedIndex]);

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (selectedApp) {
      setAppEditor(pretty(selectedApp));
    }
  }, [selectedApp]);

  useEffect(() => {
    if (config) {
      setSubjectsEditor(pretty(config.analysis_subjects));
    }
  }, [config?.analysis_subjects]);

  useEffect(() => {
    if (!selectedRun) return;
    const timer = window.setInterval(() => {
      void refreshRun(selectedRun.id);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [selectedRun?.id]);

  async function loadInitial() {
    try {
      const [loadedConfig, runResponse] = await Promise.all([api.getConfig(), api.listRuns()]);
      setConfig(loadedConfig);
      setRuns(runResponse.items);
      if (runResponse.items[0]) {
        setSelectedRun(runResponse.items[0]);
        await refreshRun(runResponse.items[0].id);
      } else {
        await refreshOutputs();
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  async function refreshRun(runId: string) {
    try {
      const [run, logs] = await Promise.all([api.getRun(runId), api.getRunLogs(runId)]);
      setSelectedRun(run);
      setSelectedRunLogs(logs.logs);
      const refreshedRuns = await api.listRuns();
      setRuns(refreshedRuns.items);
      if (run.outputs) {
        setOutputs(run.outputs);
      }
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  async function refreshOutputs() {
    try {
      const response = await api.getOutputs();
      setOutputs(response.outputs);
    } catch {
      setOutputs(null);
    }
  }

  function updateConfig(mutator: (current: TerraformConfig) => TerraformConfig) {
    setConfig((current) => (current ? mutator(current) : current));
  }

  function updateSelectedAppField(field: string, value: string | number | boolean) {
    updateConfig((current) => {
      const next = structuredClone(current);
      const app = { ...(next.ward_applications[selectedIndex] as Record<string, unknown>) };
      app[field] = value;
      next.ward_applications[selectedIndex] = app;
      return next;
    });
  }

  function commitEditorsToState(): TerraformConfig | null {
    if (!config) return null;
    try {
      const parsedApp = JSON.parse(appEditor) as Record<string, unknown>;
      const parsedSubjects = JSON.parse(subjectsEditor) as Record<string, Record<string, unknown>>;
      const next = structuredClone(config);
      next.ward_applications[selectedIndex] = parsedApp;
      next.analysis_subjects = parsedSubjects as TerraformConfig["analysis_subjects"];
      setConfig(next);
      setErrorMessage("");
      return next;
    } catch (error) {
      setErrorMessage(`JSON parse error: ${(error as Error).message}`);
      return null;
    }
  }

  async function saveConfig(): Promise<boolean> {
    const next = commitEditorsToState();
    if (!next) return false;
    setIsBusy(true);
    try {
      const saved = await api.saveConfig(next);
      setConfig(saved);
      setStatusMessage("Configuration saved to frontend-managed.auto.tfvars.json");
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
      setSelectedIndex(0);
      setStatusMessage("Managed config reset to the default template.");
      setErrorMessage("");
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startPlan() {
    setIsBusy(true);
    try {
      const didSave = await saveConfig();
      if (!didSave) {
        return;
      }
      const run = await api.startPlan();
      setSelectedRun(run);
      setStatusMessage("Terraform plan started.");
      await refreshRun(run.id);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  async function startApply() {
    if (!selectedRun || selectedRun.status !== "planned") {
      setErrorMessage("Create a successful plan before applying.");
      return;
    }
    setIsBusy(true);
    try {
      const run = await api.startApply(selectedRun.id);
      setSelectedRun(run);
      setStatusMessage("Terraform apply started.");
      await refreshRun(run.id);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsBusy(false);
    }
  }

  function addAppFromTemplate() {
    updateConfig((current) => {
      const next = structuredClone(current);
      const source = (next.ward_applications[selectedIndex] as Record<string, unknown>) ?? emptyAppTemplate();
      const clone = structuredClone(source);
      const baseName = String(clone.name ?? "template-app");
      clone.name = `${baseName}-copy`;
      next.ward_applications.push(clone);
      return next;
    });
    setSelectedIndex((index) => (config ? config.ward_applications.length : index));
  }

  function addBlankApp() {
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications.push(emptyAppTemplate());
      return next;
    });
    setSelectedIndex((index) => (config ? config.ward_applications.length : index));
  }

  function removeSelectedApp() {
    if (!config || config.ward_applications.length <= 1) return;
    updateConfig((current) => {
      const next = structuredClone(current);
      next.ward_applications.splice(selectedIndex, 1);
      return next;
    });
    setSelectedIndex((index) => Math.max(0, index - 1));
  }

  return (
    <div className="app-shell">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="panel overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-neutral-500">KubeGuardian Control Plane</p>
              <h1 className="mt-3 text-3xl font-bold md:text-5xl">Terraform-backed app templates without the manual diff fatigue.</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-neutral-600 md:text-base">
                Edit the reference application, clone it, plan changes, apply them, and hand the frontend clean Terraform outputs. This UI is intentionally compact so it stays close to your Terraform model.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-muted p-5">
              <div className="flex flex-wrap gap-2">
                <Badge>Single source of truth: `ward_applications`</Badge>
                <Badge>Generated file: `frontend-managed.auto.tfvars.json`</Badge>
                <Badge>Plan/apply from backend</Badge>
              </div>
              <div className="mt-5 grid gap-3 text-sm text-neutral-700">
                <div>
                  <p className="font-medium">Current run</p>
                  <p>{selectedRun ? `${selectedRun.kind} / ${selectedRun.status}` : "No run selected yet"}</p>
                </div>
                <div>
                  <p className="font-medium">Apps in config</p>
                  <p>{config?.ward_applications.length ?? 0}</p>
                </div>
                <div>
                  <p className="font-medium">Status</p>
                  <p>{statusMessage || "Ready"}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">{errorMessage}</div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[320px_1fr_380px]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Application Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {(config?.ward_applications ?? []).map((application, index) => {
                  const typed = application as Record<string, unknown>;
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={`${String(typed.name)}-${index}`}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${isSelected ? "border-accent bg-muted" : "border-border bg-white hover:bg-muted"}`}
                      onClick={() => setSelectedIndex(index)}
                    >
                      <p className="font-medium">{String(typed.name ?? `Application ${index + 1}`)}</p>
                      <p className="mt-1 text-xs text-neutral-500">{String(typed.namespace ?? "No namespace")}</p>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2">
                <Button variant="primary" onClick={addAppFromTemplate}>Clone Selected Template</Button>
                <Button variant="ghost" onClick={addBlankApp}>Add Blank App</Button>
                <Button variant="danger" onClick={removeSelectedApp} disabled={(config?.ward_applications.length ?? 0) <= 1}>
                  Remove Selected App
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Editor</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-600">Application name</span>
                  <Input value={String((selectedApp as Record<string, unknown> | null)?.name ?? "")} onChange={(event) => updateSelectedAppField("name", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-600">Namespace</span>
                  <Input value={String((selectedApp as Record<string, unknown> | null)?.namespace ?? "")} onChange={(event) => updateSelectedAppField("namespace", event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-600">Replicas</span>
                  <Input
                    type="number"
                    min={1}
                    value={String((selectedApp as Record<string, unknown> | null)?.replicas ?? 1)}
                    onChange={(event) => updateSelectedAppField("replicas", Number(event.target.value))}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-neutral-600">Ingress host</span>
                  <Input
                    value={String((((selectedApp as Record<string, unknown> | null)?.ingress as Record<string, unknown> | undefined)?.host ?? ""))}
                    onChange={(event) => {
                      updateConfig((current) => {
                        const next = structuredClone(current);
                        const app = { ...(next.ward_applications[selectedIndex] as Record<string, unknown>) };
                        const ingress = { ...((app.ingress as Record<string, unknown> | undefined) ?? {}) };
                        ingress.host = event.target.value;
                        ingress.enabled = true;
                        app.ingress = ingress;
                        next.ward_applications[selectedIndex] = app;
                        return next;
                      });
                    }}
                  />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selected App JSON</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={appEditor} onChange={(event) => setAppEditor(event.target.value)} className="min-h-[360px]" spellCheck={false} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ward Subjects JSON</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={subjectsEditor} onChange={(event) => setSubjectsEditor(event.target.value)} className="min-h-[220px]" spellCheck={false} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button onClick={saveConfig} disabled={isBusy}>Save Managed Config</Button>
                <Button variant="secondary" onClick={startPlan} disabled={isBusy}>Plan Terraform Changes</Button>
                <Button variant="ghost" onClick={startApply} disabled={isBusy || selectedRun?.status !== "planned"}>Apply Saved Plan</Button>
                <Button variant="ghost" onClick={resetConfig} disabled={isBusy}>Reset to Template</Button>
                <Button variant="ghost" onClick={() => void refreshOutputs()}>Refresh Outputs</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Run History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${selectedRun?.id === run.id ? "border-accent bg-muted" : "border-border bg-white"}`}
                    onClick={() => void refreshRun(run.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{run.kind}</span>
                      <Badge>{run.status}</Badge>
                    </div>
                    <p className="mt-1 font-mono text-xs text-neutral-500">{run.id}</p>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Run Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={selectedRunLogs.join("\n")} readOnly className="min-h-[280px]" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Outputs</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={outputs ? pretty(outputs) : "{}"} readOnly className="min-h-[240px]" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
