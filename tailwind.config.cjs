/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,svelte,ts}"
  ],
  corePlugins: {
    preflight: false // keep global CSS intact for now
  },
  theme: {
    extend: {
      colors: {
        glass: "rgba(255,255,255,0.06)"
      },
      boxShadow: {
        glass: "0 20px 60px rgba(0,0,0,0.45)"
      },
      backgroundImage: {
        'glass-radial': "radial-gradient(120% 120% at 0% 0%, rgba(255,255,255,0.10), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.02) 70%)"
      }
    }
  },
  plugins: []
};
