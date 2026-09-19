import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Rayons modérés (brand v5 "Instrument") : plus de capsules ni de
      // grands arrondis. `rounded-full` reste réservé aux points/LED/rings.
      borderRadius: {
        lg: "12px",
        xl: "12px",
        "2xl": "16px",
        "3xl": "16px",
      },
      fontFamily: {
        sans: ["var(--font-instrument-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-bricolage)", "var(--font-instrument-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
