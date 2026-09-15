import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0A0A0C",
          50: "#0A0A0C",
          100: "#0F0F12",
          200: "#121214",
          300: "#1A1A1F",
          400: "#222228",
          500: "#2A2A32",
        },
        aura: {
          DEFAULT: "#A855F7",
          50: "#FAF5FF",
          100: "#F3E8FF",
          200: "#E9D5FF",
          300: "#D8B4FE",
          400: "#C084FC",
          500: "#A855F7",
          600: "#9333EA",
          700: "#7E22CE",
          800: "#6B21A8",
          900: "#581C87",
        },
        silver: {
          DEFAULT: "#9CA3AF",
          dim: "#6B7280",
          bright: "#D1D5DB",
        },
      },
      boxShadow: {
        aura: "0 0 24px 0 rgba(168,85,247,0.35), 0 0 64px 0 rgba(147,51,234,0.18)",
        "aura-sm": "0 0 12px 0 rgba(168,85,247,0.45)",
        "aura-lg": "0 0 48px 4px rgba(168,85,247,0.4), 0 0 120px 8px rgba(147,51,234,0.25)",
        "cta":
          "0 1px 0 0 rgba(255,255,255,0.22) inset, 0 8px 24px -6px rgba(168,85,247,0.55), 0 2px 8px -2px rgba(147,51,234,0.45)",
        "cta-lg":
          "0 1px 0 0 rgba(255,255,255,0.25) inset, 0 14px 44px -8px rgba(168,85,247,0.65), 0 4px 14px -2px rgba(147,51,234,0.5)",
        glass: "inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "aura-radial":
          "radial-gradient(1200px 500px at 50% -10%, rgba(147,51,234,0.28), rgba(10,10,12,0) 60%)",
        "aura-btn":
          "linear-gradient(135deg, #A855F7 0%, #9333EA 55%, #7E22CE 100%)",
        "aura-cta":
          "linear-gradient(135deg, #C084FC 0%, #A855F7 38%, #9333EA 68%, #6B21A8 100%)",
        "aura-soft":
          "linear-gradient(180deg, rgba(168,85,247,0.14) 0%, rgba(18,18,20,0) 60%)",
      },
      keyframes: {
        "pulse-aura": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "float-y": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        "glow-breathe": {
          "0%, 100%": { boxShadow: "0 0 18px 0 rgba(168,85,247,0.35)" },
          "50%": { boxShadow: "0 0 42px 4px rgba(168,85,247,0.6)" },
        },
      },
      animation: {
        "pulse-aura": "pulse-aura 3.2s ease-in-out infinite",
        "spin-slow": "spin-slow 14s linear infinite",
        "float-y": "float-y 5s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
        "glow-breathe": "glow-breathe 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
