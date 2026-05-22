import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { mkdirSync } from "fs";

const prod = process.argv[2] === "production";

// Vault plugin directory - direct output for fast dev loop
const VAULT_PLUGIN_DIR =
  "/home/vinh/Desktop/v_note/obsidian_note/.obsidian/plugins/obsidian-latex-live";

const outDir = prod ? "./dist" : VAULT_PLUGIN_DIR;
mkdirSync(outDir, { recursive: true });

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  outfile: `${outDir}/main.js`,
  platform: "node",
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  console.log("Production build complete:", `${outDir}/main.js`);
  process.exit(0);
} else {
  console.log("Watching for changes, output:", `${outDir}/main.js`);
  await context.watch();
}
