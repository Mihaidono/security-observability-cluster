import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#dddbf1",
        foreground: "#383f51",
        card: "#f6f4fb",
        border: "#ab9f9d",
        muted: "#d1beb0",
        accent: "#3c4f76",
        accentForeground: "#f8f7fc",
        warning: "#8f7673",
      },
      boxShadow: {
        panel: "0 22px 48px rgba(56, 63, 81, 0.16)",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "'IBM Plex Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
