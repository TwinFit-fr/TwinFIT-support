import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `const { dropped: _x, ...rest } = obj` is how fields are left out of a copy.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  globalIgnores(["src/lib/catalog/crud.js", "src/lib/catalog/graphql.cjs"]),
]);

export default eslintConfig;
