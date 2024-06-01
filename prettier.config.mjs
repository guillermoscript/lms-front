import { Config } from "prettier";
// prettier.config.js, .prettierrc.js, prettier.config.mjs, or .prettierrc.mjs
// @see https://prettier.io/docs/en/configuration.html
/** @type {Config} */
const config = {
  trailingComma: "es5",
  tabWidth: 4,
  semi: true,
  singleQuote: false,
  useTabs: false,
}

export default config;
