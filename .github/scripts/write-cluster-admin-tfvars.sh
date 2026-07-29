#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-path>" >&2
  exit 1
fi

output_path="$1"

if [[ -z "${AWS_ROLE_TO_ASSUME:-}" ]]; then
  echo "AWS_ROLE_TO_ASSUME must be a non-empty IAM role ARN" >&2
  exit 1
fi

jq -cn \
  --arg assume_role "${AWS_ROLE_TO_ASSUME}" \
  --argjson user_arns "${CLUSTER_ADMIN_USER_ARNS_JSON:-[]}" \
  '
    if ($user_arns | type) != "array" then
      error("CLUSTER_ADMIN_USER_ARNS_JSON must be a JSON array of IAM principal ARNs")
    else
      {
        cluster_admin_principal_arns:
          ([$assume_role] + ($user_arns | map(select(type == "string") | gsub("^\\s+|\\s+$"; "") | select(length > 0))) | unique)
      }
    end
  ' > "${output_path}"
