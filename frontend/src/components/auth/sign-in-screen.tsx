import { BrandGlyph, MoonIcon, SunIcon } from "../workspace/chrome";
import { Button } from "../ui/button";

type ThemeMode = "light" | "dark";

export function SignInScreen({
  busy,
  errorMessage,
  onSignIn,
  onToggleTheme,
  themeMode,
}: {
  busy: boolean;
  errorMessage: string;
  onSignIn: () => void;
  onToggleTheme: () => void;
  themeMode: ThemeMode;
}) {
  return (
    <div className="app-shell flex min-h-screen items-center justify-center py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="brand-block relative overflow-hidden rounded-[2.4rem] px-6 py-7 sm:px-8 sm:py-9">
          <div className="absolute inset-x-0 top-0 h-px bg-white/12" />
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-white text-[#191308] shadow-[0_18px_38px_rgb(0_0_0_/_0.18)]">
                <BrandGlyph className="h-6 w-6" />
              </div>
              <div>
                <p className="text-base font-semibold tracking-tight text-white">
                  Isolens
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-white/58">
                  Control Plane
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white/82 transition duration-200 hover:-translate-y-0.5 hover:bg-white/12"
              aria-label={
                themeMode === "light" ? "Enable dark mode" : "Enable light mode"
              }
              title={
                themeMode === "light" ? "Enable dark mode" : "Enable light mode"
              }
            >
              {themeMode === "light" ? (
                <MoonIcon className="h-5 w-5" />
              ) : (
                <SunIcon className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="mt-14 max-w-2xl space-y-6">
            <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
              Build and operate isolated Kubernetes scenarios from one control
              plane.
            </h1>
            <p className="max-w-lg text-base leading-7 text-white/72">
              Isolens is built for controlled workload exposure, namespace-level
              isolation, policy experiments, and observability-driven validation
              across shared cluster foundations and user-defined application
              environments.
            </p>
          </div>

          <div className="mt-12 rounded-[1.7rem] border border-white/10 bg-white/7 px-5 py-5">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/48">
              Environment focus
            </p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/76">
              Use the workspace to define wards, shape exposure, apply Kyverno
              and Tetragon policies, and inspect how traffic and runtime
              behavior change as scenarios evolve.
            </p>
          </div>
        </section>

        <section className="panel flex items-center rounded-[2.4rem]">
          <div className="w-full px-6 py-7 sm:px-8 sm:py-9">
            {errorMessage ? (
              <div className="mb-5 rounded-[1.45rem] border border-warning/28 bg-warning/10 px-4 py-3 text-sm text-foreground">
                {errorMessage}
              </div>
            ) : null}

            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.32em] text-neutral-500">
                  Access
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  Sign in to continue
                </h2>
                <p className="max-w-md text-sm leading-7 text-neutral-500">
                  Continue with your organization identity and return here once
                  the session is established.
                </p>
              </div>

              <div className="surface-soft rounded-[1.6rem] px-4 py-4">
                <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                  Sign-in
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground/84">
                  Keycloak and the control-plane realm are bootstrapped with the
                  environment. Continue with a provisioned account to enter the
                  workspace.
                </p>
              </div>

              <Button
                className="w-full justify-center py-3 text-base"
                disabled={busy}
                onClick={onSignIn}
              >
                {busy ? "Redirecting..." : "Continue with Keycloak"}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
