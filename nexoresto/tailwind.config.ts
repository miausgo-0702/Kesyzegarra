import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05070a",
        panel: "#0c1117",
        card: "#111821",
        raised: "#16202b",
        line: "#1e2a36",
        ink: "#e8eef5",
        mute: "#8a97a6",
        dim: "#56626f",
        up: "#1ee08f",
        down: "#ff4d5e",
        warn: "#f5b83d",
        info: "#4c9dff",
        violet: "#a78bfa",
        neon: "#00ff66",
        crash: "#ff3333",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        pulseRing: { "0%": { boxShadow: "0 0 0 0 rgba(255,77,94,.55)" }, "100%": { boxShadow: "0 0 0 14px rgba(255,77,94,0)" } },
        flashUp: { "0%": { backgroundColor: "rgba(30,224,143,.28)" }, "100%": { backgroundColor: "transparent" } },
        flashDown: { "0%": { backgroundColor: "rgba(255,77,94,.28)" }, "100%": { backgroundColor: "transparent" } },
        slideIn: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "none" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        popIn: { "0%": { opacity: "0", transform: "scale(0.96) translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        sheetIn: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "none" } },
        toastIn: { "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" }, "100%": { opacity: "1", transform: "none" } },
      },
      transitionTimingFunction: { out: "cubic-bezier(0.23,1,0.32,1)" },
      animation: {
        marquee: "marquee 60s linear infinite",
        blink: "blink 1s ease-in-out infinite",
        pulseRing: "pulseRing 1.2s ease-out infinite",
        flashUp: "flashUp 1.4s ease-out",
        flashDown: "flashDown 1.4s ease-out",
        slideIn: "slideIn .22s cubic-bezier(0.23,1,0.32,1)",
        fadeIn: "fadeIn .18s cubic-bezier(0.23,1,0.32,1)",
        popIn: "popIn .22s cubic-bezier(0.23,1,0.32,1)",
        sheetIn: "sheetIn .32s cubic-bezier(0.32,0.72,0,1)",
        toastIn: "toastIn .26s cubic-bezier(0.23,1,0.32,1)",
      },
    },
  },
  plugins: [],
};
export default config;
