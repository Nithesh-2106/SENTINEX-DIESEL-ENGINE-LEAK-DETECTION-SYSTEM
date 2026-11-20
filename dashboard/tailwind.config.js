/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cat: {
          bg: "#0D1B2A",
          card: "#1B2D42",
          border: "#243447",
          yellow: "#FFB800",
        },
        hud: {
          bg0: "#070A12",
          bg1: "#0B1220",
          card: "#0E1A2E",
          border: "#1C2B45",
          cyan: "#22D3EE",
          purple: "#A855F7",
          pink: "#F472B6",
          lime: "#A3E635",
          amber: "#F59E0B",
          red: "#EF4444",
          textMuted: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        "flash-once": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.65" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239, 68, 68, 0.45)" },
          "50%": { boxShadow: "0 0 24px 4px rgba(239, 68, 68, 0.35)" },
        },
      },
      animation: {
        "flash-once": "flash-once 0.35s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "hud-float": "hud-float 6s ease-in-out infinite",
      },
      keyframes: {
        "hud-float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-3px)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
