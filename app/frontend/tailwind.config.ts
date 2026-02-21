import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0a0a0f",
          1: "#12121a",
          2: "#1a1a26",
          3: "#222233",
        },
        accent: {
          blue: "#3b82f6",
          green: "#22c55e",
          red: "#ef4444",
          amber: "#f59e0b",
        },
        tier: {
          bronze: "#CD7F32",
          silver: "#C0C0C0",
          gold: "#FFD700",
          diamond: "#B9F2FF",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
