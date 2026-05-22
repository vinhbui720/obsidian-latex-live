import { SyncTexParser } from "../src/syncTeX";
import * as fs from "fs";

(async () => {
  const s = new SyncTexParser();
  const synctex = "/home/vinh/.cache/obsidian-latex-live/ce1e4a6daa3b/build/main.synctex.gz";
  // Use the actual project path (recorded in synctex)
  const grep = require("child_process").execSync(`zcat ${synctex} | grep -E '^Input:.*main.tex' | head -1`, { encoding: "utf8" });
  const realFile = grep.split(":").slice(2).join(":").trim();
  console.log("Real file path:", realFile);
  // source → PDF
  const pdfLoc = await s.sourceToPdf(synctex, realFile, 5);
  console.log("source → pdf (line 6):", pdfLoc);
  if (pdfLoc) {
    const srcLoc = await s.pdfToSource(synctex, pdfLoc.page, pdfLoc.x, pdfLoc.y);
    console.log("pdf → source:", srcLoc);
  }
})();
