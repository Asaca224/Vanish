import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        panel: "#161a22",
        edge: "#232935",
        accent: "#5b8cff",
        good: "#2fbf71",
        warn: "#e0a83a",
        bad: "#e5484d",
        muted: "#8b93a1",
      },
    },
  },
  plugins: [],
};

export default config;
