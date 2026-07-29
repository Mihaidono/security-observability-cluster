from __future__ import annotations

from typing import Any

from .models import RunStage, TerraformConfig


def core_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "kubernetes_version": config.core.kubernetes_version,
        "cluster_log_retention_in_days": config.core.cluster_log_retention_in_days,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
    }


def platform_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "kubernetes_version": config.core.kubernetes_version,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
    }


def applications_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
        "analysis_subjects": config.platform.analysis_subjects,
        "ward_applications": config.applications.ward_applications,
    }


def policies_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
        "analysis_subjects": config.platform.analysis_subjects,
        "kyverno_cluster_policies": config.policies.kyverno_cluster_policies,
        "tetragon_tracing_policies": config.policies.tetragon_tracing_policies,
    }


def generated_tfvars_payloads(config: TerraformConfig) -> dict[RunStage, dict[str, Any]]:
    return {
        RunStage.core: core_tfvars_payload(config),
        RunStage.platform: platform_tfvars_payload(config),
        RunStage.policies: policies_tfvars_payload(config),
        RunStage.applications: applications_tfvars_payload(config),
    }
