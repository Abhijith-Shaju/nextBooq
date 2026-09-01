import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next 15.x still ships eslintrc-format configs, so FlatCompat
// bridges them into ESLint 9's flat config. This is the same shape the Next.js
// scaffold generates.
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
    ],
  },
  // Deliberately core-web-vitals only, not `next/typescript`. This codebase
  // had no lint config at all until now, so the TypeScript ruleset would land
  // a large backlog in one go — and `tsc --noEmit` already covers the type
  // errors that matter. Adding it later should be its own deliberate pass.
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
