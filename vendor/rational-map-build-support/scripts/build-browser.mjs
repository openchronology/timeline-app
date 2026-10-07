import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const license = await readFile(new URL("../node_modules/fraction.js/LICENSE", import.meta.url), "utf8");
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  outfile: "dist/browser.js",
  banner: { js: "/*! Fraction.js 5.3.4\n" + license + "\n*/" },
});
