import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f4f1ea",
        foreground: "#171717",
        card: "#fbfaf6",
        border: "#d7d1c4",
        muted: "#ece7dd",
        accent: "#0d6b5f",
        accentForeground: "#f5fffd",
        warning: "#b45309",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(20, 22, 20, 0.08)",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
