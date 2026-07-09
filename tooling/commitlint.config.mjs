export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "repo",
        "backend",
        "frontend",
        "infra",
        "core",
        "platform",
        "policies",
        "docker",
        "ci",
        "docs",
        "deps",
        "release",
        "security"
      ]
    ],
    "scope-case": [2, "always", "lower-case"],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]]
  }
};
