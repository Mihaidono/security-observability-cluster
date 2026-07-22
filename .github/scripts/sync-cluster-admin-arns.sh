#!/usr/bin/env bash

set -euo pipefail

[[ -n "${AWS_ROLE_TO_ASSUME:-}" ]] || {
  echo "AWS_ROLE_TO_ASSUME must be a non-empty IAM role ARN" >&2
  exit 1
}

cluster_admins="$(
  jq -cn \
    --arg assume_role "${AWS_ROLE_TO_ASSUME}" \
    --argjson user_arns "${CLUSTER_ADMIN_USER_ARNS_JSON:-[]}" \
    '
      if ($user_arns | type) != "array" then
        error("CLUSTER_ADMIN_USER_ARNS_JSON must be a JSON array of IAM principal ARNs")
      else
        [$assume_role]
        + ($user_arns | map(select(type == "string") | gsub("^\\s+|\\s+$"; "") | select(length > 0)))
        | unique
      end
    '
)"

for relative_path in \
  infrastructure/stages/core/managed.auto.tfvars.json \
  infrastructure/stages/platform/managed.auto.tfvars.json \
  infrastructure/stages/policies/managed.auto.tfvars.json \
  infrastructure/stages/applications/managed.auto.tfvars.json; do
  tmp_file="$(mktemp)"
  jq --argjson cluster_admins "${cluster_admins}" \
    '.cluster_admin_principal_arns = $cluster_admins' \
    "${relative_path}" > "${tmp_file}"
  mv "${tmp_file}" "${relative_path}"
  echo "updated ${relative_path}"
done
