import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#fff7ed",
        panel: "#fffcf6",
        border: "#ead8bf",
        text: "#35261c",
        muted: "#7c6a59",
        accent: "#b65f3a",
        warning: "#c47a14",
      },
    },
  },
  plugins: [],
};

export default config;
