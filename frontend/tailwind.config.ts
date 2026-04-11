import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#09111b",
        foreground: "#e5edf7",
        card: "#0f1724",
        border: "#223041",
        muted: "#152131",
        accent: "#38bdf8",
        accentForeground: "#03121d",
        warning: "#f97316",
      },
      boxShadow: {
        panel: "0 24px 60px rgba(2, 6, 23, 0.45)",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
