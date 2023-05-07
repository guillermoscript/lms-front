/** @type {import('tailwindcss').Config} */
export const content = [
  "./app/**/*.{js,ts,jsx,tsx,mdx}",
  "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  "./components/**/*.{js,ts,jsx,tsx,mdx}",

  // Or if using `src` directory:
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
];
export const theme = {
  extend: {},
};
export const plugins = [require("daisyui")];
export const daisyui = {
  styled: true,
  themes: [
    "winter",
    "night"
    /*, {
    mytheme: {
    "primary": "#85eafc",
    "secondary": "#a699ef",
    "accent": "#5fe050",
    "neutral": "#222C39",
    "base-100": "#292B42",
    "info": "#41B5E6",
    "success": "#54DEA9",
    "warning": "#F9D862",
    "error": "#F9244B",
      },
  },*/ 
  ],
  base: true,
  utils: true,
  logs: true,
  tl: false,
  prefix: "",
  darkTheme: "night",
};

