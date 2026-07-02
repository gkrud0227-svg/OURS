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
  ]),
  {
    rules: {
      // 로컬스토리지 하이드레이션 및 외부 상태(스토어/URL) 동기화를 위해
      // 마운트 시 effect 안에서 setState 하는 패턴을 의도적으로 사용한다.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/server/instagram-local/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
]);

export default eslintConfig;
