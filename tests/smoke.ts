// Test harness: exercises the LatexCompiler's log parsing and the PreviewServer
// end-to-end with a fake PDF and a stubbed latexmk binary. Run with:
//   npx ts-node tests/smoke.ts
// or compile to JS and execute. Requires only Node std lib + the project's
// own modules.

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import { LatexCompiler } from "../src/compiler";
import { PreviewServer } from "../src/server";
import { VIEWER_HTML } from "../src/viewerHtml";
import { DEFAULT_SETTINGS } from "../src/types";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "latex-live-test-"));
const WS = path.join(TMP, "workspace");
const PROJ = path.join(TMP, "project");
fs.mkdirSync(WS, { recursive: true });
fs.mkdirSync(PROJ, { recursive: true });

// Create a fake project with a single .tex file.
fs.writeFileSync(
  path.join(PROJ, "main.tex"),
  "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n",
);

// Stub latexmk: a tiny shell script that emits a fake error log + writes a
// placeholder PDF so we can exercise both success and failure paths.
const stubDir = path.join(TMP, "bin");
fs.mkdirSync(stubDir);
const stubPath = path.join(stubDir, "latexmk");
fs.writeFileSync(
  stubPath,
  [
    "#!/usr/bin/env bash",
    "OUT=\"\"",
    "INPUT=\"\"",
    "for arg in \"$@\"; do",
    "  case \"$arg\" in",
    "    -output-directory=*) OUT=\"${arg#-output-directory=}\" ;;",
    "    *.tex) INPUT=\"$arg\" ;;",
    "  esac",
    "done",
    "mkdir -p \"$OUT\"",
    "base=\"$(basename \"$INPUT\" .tex)\"",
    "",
    "if [[ \"$MODE\" == \"fail\" ]]; then",
    "  echo './main.tex:3: ! Undefined control sequence.'",
    "  echo 'LaTeX Warning: Reference foo on input line 3 undefined.'",
    "  exit 1",
    "fi",
    "",
    "echo \"%PDF-1.4 stub\" > \"$OUT/$base.pdf\"",
    "echo 'fake synctex' | gzip > \"$OUT/$base.synctex.gz\"",
    "echo ok",
    "",
  ].join("\n"),
);
fs.chmodSync(stubPath, 0o755);

function newSettings(extra: Partial<typeof DEFAULT_SETTINGS> = {}) {
  return {
    ...DEFAULT_SETTINGS,
    latexmkPath: stubPath,
    ...extra,
  };
}

async function testCompileSuccess() {
  const settings = newSettings();
  const compiler = new LatexCompiler(settings);
  const result = await compiler.compile({
    rootTexPath: path.join(PROJ, "main.tex"),
    projectDir: PROJ,
    workspaceRoot: WS,
  });
  assert(result.success, "compile should succeed");
  assert(result.pdfPath && fs.existsSync(result.pdfPath), "pdf should exist");
  assert(result.synctexPath && fs.existsSync(result.synctexPath), "synctex should exist");
  assert(result.errors.length === 0, `no errors, got ${result.errors.length}`);
  console.log("  ✓ compile success path");
}

async function testCompileFailure() {
  const settings = newSettings();
  const compiler = new LatexCompiler(settings);
  // Re-run with MODE=fail by mutating env via a wrapper.
  process.env.MODE = "fail";
  try {
    const result = await compiler.compile({
      rootTexPath: path.join(PROJ, "main.tex"),
      projectDir: PROJ,
      workspaceRoot: WS,
    });
    assert(!result.success || result.errors.length > 0, "should report errors");
    assert(result.errors.length >= 1, `expected ≥1 error, got ${result.errors.length}`);
    const e = result.errors[0];
    assert(e.line === 2, `error line should be 2 (0-indexed), got ${e.line}`);
    assert(e.message.includes("Undefined control sequence"), "message preserved");
    assert(e.file.startsWith(PROJ), `file resolved into project dir: ${e.file}`);
    assert(result.warnings.length >= 1, "warning detected");
    console.log("  ✓ compile failure path (errors parsed)");
  } finally {
    delete process.env.MODE;
  }
}

async function testServer() {
  const server = new PreviewServer("127.0.0.1", VIEWER_HTML);
  let clickReceived: any = null;
  server.onPdfClick = (loc) => (clickReceived = loc);
  const port = await server.start(0);
  const base = `http://127.0.0.1:${port}`;

  // GET /
  const indexBody = await fetchText(`${base}/`);
  assert(indexBody.includes("LaTeX Live Preview"), "viewer html served");

  // GET /pdf when none uploaded → 404
  const status404 = await fetchStatus(`${base}/pdf`);
  assert(status404 === 404, `no pdf returns 404, got ${status404}`);

  // updatePdf → /pdf serves it
  const fakePdf = path.join(TMP, "fake.pdf");
  fs.writeFileSync(fakePdf, "%PDF-1.4\nfake\n");
  server.updatePdf(fakePdf);
  const pdfBody = await fetchText(`${base}/pdf`);
  assert(pdfBody.startsWith("%PDF-1.4"), "pdf bytes streamed");

  // POST /click
  const res = await postJson(`${base}/click`, { page: 1, x: 100, y: 200 });
  assert(res.status === 204, `click 204, got ${res.status}`);
  assert(clickReceived !== null, "click callback fired");
  assert(clickReceived.page === 1, "click page parsed");

  await server.stop();
  console.log("  ✓ preview server endpoints");
}

async function main() {
  console.log("Running smoke tests…");
  await testCompileSuccess();
  await testCompileFailure();
  await testServer();
  // Cleanup
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log("All tests passed.");
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("ASSERT: " + msg);
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c.toString()));
      res.on("end", () => resolve(buf));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function fetchStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on("error", reject);
  });
}

function postJson(url: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: buf }),
        );
      },
    );
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}
