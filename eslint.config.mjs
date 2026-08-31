import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
  ]),
  {
    rules: {
      // El proyecto se sirve desde Cloudflare Workers sin el optimizador de
      // imágenes de Next: `next/image` no aporta aquí y añadiría un loader que
      // no existe en este runtime. Los assets de marca ya van dimensionados y
      // optimizados por scripts/build-brand-assets.mjs.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
