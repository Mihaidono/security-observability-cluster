## [0.9.2](https://github.com/Mihaidono/security-observability-cluster/compare/v0.9.1...v0.9.2) (2026-08-05)

### Bug Fixes

* **ci:** for_each issue for gateway api standard manifest ([e4f6a74](https://github.com/Mihaidono/security-observability-cluster/commit/e4f6a74ee4e20baaad665721c4453e9239623c34))

## [0.9.1](https://github.com/Mihaidono/security-observability-cluster/compare/v0.9.0...v0.9.1) (2026-08-05)

### Bug Fixes

* **repo:** session time was treated as variable but was hardcoded ([af50327](https://github.com/Mihaidono/security-observability-cluster/commit/af50327e56446185aeeb6c917130ef5fae488cb1))

## [0.9.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.5...v0.9.0) (2026-07-30)

### Features

* **repo:** improve auth UI and deployment hardening ([5a14703](https://github.com/Mihaidono/security-observability-cluster/commit/5a14703afa2375780b2528472d2709ce1f0a3ba5))

## [0.8.5](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.4...v0.8.5) (2026-07-27)

### Bug Fixes

* **docs:** referenced a local file I wasn't going to push ([520d87a](https://github.com/Mihaidono/security-observability-cluster/commit/520d87ac663a7215674e6405e77136c1a4ddae4b))

## [0.8.4](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.3...v0.8.4) (2026-07-27)

### Bug Fixes

* **repo:** fixed documentation split, put it all in order in the same spot ([8781a08](https://github.com/Mihaidono/security-observability-cluster/commit/8781a0812a0d4a2e08e7c8dddb694be4d4017a89))

## [0.8.3](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.2...v0.8.3) (2026-07-27)

### Bug Fixes

* **backend:** old bad imports fixed ([bfe8785](https://github.com/Mihaidono/security-observability-cluster/commit/bfe8785b90c1b4920072584c186a8a122fb02a0e))

## [0.8.2](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.1...v0.8.2) (2026-07-27)

### Bug Fixes

* **ci:** concurrency wasn't present in release jobs ([9317df2](https://github.com/Mihaidono/security-observability-cluster/commit/9317df26790e26007954e16633977ac3b2082c4d))

## [0.8.1](https://github.com/Mihaidono/security-observability-cluster/compare/v0.8.0...v0.8.1) (2026-07-27)

### Bug Fixes

* **ci:** terraform skipped core even if there were things to apply so platform would fail as well ([eb11ba6](https://github.com/Mihaidono/security-observability-cluster/commit/eb11ba6b19709734e1904420194a7f5fff39683c))

## [0.8.0](https://github.com/Mihaidono/security-observability-cluster/compare/v0.7.0...v0.8.0) (2026-07-22)

### Features

* **repo:** update control plane ui and policies stage configuration ([edc9e10](https://github.com/Mihaidono/security-observability-cluster/commit/edc9e10203dccdf333dfb2710ac436dba15e613c))

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
