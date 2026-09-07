/**
 * 체크 스크립트용 해석 훅.
 *
 * src/lib/*.ts 는 번들러 규칙대로 확장자 없이 상대 임포트한다("./cooccurrence").
 * Node ESM 은 확장자를 붙여주지 않아 --experimental-strip-types 로 직접 돌리면
 * ERR_MODULE_NOT_FOUND 가 난다. 여기서 .ts/.tsx 를 붙여 해석해 준다.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/<check>.mjs
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HAS_EXT = /\.[cm]?[jt]sx?$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !HAS_EXT.test(specifier) && context.parentURL?.startsWith("file:")) {
      const base = dirname(fileURLToPath(context.parentURL));
      for (const ext of [".ts", ".tsx"]) {
        const p = resolvePath(base, specifier + ext);
        if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});
