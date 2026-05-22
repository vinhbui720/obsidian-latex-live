import { LatexCompiler } from "../src/compiler";
import { DEFAULT_SETTINGS } from "../src/types";

(async () => {
  const c = new LatexCompiler(DEFAULT_SETTINGS);
  const r = await c.compile({
    rootTexPath: "/tmp/tmp.4JpzMgLCYV/main.tex",
    projectDir: "/tmp/tmp.4JpzMgLCYV",
    workspaceRoot: process.env.HOME + "/.cache/obsidian-latex-live",
  });
  console.log("success:", r.success);
  console.log("duration:", r.durationMs, "ms");
  console.log("pdf:", r.pdfPath);
  console.log("synctex:", r.synctexPath);
  console.log("errors:", r.errors.length);
  // Second compile (should be fast = incremental)
  const r2 = await c.compile({
    rootTexPath: "/tmp/tmp.4JpzMgLCYV/main.tex",
    projectDir: "/tmp/tmp.4JpzMgLCYV",
    workspaceRoot: process.env.HOME + "/.cache/obsidian-latex-live",
  });
  console.log("\n2nd compile (incremental):");
  console.log("duration:", r2.durationMs, "ms");
})();
