import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const backendProxyTarget =
    env.VITE_DEV_BACKEND_PROXY_TARGET ?? "http://127.0.0.1:8000";
  const keycloakProxyTarget =
    env.VITE_DEV_KEYCLOAK_PROXY_TARGET ?? "http://127.0.0.1:8081";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: backendProxyTarget,
          changeOrigin: false,
          ws: true,
        },
        "/auth": {
          target: keycloakProxyTarget,
          changeOrigin: false,
        },
      },
    },
  };
});
