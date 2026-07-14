## [0.7.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.6.3...v0.7.0) (2026-07-14)

### Features

* **infra:** separated platform and policy again, implementing cilium focused networking in aws ([1a85ba3](https://github.com/Mihaidono/security-observability-cluster/commit/1a85ba374355ce8202f6f516444e332ce6ba707e))

### Bug Fixes

* **infra:** cilium now handles creation properly, taints stopping spin up solved ([f0adca1](https://github.com/Mihaidono/security-observability-cluster/commit/f0adca1daea453636160709d7caf27e728b5493a))

## [0.6.3](https://github.com/Mihaidono/security-observability-cluster/compare/v0.6.2...v0.6.3) (2026-07-13)

### Bug Fixes

* **repo:** structured infra folder, brought back separated policies stage ([1cf2b02](https://github.com/Mihaidono/security-observability-cluster/commit/1cf2b022006c2dced3822a67d04789ba3051fcd2))

## [0.6.2](https://github.com/Mihaidono/security-observability-cluster/compare/v0.6.1...v0.6.2) (2026-07-10)

### Bug Fixes

* **platform:** policies are now a chart to solve dependency issue in tf apply ([e9503c4](https://github.com/Mihaidono/security-observability-cluster/commit/e9503c42126641e0e01fd12f045fe096003fbe52))

## [0.6.1](https://github.com/Mihaidono/security-observability-cluster/compare/v0.6.0...v0.6.1) (2026-07-10)

### Bug Fixes

* **docker:** trivy issues addressed ([949689b](https://github.com/Mihaidono/security-observability-cluster/commit/949689b960bcbe1afb988de2c31df94e22941e83))

## [0.6.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.5.0...v0.6.0) (2026-07-10)

### Features

* **backend:** split backend logic and deploy separate tf runner service ([d9480bf](https://github.com/Mihaidono/security-observability-cluster/commit/d9480bf0729663aa929663cb3069a2407e847dca))
* **docker:** fe reverse proxy, changed images, added control plane in cluster ([8f15d57](https://github.com/Mihaidono/security-observability-cluster/commit/8f15d57bd26d85c16d3a3b77b2ef6f0215123b40))

## [0.5.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.4.1...v0.5.0) (2026-07-10)

### Features

* **docker:** split dockerfile into dev and prod variants ([2e1b5b9](https://github.com/Mihaidono/security-observability-cluster/commit/2e1b5b90f7ec35bd0e2dd5cfd4bcc7c95fbbc72a))

## [0.4.1](https://github.com/Mihaidono/security-observability-cluster/compare/v0.4.0...v0.4.1) (2026-07-10)

### Bug Fixes

* **infra:** moved ecr from core to bootstrap because of price and re-applies ([49b9fcf](https://github.com/Mihaidono/security-observability-cluster/commit/49b9fcfee1475163ed509be725f70d4376c14965))

## [0.4.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.3.0...v0.4.0) (2026-07-10)

### Features

* **infra:** separated variables per root module ([97aaf42](https://github.com/Mihaidono/security-observability-cluster/commit/97aaf427bd793c53b08f4946f167e1d482220025))

## [0.3.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.2.0...v0.3.0) (2026-07-09)

### Features

* **ci:** separated container scan from image building into its own step ([f35f38b](https://github.com/Mihaidono/security-observability-cluster/commit/f35f38b3624f3f36d22dc5615c65d8abb35c64cd))
* **infra:** united platform and policies, added postgres as chosen db, corrected trivy ([1a47942](https://github.com/Mihaidono/security-observability-cluster/commit/1a47942100a3f1f99dff5442499fd816139dc0eb))

## [0.2.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.1.0...v0.2.0) (2026-07-09)

### Features

* **ci:** adding tooling and workflows for checking and enforcing clean code and commits ([cae668f](https://github.com/Mihaidono/security-observability-cluster/commit/cae668fabb71c6147879605afcbbc0cbaec6a0f5))
* **repo:** formatted all the files so pre-commit passes all checks ([c80789f](https://github.com/Mihaidono/security-observability-cluster/commit/c80789f8b56ca275860a789c81fb0302ee011247))
