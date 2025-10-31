const plugin = require("tailwindcss/plugin");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  corePlugins: {
    preflight: false // keep global CSS intact for now
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ['"Cormorant Garamond"', "serif"]
      },
      colors: {
        ink: {
          900: "#060B17",
          800: "#0B1324",
          700: "#101C32"
        },
        aura: {
          cyan: "#4df4ff",
          violet: "#9b5cff",
          magenta: "#ff4fd8",
          gold: "#ffd36e"
        }
      },
      backgroundImage: {
        "looma-gradient":
          "linear-gradient(140deg, rgba(77,244,255,0.18), rgba(155,92,255,0.22), rgba(255,79,216,0.18))",
        "looma-accent":
          "radial-gradient(140% 160% at 10% -10%, rgba(157,92,255,0.28), transparent 60%), radial-gradient(120% 160% at 120% 120%, rgba(77,244,255,0.22), transparent 60%)"
      },
      boxShadow: {
        orb: "0 18px 40px rgba(155, 92, 255, 0.35)",
        "orb-strong": "0 30px 60px rgba(77, 244, 255, 0.32)"
      },
      keyframes: {
        "bg-shift": {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" }
        },
        "pulse-soft": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" }
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.45" },
          "75%": { transform: "scale(1.8)", opacity: "0.1" },
          "100%": { transform: "scale(2.1)", opacity: "0" }
        }
      },
      animation: {
        "bg-shift": "bg-shift 60s linear infinite",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite"
      }
    }
  },
  plugins: [
    plugin(({ addComponents, addUtilities, theme }) => {
      addComponents({
        ".orb-panel": {
          position: "relative",
          display: "grid",
          gap: "1.75rem",
          padding: "clamp(1.75rem, 3vw, 2.35rem)",
          borderRadius: "1.5rem",
          backgroundImage: theme("backgroundImage.looma-accent"),
          backgroundColor: "rgba(12, 16, 40, 0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(34px)",
          boxShadow: theme("boxShadow.orb"),
          isolation: "isolate"
        },
        ".status-capsule": {
          position: "relative",
          display: "grid",
          gap: "0.9rem",
          padding: "1.35rem 1.6rem",
          borderRadius: "1.5rem",
          background: "rgba(8,12,28,0.7)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 24px 40px rgba(9,10,26,0.45)",
          backdropFilter: "blur(32px)"
        },
        ".btn-glass": {
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          padding: "0.95rem 1.75rem",
          borderRadius: "999px",
          fontWeight: "600",
          color: "rgba(9,12,26,0.92)",
          backgroundImage: `linear-gradient(120deg, ${theme("colors.aura.violet")}, ${theme("colors.aura.cyan")})`,
          boxShadow: theme("boxShadow.orb"),
          cursor: "pointer",
          overflow: "hidden",
          transition: "transform 150ms ease, box-shadow 200ms ease"
        },
        ".btn-glass::after": {
          content: "''",
          position: "absolute",
          inset: "-40%",
          background:
            "radial-gradient(circle, rgba(255, 255, 255, 0.4), rgba(255,255,255,0))",
          transform: "scale(0)",
          opacity: "0",
          transition: "transform 400ms ease, opacity 400ms ease"
        },
        ".btn-glass:focus-visible": {
          outline: "none",
          boxShadow: `0 0 0 2px rgba(77, 244, 255, 0.6), ${theme("boxShadow.orb-strong")}`
        },
        ".btn-glass:hover": {
          transform: "translateY(-1px)",
          boxShadow: theme("boxShadow.orb-strong")
        },
        ".input-glass": {
          width: "100%",
          borderRadius: "1rem",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(8,12,28,0.45)",
          color: "rgba(244,247,255,0.9)",
          padding: "0.85rem 1.1rem",
          transition: "border-color 160ms ease, box-shadow 160ms ease"
        },
        ".input-glass:focus-visible": {
          outline: "none",
          borderColor: theme("colors.aura.cyan"),
          boxShadow: `0 0 0 2px rgba(77,244,255,0.3)`
        }
      });

      addUtilities(
        {
          ".hover-glow": {
            transition: "transform 150ms ease-out, box-shadow 200ms ease",
            "&:hover, &:focus-visible": {
              transform: "translateY(-2px)",
              boxShadow: theme("boxShadow.orb"),
              outline: "none"
            }
          },
          ".btn-glass:active::after": {
            transform: "scale(1.8)",
            opacity: "0.35",
            transition: "none"
          }
        },
        ["responsive", "hover", "focus"]
      );
    })
  ]
};
