# 🛡️ KubeGuardian: eBPF-Powered Forensic & Observability Lab

**An Infrastructure-as-Code (IaC) Framework for Behavioral Analysis, Workload Isolation, and Runtime Forensics.**

---

## 📖 Project Overview
**KubeGuardian** is a high-fidelity Security Observability Lab provisioned on AWS EKS. Unlike standard clusters, this environment is designed specifically for **DevSecOps Research** and **Behavioral Baselining**. 

By leveraging **Terraform** as the sole orchestrator (no GitOps controller overhead), the lab maintains a strictly deterministic state. It uses kernel-level **eBPF** probes to analyze applications within hardened "Wards" (Namespaces), providing deep visibility into process execution, file access, and network flows without sidecars or code modifications.

### 🧪 The "Ward" Philosophy
In this lab, applications are "subjects." Each subject is deployed into a **Ward**:
* **Locked Down:** Default-deny network policies (L3/L4/L7).
* **Enforced:** Pod Security Admission (PSA) set to `restricted` by default.
* **Observed:** Hooked into **Cilium Hubble** and **Tetragon** for real-time forensic recording.

---

## 🚀 Tech Stack (2026 Edition)
* **Orchestration:** [Terraform 1.7+](https://www.terraform.io/)
* **Cloud:** AWS EKS (v1.35 - Latest Stable)
* **Networking & Visibility:** [Cilium 1.19](https://cilium.io/) + Hubble (eBPF Service Map)
* **Runtime Forensics:** [Tetragon 0.12+](https://tetragon.io/) (Kernel-level process tracking)
* **Observability:** Grafana LGTM Stack (Loki, Grafana, Tempo, Mimir)
* **Security:** Kubernetes Native Pod Security Admissions (PSA)

---

## 📂 Project Structure
```text
.
├── versions.tf          # Provider constraints (AWS, K8s, Helm)
├── main.tf              # Core EKS, VPC, and Node Group logic
├── observability.tf     # eBPF Layer (Cilium, Tetragon, Grafana)
├── apps.tf              # Dynamic "Ward" generation & Isolation logic
├── variables.tf         # Input definitions
└── terraform.tfvars     # YOUR LAB CONFIGURATION (Add subjects here!)
```

---

## 🛠️ Getting Started

### 1. Prerequisites
* AWS CLI configured with Administrative permissions.
* Terraform 1.7+ installed.
* `kubectl` and `helm` installed for cluster interaction.

### 2. Configure your "Analysis Subjects"
Modify the `terraform.tfvars` file to define the namespaces and applications you want to monitor. This drives the dynamic creation of the "Wards."

```hcl
analysis_subjects = {
  "ward-banking-api" = {
    tier        = "production-mirror"
    description = "Analyzing behavioral baseline of the core banking engine."
  },
  "ward-legacy-java" = {
    tier        = "high-risk"
    description = "Monitoring for unexpected process spawning (Log4j style)."
  }
}
```

### 3. Deployment
```bash
# Initialize providers
terraform init

# Review the security posture
terraform plan

# Deploy the infrastructure and security stack
terraform apply
```

---

## 🔍 The Analysis Workflow

### A. Network Service Mapping (Hubble)
Visualize how your apps are communicating through the "Default-Deny" policies:
```bash
# View real-time flows in a specific ward
kubectl hubble observe --namespace ward-banking-api
```

### B. Forensic Process Tracking (Tetragon)
Tetragon records every system call and process executed. If a pod in your "Monitoring Zone" suddenly runs `curl` or tries to read sensitive files, it is logged at the kernel level.
```bash
# Watch process execution events across the cluster
kubectl logs -n kube-system -l app.kubernetes.io/name=tetragon -c export-stdout -f
```

### C. Behavioral Dashboard
Access the Grafana instance in the `monitoring-zone` namespace to view aggregated logs and security alerts.

---

## 🛡️ Security Posture
* **Zero Trust Networking:** Every namespace starts with a `kubernetes_network_policy` that denies all traffic unless explicitly whitelisted.
* **Restricted Profile:** The PSA `restricted` profile ensures pods cannot run as root, gain privilege escalation, or access host namespaces.
* **EKS Control Plane Logging:** Enabled by default via Terraform for audit trails.
* **eBPF Observability:** Detects "living-off-the-land" attacks (e.g., using `tar` or `netcat` inside a pod) that traditional logs miss.

---

## 🚧 Roadmap
- [ ] **Kyverno Integration:** Add Policy-as-Code to block non-compliant deployments.
- [ ] **Automated Attack Simulation:** Terraform-driven `null_resource` to trigger benign "malicious" behavior for testing.
- [ ] **Forensic Export:** Automate the export of Tetragon logs to S3 for long-term storage.

---

> **Disclaimer:** This project is for educational and research purposes. Ensure compliance with your local security policies when deploying to public cloud environments.

This README was all generated with AI so I can have some kind of starting documentation to guide the project. This is the idea of it atleast.