import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bud: {
          bg: "#0b1508",
          surface: "#14210f",
          raised: "#1c2d15",
          border: "#2a4220",
          primary: "#4ade80",
          primaryDark: "#22c55e",
          accent: "#a855f7",
          muted: "#8aa383",
        },
      },
    },
  },
  plugins: [],
};

export default config;
