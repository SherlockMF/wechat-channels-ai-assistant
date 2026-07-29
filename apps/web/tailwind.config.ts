import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211d",
        canvas: "#f4f6f3",
        line: "#dce2dd",
        pine: "#1e6650",
        amber: "#b87522",
        coral: "#c65345",
        fog: "#eef1ee"
      },
      boxShadow: {
        panel: "0 14px 38px rgba(29, 47, 39, 0.07)",
      },
      fontFamily: {
        sans: ["Aptos", "Segoe UI Variable", "Microsoft YaHei", "sans-serif"],
        display: ["Georgia", "STSong", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
