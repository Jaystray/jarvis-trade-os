import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050712",
        panel: "#0a1020",
        grid: "#16213d",
        cyanline: "#43d9ff",
        plasma: "#a7f3d0",
        warning: "#f8d66d"
      },
      boxShadow: {
        glow: "0 0 24px rgba(67, 217, 255, 0.24)"
      }
    }
  },
  plugins: []
};

export default config;
